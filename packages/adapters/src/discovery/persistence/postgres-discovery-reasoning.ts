import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  DiscoveryReasoningRepository,
  validReasoning,
  type DiscoveryReasoningInput,
  type DiscoveryReasoningOutput,
  type DiscoveryReasoningClaim,
} from "@repo/core/discovery";
import type { ScoutRunRequest, AnalysisUsage } from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import {
  estimateIntelligenceCost,
  intelligenceAttemptReserveMicrousd,
  expertAttemptReserveMicrousd,
} from "../../scouting/intelligence/usage-cost.js";
import { discoveryKey } from "./discovery-identities.js";

/** Makes equivalent public snapshots stable across JavaScript and PostgreSQL JSONB object ordering. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

/** Shares public model decisions with durable owner/revision admission, a common monetary ledger and no ambiguous retries. */
export class PostgresDiscoveryReasoningRepository extends DiscoveryReasoningRepository {
  /** Receives a native database pool and the same configured AI ceilings as extraction, research and fit. */
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly dailyRequests: number,
    private readonly dailyMicrousd: number,
  ) {
    super();
  }

  /** Locks the scout, phase/task and budget in that order; never holds those locks across a provider call. */
  async claim(
    request: ScoutRunRequest,
    phase: string,
    configuration: string,
    input: DiscoveryReasoningInput,
  ): Promise<DiscoveryReasoningClaim> {
    return this.db.transaction().execute(async (tx) => {
      const active =
        await sql`SELECT id FROM scouts WHERE id=${request.scoutId}::uuid AND owner_id=${request.ownerId}::uuid AND version=${request.version} AND status='active' FOR UPDATE`.execute(
          tx,
        );
      if (!active.rows.length) {
        return { status: "unavailable" };
      }
      const run = await sql<{
        status: string;
        expired: boolean;
        superseded: boolean;
      }>`SELECT c.status,c.deadline<=now() AS expired,EXISTS(SELECT 1 FROM web_discovery_cases n WHERE n.scout_id=c.scout_id AND n.started_at>c.started_at) AS superseded FROM web_discovery_cases c WHERE c.id=${request.runId}::uuid AND c.owner_id=${request.ownerId}::uuid AND c.scout_id=${request.scoutId}::uuid AND c.scout_version=${request.version}`.execute(
        tx,
      );
      if (
        input.kind === "choice" &&
        (!run.rows[0] ||
          run.rows[0].status !== "searching" ||
          run.rows[0].expired ||
          run.rows[0].superseded)
      ) {
        return { status: "unavailable" };
      }
      const identity = discoveryKey([
        configuration,
        canonical(input),
        Math.floor(Date.now() / (6 * 60 * 60_000)),
      ]);
      await sql`INSERT INTO web_reasoning_tasks(key,configuration,input) VALUES(${identity},${configuration},${JSON.stringify(input)}::jsonb) ON CONFLICT DO NOTHING`.execute(
        tx,
      );
      await sql`INSERT INTO web_reasoning_phases(run_id,phase,scout_id,owner_id,scout_version,task_key) VALUES(${request.runId}::uuid,${phase},${request.scoutId}::uuid,${request.ownerId}::uuid,${request.version},${identity}) ON CONFLICT DO NOTHING`.execute(
        tx,
      );
      const found = await sql<{
        key: string;
        configuration: string;
        input: DiscoveryReasoningInput;
        state: string;
        output: DiscoveryReasoningOutput | null;
        expired: boolean;
        deadline: boolean;
      }>`SELECT t.*,t.lease_until<=now() AS expired,p.deadline<=now() AS deadline FROM web_reasoning_phases p JOIN web_reasoning_tasks t ON t.key=p.task_key WHERE p.run_id=${request.runId}::uuid AND p.phase=${phase} AND p.owner_id=${request.ownerId}::uuid AND p.scout_id=${request.scoutId}::uuid AND p.scout_version=${request.version} FOR UPDATE OF t`.execute(
        tx,
      );
      const task = found.rows[0];
      if (
        !task ||
        task.configuration !== configuration ||
        JSON.stringify(canonical(task.input)) !==
          JSON.stringify(canonical(input))
      ) {
        return { status: "unavailable" };
      }
      if (task.state === "ready" && task.output) {
        return { status: "ready", output: task.output };
      }
      if (
        task.state === "failed" ||
        task.deadline ||
        (task.state === "running" && task.expired)
      ) {
        return { status: "unavailable" };
      }
      if (task.state === "running") {
        return { status: "waiting" };
      }
      const admission = await this.reserve(
        tx,
        input.kind === "choice" && input.expertReview
          ? expertAttemptReserveMicrousd
          : intelligenceAttemptReserveMicrousd,
      );
      if (admission !== "admitted") {
        return { status: admission };
      }
      const token = randomUUID();
      await sql`UPDATE web_reasoning_tasks SET state='running',lease_token=${token}::uuid,lease_until=now()+interval '35 seconds' WHERE key=${task.key}`.execute(
        tx,
      );
      return { status: "claimed", token };
    });
  }

  /** Serializes all AI admission so added planning cannot exceed existing global request, USD or concurrency ceilings. */
  private async reserve(
    tx: Kysely<ScoutAlertDatabase>,
    reserve: number,
  ): Promise<"admitted" | "waiting" | "unavailable"> {
    await sql`INSERT INTO intelligence_daily_budget(day,requests) VALUES((now() AT TIME ZONE 'UTC')::date,0) ON CONFLICT DO NOTHING`.execute(
      tx,
    );
    await sql`SELECT day FROM intelligence_daily_budget WHERE day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE`.execute(
      tx,
    );
    const active = await sql<{
      count: number;
    }>`SELECT ((SELECT count(*) FROM intelligence_tasks WHERE status='running' AND lease_until>now())+(SELECT count(*) FROM web_lead_review_attempts WHERE state='running' AND lease_until>now())+(SELECT count(*) FROM web_reasoning_tasks WHERE state='running' AND lease_until>now()))::int AS count`.execute(
      tx,
    );
    if (active.rows[0]!.count >= 2) {
      return "waiting";
    }
    const saved =
      await sql`UPDATE intelligence_daily_budget SET requests=requests+1,reserved_microusd=reserved_microusd+${reserve} WHERE day=(now() AT TIME ZONE 'UTC')::date AND requests<${this.dailyRequests} AND reserved_microusd+${reserve}<=${this.dailyMicrousd} RETURNING day`.execute(
        tx,
      );
    return saved.rows.length ? "admitted" : "unavailable";
  }

  /** Accepts only validated output from an unexpired lease; late replies retain cost telemetry but never become reusable decisions. */
  async complete(
    token: string,
    output: DiscoveryReasoningOutput,
    usage: AnalysisUsage,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const found = await sql<{
        input: DiscoveryReasoningInput;
        expired: boolean;
      }>`SELECT input,lease_until<=now() AS expired FROM web_reasoning_tasks WHERE lease_token=${token}::uuid AND state='running' FOR UPDATE`.execute(
        tx,
      );
      const task = found.rows[0];
      if (!task) {
        return;
      }
      const accepted = !task.expired && validReasoning(task.input, output);
      await sql`UPDATE web_reasoning_tasks SET state=${accepted ? "ready" : "failed"},output=${accepted ? JSON.stringify(output) : null}::jsonb,rejected_output=${accepted ? null : JSON.stringify(output)}::jsonb,failure=${accepted ? null : task.expired ? "lease_expired" : "invalid_reasoning"},usage=${JSON.stringify(usage)}::jsonb,cost=${JSON.stringify(estimateIntelligenceCost(usage))}::jsonb,finished_at=now() WHERE lease_token=${token}::uuid`.execute(
        tx,
      );
    });
  }

  /** Does not retry unknown provider outcomes or refund the conservative reserved amount. */
  async fail(token: string): Promise<void> {
    await sql`UPDATE web_reasoning_tasks SET state='failed',failure='provider_unavailable',finished_at=now() WHERE lease_token=${token}::uuid AND state='running'`.execute(
      this.db,
    );
  }
}
