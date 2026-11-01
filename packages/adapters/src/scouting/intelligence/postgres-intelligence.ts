import {
  estimateIntelligenceCost,
  intelligenceAttemptReserveMicrousd,
  expertAttemptReserveMicrousd,
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
  validAnalysis,
  validFit,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { fitEvidenceIdentity } from "./fit-evidence-identity.js";

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

  /** Includes source/brief contents and provider policy, excluding only research observation clocks; current() independently enforces fresh evidence. Private inputs never enter public extraction rows. */
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
                    analysis: fitEvidenceIdentity(task.analysis),
                    review: task.review
                      ? {
                          ...task.review,
                          sources: task.review.sources.map(
                            ({ observedAt: _observedAt, ...source }) => source,
                          ),
                        }
                      : undefined,
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

    if (
      !context ||
      !task.analysis ||
      !validAnalysis(task.posting, task.analysis)
    ) {
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

  /** Reuses earlier policy-compatible verdicts after a real fresh research check. Old clock-based keys remain readable, and private scopes or changed evidence can never share a result. */
  private async reusableFit(
    tx: Transaction<ScoutAlertDatabase>,
    task: IntelligenceTask,
  ): Promise<(IntelligenceResult & { kind: "fit" }) | null> {
    if (task.kind !== "fit" || task.review || !task.context || !task.analysis) {
      return null;
    }
    const prior = await sql<{
      result: IntelligenceResult & { kind: "fit" };
      analysis: PostingAnalysis;
    }>`SELECT t.result,e.result->'analysis' AS analysis FROM intelligence_tasks t
      JOIN intelligence_tasks e ON e.id=t.analysis_task_id AND e.status='ready'
      WHERE t.kind='fit' AND t.status='ready' AND t.configuration=${task.configuration}
      AND t.posting_id=${task.posting.id} AND t.posting_version=${task.posting.version}
      AND t.owner_id=${task.context.request.ownerId}::uuid AND t.scout_id=${task.context.request.scoutId}::uuid AND t.scout_version=${task.context.request.version}
      AND coalesce(t.result->'review'->>'status','completed')='completed'
      ORDER BY t.updated_at DESC LIMIT 20`.execute(tx);
    const evidence = JSON.stringify(
      canonical(fitEvidenceIdentity(task.analysis)),
    );
    return (
      prior.rows.find(
        (row) =>
          JSON.stringify(canonical(fitEvidenceIdentity(row.analysis))) ===
            evidence &&
          validFit(
            task.posting,
            task.context!.search,
            row.result.fit,
            task.analysis,
          ),
      )?.result ?? null
    );
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
        reviewTerminal: boolean;
      }>`
        SELECT DISTINCT ON(t.posting_id) t.posting_id AS "postingId",t.result,e.result->'analysis' AS analysis,
          EXISTS(SELECT 1 FROM intelligence_tasks r WHERE r.review_of=t.id AND r.attempts>=1
            AND (r.status='failed' OR (r.status='running' AND r.lease_until<=now()))) AS "reviewTerminal" FROM intelligence_tasks t
        JOIN intelligence_tasks e ON e.id=t.analysis_task_id AND e.status='ready'
        JOIN jsonb_to_recordset(${JSON.stringify(captured)}::jsonb) AS p(id text,version integer) ON p.id=t.posting_id AND p.version=t.posting_version
        WHERE t.kind='fit' AND t.owner_id=${context.request.ownerId}::uuid AND t.scout_id=${context.request.scoutId}::uuid AND t.scout_version=${context.request.version} AND t.configuration=${configuration} AND t.status='ready'
          AND (e.result->'analysis'->'research' IS NULL OR (e.result->'analysis'->'research'->>'expiresAt')::timestamptz>now())
        ORDER BY t.posting_id,t.updated_at DESC
      `.execute(tx);
      const ready = new Set(
        found.rows
          .filter(
            (row) =>
              row.result.review?.status !== "pending" || row.reviewTerminal,
          )
          .map((row) => row.postingId),
      );
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

  /** Reuses a source review's cited extraction; account-specific assessment is still performed independently. */
  private async reusableLeadExtraction(
    tx: Transaction<ScoutAlertDatabase>,
    task: IntelligenceTask,
    id: string,
  ): Promise<IntelligenceResult | null> {
    if (task.kind !== "extraction") {
      return null;
    }
    const reviewed = await sql<{
      analysis: PostingAnalysis;
    }>`SELECT r.result->'analysis' AS analysis FROM web_lead_reviews r JOIN opportunity_postings p ON p.id=r.posting_id AND p.version=r.posting_version WHERE r.posting_id=${task.posting.id} AND r.posting_version=${task.posting.version} AND r.state='ready' AND r.input->>'scope'='source' AND r.input->>'truncated'='false' ORDER BY r.reviewed_at DESC LIMIT 1`.execute(
      tx,
    );
    const analysis = reviewed.rows[0]?.analysis;
    if (!analysis || !validAnalysis(task.posting, analysis)) {
      return null;
    }
    const result: IntelligenceResult = {
      kind: "extraction",
      analysis,
      usage: {
        model: "no-provider-call",
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
        responseId: "shared-lead-extraction",
      },
    };
    await sql`INSERT INTO intelligence_tasks(id,kind,configuration,posting_id,posting_version,status,result) VALUES(${id},'extraction',${task.configuration},${task.posting.id},${task.posting.version},'ready',${JSON.stringify(result)}::jsonb) ON CONFLICT(id) DO NOTHING`.execute(
      tx,
    );
    return result;
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
      const reviewOf = task.review
        ? this.identity({ ...task, review: undefined })
        : null;
      const baseline = reviewOf
        ? await sql`SELECT id FROM intelligence_tasks WHERE id=${reviewOf} AND status='ready'
        AND result->'fit'=${JSON.stringify(task.review!.baseline)}::jsonb AND result->'review'->>'status'='pending'
        AND result->'review'->>'reason'=${task.review!.reason}`.execute(tx)
        : null;
      if (reviewOf && !baseline?.rows.length) {
        return { status: "unavailable" };
      }
      const extraction = await this.reusableLeadExtraction(tx, task, id);
      if (extraction) {
        return { status: "ready", result: extraction };
      }
      const request = task.kind === "fit" ? task.context!.request : undefined;
      const reused = await this.reusableFit(tx, task);
      await sql`INSERT INTO intelligence_tasks(id,kind,configuration,posting_id,posting_version,owner_id,scout_id,scout_version,analysis_task_id,review_of,status,result)
        VALUES(${id},${task.kind},${task.configuration},${task.posting.id},${task.posting.version},${request?.ownerId ?? null}::uuid,${request?.scoutId ?? null}::uuid,${request?.version ?? null},${analysisId},${reviewOf},${reused ? "ready" : "pending"},${reused ? JSON.stringify(reused) : null}::jsonb) ON CONFLICT(id) DO NOTHING`.execute(
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

      const readyResult =
        row.status === "ready" && !expired ? row.result : null;
      // Point the reusable private verdict at freshly checked equivalent evidence; immutable public analyses and paid attempt history are retained.
      if (
        readyResult &&
        task.kind === "fit" &&
        row.analysis_task_id !== analysisId
      ) {
        await tx
          .updateTable("intelligence_tasks")
          .set({ analysis_task_id: analysisId })
          .where("id", "=", id)
          .execute();
      }
      if (readyResult) {
        return { status: "ready", result: readyResult };
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
        row.attempts >= (task.review ? 1 : 2) ||
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
      const reserve = task.review
        ? expertAttemptReserveMicrousd
        : intelligenceAttemptReserveMicrousd;

      if (
        (budget.rows[0]?.requests ?? this.dailyRequests) >=
          this.dailyRequests ||
        Number(budget.rows[0]?.reserved ?? this.dailyMicrousd) + reserve >
          this.dailyMicrousd
      ) {
        return { status: "unavailable" };
      }

      const active = await sql<{
        count: number;
      }>`SELECT ((SELECT count(*) FROM intelligence_tasks WHERE status='running' AND lease_until>now())+(SELECT count(*) FROM web_lead_review_attempts WHERE state='running' AND lease_until>now())+(SELECT count(*) FROM web_reasoning_tasks WHERE state='running' AND lease_until>now()))::int AS count`.execute(
        tx,
      );

      if ((active.rows[0]?.count ?? 2) >= 2) {
        return { status: "waiting" };
      }

      const token = randomUUID();
      await sql`UPDATE intelligence_daily_budget SET requests=requests+1,reserved_microusd=reserved_microusd+${reserve} WHERE day=(now() AT TIME ZONE 'UTC')::date`.execute(
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
        ? {
            kind: result.kind,
            fit: result.fit,
            usage: result.usage,
            ...(result.review ? { review: result.review } : {}),
          }
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
