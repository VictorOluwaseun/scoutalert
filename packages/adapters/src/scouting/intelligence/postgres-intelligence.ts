import {
  estimateIntelligenceCost,
  intelligenceAttemptReserveMicrousd,
} from "./usage-cost.js";
import { createHash, randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import {
  IntelligenceRepository,
  type IntelligenceTask,
  type IntelligenceResult,
  type TaskClaim,
  type RunContext,
  type Posting,
  type PostingAnalysis,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Canonical JSON avoids cache misses when PostgreSQL JSONB returns object keys in a different order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

/** Stores reusable public extraction and strictly owner-scoped fit; leases and request admission are atomic across workers. */
export class PostgresIntelligenceRepository extends IntelligenceRepository {
  /** Daily requests cap worst-case spending; a maximum of two active provider calls limits account pressure. */
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly dailyRequests: number,
    private readonly dailyMicrousd = 5_000_000,
  ) {
    super();
  }

  /** Includes immutable source/brief contents and provider policy in identity; no private material is copied to public extraction rows. */
  private identity(task: IntelligenceTask): string {
    const request = task.context?.request;

    return createHash("sha256")
      .update(
        JSON.stringify(
          canonical({
            kind: task.kind,
            configuration: task.configuration,
            evidenceEpoch: task.evidenceEpoch,
            postingId: task.posting.id,
            version: task.posting.version,
            fingerprint: task.posting.fingerprint,
            private:
              task.kind === "fit"
                ? {
                    owner: request?.ownerId,
                    scout: request?.scoutId,
                    version: request?.version,
                    search: task.context?.search,
                    analysis: task.analysis,
                  }
                : null,
          }),
        ),
      )
      .digest("hex");
  }

  /** Rejects stale/foreign input before cached reads as well as before paid provider calls. */
  private async current(
    tx: Transaction<ScoutAlertDatabase>,
    task: IntelligenceTask,
  ): Promise<boolean> {
    const posting = await tx
      .selectFrom("opportunity_postings")
      .select("id")
      .where("id", "=", task.posting.id)
      .where("version", "=", task.posting.version)
      .where("fingerprint", "=", task.posting.fingerprint)
      .where("open", "=", true)
      .executeTakeFirst();

    if (!posting) {
      return false;
    }

    if (task.kind !== "fit") {
      return true;
    }

    const context = task.context;

    if (!context || !task.analysis) {
      return false;
    }

    const scout = await tx
      .selectFrom("scouts")
      .select("id")
      .where("id", "=", context.request.scoutId)
      .where("owner_id", "=", context.request.ownerId)
      .where("version", "=", context.request.version)
      .where("status", "=", "active")
      .where(
        "search",
        "=",
        sql<
          import("@repo/core/onboarding").SearchDraft
        >`${JSON.stringify(context.search)}::jsonb`,
      )
      .executeTakeFirst();

    return !!scout;
  }

  /** Freezes a bounded run batch while reusing successful and rejected private verdicts across later runs. */
  async plan(context: RunContext, postings: Posting[], configuration: string) {
    return this.db.transaction().execute(async (tx) => {
      const scout = await tx
        .selectFrom("scouts")
        .select("id")
        .where("id", "=", context.request.scoutId)
        .where("owner_id", "=", context.request.ownerId)
        .where("version", "=", context.request.version)
        .where("status", "=", "active")
        .where(
          "search",
          "=",
          sql<
            import("@repo/core/onboarding").SearchDraft
          >`${JSON.stringify(context.search)}::jsonb`,
        )
        .executeTakeFirst();

      if (!scout) {
        return { selected: [], results: [] };
      }

      const captured = postings.map((posting) => ({
        id: posting.id,
        version: posting.version,
      }));
      const found = await sql<{
        postingId: string;
        result: IntelligenceResult & { kind: "fit" };
        analysis: PostingAnalysis;
      }>`
        SELECT DISTINCT ON(t.posting_id) t.posting_id AS "postingId",t.result,e.result->'analysis' AS analysis FROM intelligence_tasks t
        JOIN intelligence_tasks e ON e.id=t.analysis_task_id AND e.status='ready'
        JOIN jsonb_to_recordset(${JSON.stringify(captured)}::jsonb) AS p(id text,version integer) ON p.id=t.posting_id AND p.version=t.posting_version
        WHERE t.kind='fit' AND t.owner_id=${context.request.ownerId}::uuid AND t.scout_id=${context.request.scoutId}::uuid AND t.scout_version=${context.request.version} AND t.configuration=${configuration} AND t.status='ready'
          AND (e.result->'analysis'->'research' IS NULL OR (e.result->'analysis'->'research'->>'expiresAt')::timestamptz>now())
        ORDER BY t.posting_id,t.updated_at DESC
      `.execute(tx);
      const ready = new Set(found.rows.map((row) => row.postingId));
      const selected = postings
        .filter((posting) => !ready.has(posting.id))
        .slice(0, 8)
        .map((posting) => posting.id);
      await sql`INSERT INTO intelligence_run_batches(run_id,configuration,selected) VALUES(${context.request.runId}::uuid,${configuration},${selected}::text[]) ON CONFLICT(run_id) DO NOTHING`.execute(
        tx,
      );
      const batch = await sql<{
        selected: string[];
      }>`SELECT selected FROM intelligence_run_batches WHERE run_id=${context.request.runId}::uuid AND configuration=${configuration}`.execute(
        tx,
      );

      return { selected: batch.rows[0]?.selected ?? [], results: found.rows };
    });
  }

  /** Reuses fresh public research across admission epochs and scouts; completed evidence remains immutable. */
  private async reusableResearch(
    tx: Transaction<ScoutAlertDatabase>,
    task: IntelligenceTask,
  ): Promise<IntelligenceResult | null> {
    if (task.kind !== "research") {
      return null;
    }

    const found = await sql<{
      result: IntelligenceResult;
    }>`SELECT result FROM intelligence_tasks WHERE kind='research' AND posting_id=${task.posting.id} AND posting_version=${task.posting.version} AND configuration=${task.configuration} AND status='ready' AND (result->'analysis'->'research'->>'expiresAt')::timestamptz>now() ORDER BY updated_at DESC LIMIT 1`.execute(
      tx,
    );

    return found.rows[0]?.result ?? null;
  }

  /** Private fit references immutable shared analysis instead of copying public source documents per user. */
  private async analysisId(
    tx: Transaction<ScoutAlertDatabase>,
    task: IntelligenceTask,
  ): Promise<string | null> {
    if (task.kind !== "fit") {
      return null;
    }

    const found = await sql<{
      id: string;
    }>`SELECT id FROM intelligence_tasks WHERE kind IN ('extraction','research') AND posting_id=${task.posting.id} AND posting_version=${task.posting.version} AND configuration=${task.configuration} AND status='ready' AND result->'analysis'=${JSON.stringify(task.analysis)}::jsonb ORDER BY updated_at DESC LIMIT 1`.execute(
      tx,
    );

    return found.rows[0]?.id ?? null;
  }

  /** Reserves attempts behind the global daily row lock; crashes spend one allowance and expired leases can retry once. */
  async claim(task: IntelligenceTask): Promise<TaskClaim> {
    return this.db.transaction().execute(async (tx) => {
      if (!(await this.current(tx, task))) {
        return { status: "unavailable" };
      }

      const reusable = await this.reusableResearch(tx, task);

      if (reusable) {
        return { status: "ready", result: reusable };
      }

      const analysisId = await this.analysisId(tx, task);

      if (task.kind === "fit" && !analysisId) {
        return { status: "unavailable" };
      }

      const id = this.identity(task);
      const request = task.kind === "fit" ? task.context!.request : undefined;
      await sql`INSERT INTO intelligence_tasks(id,kind,configuration,posting_id,posting_version,owner_id,scout_id,scout_version,analysis_task_id)
        VALUES(${id},${task.kind},${task.configuration},${task.posting.id},${task.posting.version},${request?.ownerId ?? null}::uuid,${request?.scoutId ?? null}::uuid,${request?.version ?? null},${analysisId}) ON CONFLICT(id) DO NOTHING`.execute(
        tx,
      );
      const row = await tx
        .selectFrom("intelligence_tasks")
        .selectAll()
        .where("id", "=", id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const expires =
        row.result?.kind === "research"
          ? row.result.analysis.research?.expiresAt
          : undefined;
      const expired =
        expires !== undefined && Date.parse(expires) <= Date.now();

      if (row.status === "ready" && row.result && !expired) {
        return { status: "ready", result: row.result };
      }

      if (expired) {
        return { status: "unavailable" };
      }

      const now = Date.now();

      if (
        row.status === "running" &&
        row.lease_until &&
        new Date(row.lease_until).getTime() > now
      ) {
        return { status: "waiting" };
      }

      if (
        row.attempts >= 2 ||
        (row.retry_at && new Date(row.retry_at).getTime() > now)
      ) {
        return { status: "unavailable" };
      }

      await sql`INSERT INTO intelligence_daily_budget(day,requests) VALUES((now() AT TIME ZONE 'UTC')::date,0) ON CONFLICT(day) DO NOTHING`.execute(
        tx,
      );
      const budget = await sql<{
        requests: number;
        reserved: string;
      }>`SELECT requests,reserved_microusd::text AS reserved FROM intelligence_daily_budget WHERE day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE`.execute(
        tx,
      );

      if (
        (budget.rows[0]?.requests ?? this.dailyRequests) >=
          this.dailyRequests ||
        Number(budget.rows[0]?.reserved ?? this.dailyMicrousd) +
          intelligenceAttemptReserveMicrousd >
          this.dailyMicrousd
      ) {
        return { status: "unavailable" };
      }

      const active = await sql<{
        count: number;
      }>`SELECT count(*)::int AS count FROM intelligence_tasks WHERE status='running' AND lease_until>now()`.execute(
        tx,
      );

      if ((active.rows[0]?.count ?? 2) >= 2) {
        return { status: "waiting" };
      }

      const token = randomUUID();
      await sql`UPDATE intelligence_daily_budget SET requests=requests+1,reserved_microusd=reserved_microusd+${intelligenceAttemptReserveMicrousd} WHERE day=(now() AT TIME ZONE 'UTC')::date`.execute(
        tx,
      );
      await sql`UPDATE intelligence_attempts SET outcome='superseded',finished_at=now() WHERE task_id=${id} AND finished_at IS NULL`.execute(
        tx,
      );
      await sql`UPDATE intelligence_tasks SET status='running',attempts=attempts+1,lease_token=${token}::uuid,lease_until=now()+interval '55 seconds',retry_at=NULL,updated_at=now() WHERE id=${id}`.execute(
        tx,
      );
      await tx
        .insertInto("intelligence_attempts")
        .values({ id: token, task_id: id })
        .execute();

      return { status: "claimed", token };
    });
  }

  /** Fencing plus current input checks prevents a late or superseded provider response from becoming authoritative. */
  async complete(token: string, result: IntelligenceResult): Promise<void> {
    const stored =
      result.kind === "fit"
        ? { kind: result.kind, fit: result.fit, usage: result.usage }
        : result;
    await this.db.transaction().execute(async (tx) => {
      const saved =
        await sql`UPDATE intelligence_tasks t SET result=${JSON.stringify(stored)}::jsonb,status='ready',lease_until=NULL,updated_at=now()
        WHERE lease_token=${token}::uuid AND status='running' AND lease_until>now() AND kind=${result.kind}
          AND EXISTS(SELECT 1 FROM opportunity_postings p WHERE p.id=t.posting_id AND p.version=t.posting_version AND p.open)
          AND (t.kind<>'fit' OR EXISTS(SELECT 1 FROM scouts s WHERE s.id=t.scout_id AND s.owner_id=t.owner_id AND s.version=t.scout_version AND s.status='active')) RETURNING id`.execute(
          tx,
        );
      await tx
        .updateTable("intelligence_attempts")
        .set({
          finished_at: sql`now()`,
          outcome: saved.rows.length ? "ready" : "superseded",
          usage: result.usage,
          cost: estimateIntelligenceCost(result.usage),
        })
        .where("id", "=", token)
        .where("finished_at", "is", null)
        .execute();
    });
  }

  /** Provider errors retain no raw prompt/error text and delay retries; reservations are never refunded after an ambiguous call. */
  async fail(
    token: string,
    code: "provider_unavailable" | "invalid_evidence",
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await sql`UPDATE intelligence_tasks SET status='failed',lease_until=NULL,retry_at=now()+interval '15 minutes',updated_at=now() WHERE lease_token=${token}::uuid AND status='running'`.execute(
        tx,
      );
      await tx
        .updateTable("intelligence_attempts")
        .set({ finished_at: sql`now()`, outcome: code })
        .where("id", "=", token)
        .where("finished_at", "is", null)
        .execute();
    });
  }
}
