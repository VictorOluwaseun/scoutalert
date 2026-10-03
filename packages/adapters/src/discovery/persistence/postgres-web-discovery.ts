import { PostgresDocumentAdmissionRepository } from "./postgres-document-admission.js";
import { lockWebSources } from "./web-source-locks.js";
import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  WebDiscoveryRepository,
  prioritizeDiscovery,
  emptyDiscoveryPerformance,
  type DiscoveryClaim,
  type DiscoveryLimits,
  type DiscoveryOperation,
  type DiscoveryOperationResult,
  type DiscoveryPlan,
  type DiscoveryExploration,
  type DiscoveryDecision,
  type SearchCapability,
} from "@repo/core/discovery";
import type { SearchDraft } from "@repo/core/onboarding";
import type { ScoutRunRequest } from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { discoveryKey } from "./discovery-identities.js";
import { PostgresDiscoveryLeadRepository } from "./postgres-discovery-leads.js";
import { PostgresDiscoveryExplorationRepository } from "./postgres-discovery-exploration.js";
import {
  PostgresDiscoveryPerformanceRepository,
  queryRoute,
} from "./postgres-discovery-performance.js";

type CaseRow = {
  plan: DiscoveryPlan;
  capability: SearchCapability;
  epoch: number;
  expired: boolean;
  status: string;
};
type OperationRow = {
  key: string;
  provider: string;
  kind: string;
  input: DiscoveryOperation;
  state: string;
  result: DiscoveryOperationResult | null;
  expired: boolean;
};

/** Durable public-work coordinator uses short PostgreSQL transactions, fenced leases and non-refundable attempt reservations. */
export class PostgresWebDiscoveryRepository extends WebDiscoveryRepository {
  /** Receives the native typed pool at composition; external calls never run inside its transactions. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Reads only a currently owned active revision; subsequent writes repeat the check under a lock. */
  async context(request: ScoutRunRequest): Promise<SearchDraft | null> {
    const result = await this.db
      .selectFrom("scouts")
      .select("search")
      .where("id", "=", request.scoutId)
      .where("owner_id", "=", request.ownerId)
      .where("version", "=", request.version)
      .where("status", "=", "active")
      .executeTakeFirst();

    return result?.search ?? null;
  }

  /** Reads a frozen plan only through its current owner and scout revision. */
  async preparedPlan(request: ScoutRunRequest): Promise<DiscoveryPlan | null> {
    const result = await sql<{
      plan: DiscoveryPlan;
    }>`SELECT plan FROM web_discovery_cases WHERE id=${request.runId}::uuid AND owner_id=${request.ownerId}::uuid AND scout_id=${request.scoutId}::uuid AND scout_version=${request.version}`.execute(
      this.db,
    );
    return result.rows[0]?.plan ?? null;
  }

  /** Creates one case per workflow identity and freezes its public query semantics and capability version. */
  async open(
    request: ScoutRunRequest,
    plan: DiscoveryPlan,
    capability: SearchCapability | null,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      if (!(await this.current(tx, request))) {
        return;
      }

      const reason =
        plan.blockedReason ?? (capability ? null : "provider_not_configured");
      const inserted = await sql<{
        id: string;
        epoch: number;
      }>`INSERT INTO web_discovery_cases(id,scout_id,owner_id,scout_version,plan,capability,provider,status,reason,deadline,finished_at)
        VALUES(${request.runId}::uuid,${request.scoutId}::uuid,${request.ownerId}::uuid,${request.version},${JSON.stringify(plan)}::jsonb,${capability ? JSON.stringify(capability) : null}::jsonb,${capability?.id ?? null},${reason ? "unavailable" : "searching"},${reason},now()+make_interval(secs=>${plan.deadlineSeconds}),CASE WHEN ${reason}::text IS NULL THEN NULL ELSE now() END)
        ON CONFLICT(id) DO NOTHING RETURNING id,floor(extract(epoch FROM started_at)/1800)::integer AS epoch`.execute(
        tx,
      );

      if (!inserted.rows.length) {
        await sql`UPDATE web_discovery_cases SET status='cancelled',reason='provider_configuration_changed',finished_at=now() WHERE id=${request.runId}::uuid AND owner_id=${request.ownerId}::uuid AND status='searching' AND capability IS DISTINCT FROM ${capability ? JSON.stringify(capability) : null}::jsonb`.execute(
          tx,
        );
        return;
      }

      if (reason || !capability) {
        return;
      }

      const epoch = inserted.rows[0]!.epoch;
      const measurements = new PostgresDiscoveryPerformanceRepository(tx);
      const history = await measurements.samples(
        plan.queries.map((query) => queryRoute(capability.id, query)),
      );
      const usage = await sql<{
        requests: number;
      }>`SELECT requests FROM web_discovery_usage WHERE provider=${capability.id} AND day=(now() AT TIME ZONE 'UTC')::date`.execute(
        tx,
      );
      const queries = prioritizeDiscovery(
        plan.queries,
        (query) =>
          history.get(queryRoute(capability.id, query).id) ??
          emptyDiscoveryPerformance(),
        usage.rows[0]?.requests ?? 0,
      );

      for (const [position, query] of queries.entries()) {
        const operation: DiscoveryOperation = { kind: "search", query };
        const key = discoveryKey([
          capability.id,
          capability.configuration,
          capability.access,
          operation,
          epoch,
        ]);
        await sql`INSERT INTO web_discovery_operations(key,provider,kind,input) VALUES(${key},${capability.id},'search',${JSON.stringify(operation)}::jsonb) ON CONFLICT DO NOTHING`.execute(
          tx,
        );
        await sql`INSERT INTO web_discovery_steps(case_id,position,operation_key) VALUES(${request.runId}::uuid,${position},${key})`.execute(
          tx,
        );
      }
    });
  }

  /** Applies one reusable result or reserves one new operation; every retry retains the same case and shared operation keys. */
  async claim(
    request: ScoutRunRequest,
    limits: DiscoveryLimits,
  ): Promise<DiscoveryClaim> {
    return this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      if (!(await this.current(tx, request))) {
        await sql`UPDATE web_discovery_cases SET status='cancelled',reason='superseded',finished_at=now() WHERE id=${request.runId}::uuid AND scout_id=${request.scoutId}::uuid AND owner_id=${request.ownerId}::uuid AND status='searching'`.execute(
          tx,
        );
        return { status: "done" };
      }

      const found =
        await sql<CaseRow>`SELECT plan,capability,status,floor(extract(epoch FROM started_at)/1800)::integer AS epoch,deadline<=now() AS expired FROM web_discovery_cases WHERE id=${request.runId}::uuid AND scout_id=${request.scoutId}::uuid AND owner_id=${request.ownerId}::uuid AND scout_version=${request.version} FOR UPDATE`.execute(
          tx,
        );
      const run = found.rows[0];

      if (!run || run.status !== "searching") {
        return { status: "done" };
      }

      const newer =
        await sql`SELECT id FROM web_discovery_cases WHERE owner_id=${request.ownerId}::uuid AND scout_id=${request.scoutId}::uuid AND started_at>(SELECT started_at FROM web_discovery_cases WHERE id=${request.runId}::uuid) LIMIT 1`.execute(
          tx,
        );

      if (newer.rows.length || run.expired) {
        await this.finish(
          tx,
          request.runId,
          newer.rows.length ? "cancelled" : "deferred",
          newer.rows.length ? "superseded" : "deadline_reached",
        );
        return { status: "done" };
      }

      const operations =
        await sql<OperationRow>`SELECT o.*,o.lease_until<=now() AS expired FROM web_discovery_steps s JOIN web_discovery_operations o ON o.key=s.operation_key WHERE s.case_id=${request.runId}::uuid AND NOT s.applied ORDER BY s.position LIMIT 1 FOR UPDATE OF o`.execute(
          tx,
        );
      const operation = operations.rows[0];

      if (!operation && run.plan.exploration) {
        return {
          status: "planning",
          snapshot: await new PostgresDiscoveryExplorationRepository(
            tx,
          ).snapshot(request.runId, run.plan),
        };
      }

      if (!operation) {
        const failures =
          await sql`SELECT 1 FROM web_discovery_steps s JOIN web_discovery_operations o ON o.key=s.operation_key WHERE s.case_id=${request.runId}::uuid AND (o.state='failed' OR (o.kind='document' AND o.result->>'status'<>'fetched')) LIMIT 1`.execute(
            tx,
          );
        await this.finish(
          tx,
          request.runId,
          failures.rows.length ? "partial" : "completed",
          failures.rows.length
            ? "some_sources_unavailable"
            : "bounded_search_window",
        );
        return { status: "done" };
      }

      if (operation.state === "running" && operation.expired) {
        await sql`UPDATE web_discovery_operations SET state='failed',failure='attempt_outcome_unknown',finished_at=now() WHERE key=${operation.key}`.execute(
          tx,
        );
        return { status: "progress" };
      }

      if (operation.state === "running") {
        return { status: "waiting" };
      }

      if (operation.state === "succeeded" || operation.state === "failed") {
        return this.apply(tx, request.runId, operation, run);
      }

      return this.admit(tx, request.runId, operation, run.capability, limits);
    });
  }

  /** Atomically accepts public evidence and operation completion for the exact current lease. */
  async complete(
    key: string,
    token: string,
    result: DiscoveryOperationResult,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      const found =
        await sql<OperationRow>`SELECT * FROM web_discovery_operations WHERE key=${key} AND lease_token=${token}::uuid AND lease_until>now() AND state='running' FOR UPDATE`.execute(
          tx,
        );
      const operation = found.rows[0];

      if (
        !operation ||
        operation.kind !== result.kind ||
        (operation.input.kind === "document" &&
          result.kind === "document" &&
          operation.input.url !== result.url)
      ) {
        return;
      }

      if (result.kind === "document") {
        await new PostgresDiscoveryLeadRepository(tx).acceptDocument(result);
        await sql`UPDATE web_discovery_hosts SET lease_token=NULL,lease_until=NULL,next_allowed_at=now()+make_interval(secs=>${Math.max(2, Math.min(86400, result.hostDelaySeconds))}) WHERE lease_token=${token}::uuid`.execute(
          tx,
        );
      }

      await new PostgresDiscoveryPerformanceRepository(tx).settle(
        key,
        result.kind === "search"
          ? result.observations.map((item) => item.url)
          : result.status === "fetched"
            ? [result.url]
            : [],
        result.kind === "search" || result.status === "fetched",
      );

      await sql`UPDATE web_discovery_operations SET state='succeeded',result=${JSON.stringify(result)}::jsonb,finished_at=now(),lease_until=NULL WHERE key=${key} AND lease_token=${token}::uuid`.execute(
        tx,
      );
    });
  }

  /** Failed or ambiguous requests remain charged to the admission ledger and are never blindly retried. */
  async fail(key: string, token: string): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await sql`UPDATE web_discovery_operations SET state='failed',failure='provider_or_source_unavailable',finished_at=now() WHERE key=${key} AND lease_token=${token}::uuid AND state='running' AND lease_until>now()`.execute(
        tx,
      );
      await sql`UPDATE web_discovery_hosts SET lease_token=NULL,lease_until=NULL,next_allowed_at=now()+interval '30 seconds' WHERE lease_token=${token}::uuid`.execute(
        tx,
      );
    });
  }

  /** Fences adaptive appends by owner, revision, case deadline and newer runs, using the same lock order as admission. */
  async extend(
    request: ScoutRunRequest,
    snapshot: DiscoveryExploration,
    decision: DiscoveryDecision,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      if (!(await this.current(tx, request))) {
        return;
      }
      const found =
        await sql<CaseRow>`SELECT c.plan,c.capability,c.status,floor(extract(epoch FROM c.started_at)/1800)::integer AS epoch,c.deadline<=now() AS expired FROM web_discovery_cases c WHERE c.id=${request.runId}::uuid AND c.owner_id=${request.ownerId}::uuid AND c.scout_id=${request.scoutId}::uuid AND c.scout_version=${request.version} AND c.status='searching' AND c.deadline>now() AND NOT EXISTS(SELECT 1 FROM web_discovery_cases n WHERE n.owner_id=c.owner_id AND n.scout_id=c.scout_id AND n.started_at>c.started_at) FOR UPDATE`.execute(
          tx,
        );
      const run = found.rows[0];
      if (!run?.plan.exploration) {
        return;
      }
      await new PostgresDiscoveryExplorationRepository(tx).append(
        request.runId,
        run.plan,
        run.capability,
        run.epoch,
        snapshot,
        decision,
      );
    });
  }

  /** Locks the authoritative scout before touching private case state; stale work cannot publish private results. */
  private async current(
    tx: Kysely<ScoutAlertDatabase>,
    request: ScoutRunRequest,
  ): Promise<boolean> {
    const found =
      await sql`SELECT id FROM scouts WHERE id=${request.scoutId}::uuid AND owner_id=${request.ownerId}::uuid AND version=${request.version} AND status='active' FOR UPDATE`.execute(
        tx,
      );

    return found.rows.length > 0;
  }

  /** Applies cached observations under the case lock; public document publication already happened at completion. */
  private async apply(
    tx: Kysely<ScoutAlertDatabase>,
    caseId: string,
    operation: OperationRow,
    run: CaseRow,
  ): Promise<DiscoveryClaim> {
    if (operation.result?.kind === "search") {
      await new PostgresDiscoveryLeadRepository(tx).acceptSearch(
        caseId,
        operation.key,
        operation.result,
        run.plan,
        run.epoch,
      );
    }

    await sql`UPDATE web_discovery_steps SET applied=true WHERE case_id=${caseId}::uuid AND operation_key=${operation.key}`.execute(
      tx,
    );

    return { status: "progress" };
  }

  /** Serializes provider admission through a daily counter and host admission through a bounded lease. */
  private async admit(
    tx: Kysely<ScoutAlertDatabase>,
    caseId: string,
    operation: OperationRow,
    capability: SearchCapability,
    limits: DiscoveryLimits,
  ): Promise<DiscoveryClaim> {
    if (operation.input.kind === "document") {
      return this.admitDocument(
        tx,
        caseId,
        operation.key,
        operation.input.url,
        limits,
      );
    }
    const token = randomUUID();
    const cost = capability.requestCostMicros;
    const requestLimit = limits.dailySearchRequests;
    const costLimit = limits.dailySearchMicros;

    await sql`INSERT INTO web_discovery_usage(provider,day) VALUES(${operation.provider},(now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`.execute(
      tx,
    );
    await sql`SELECT provider FROM web_discovery_usage WHERE provider=${operation.provider} AND day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE`.execute(
      tx,
    );
    const active = await sql<{
      count: number;
    }>`SELECT count(*)::integer AS count FROM web_discovery_operations WHERE provider=${operation.provider} AND state='running' AND lease_until>now()`.execute(
      tx,
    );

    if ((active.rows[0]?.count ?? 0) >= limits.maximumConcurrentSearches) {
      return { status: "waiting" };
    }

    const reserved =
      await sql`UPDATE web_discovery_usage SET requests=requests+1,reserved_micros=reserved_micros+${cost} WHERE provider=${operation.provider} AND day=(now() AT TIME ZONE 'UTC')::date AND requests<${requestLimit} AND reserved_micros+${cost}<=${costLimit} RETURNING provider`.execute(
        tx,
      );

    if (!reserved.rows.length) {
      await this.finish(tx, caseId, "deferred", "daily_budget_reached");
      return { status: "done" };
    }

    await sql`UPDATE web_discovery_operations SET state='running',lease_token=${token}::uuid,lease_until=now()+interval '45 seconds' WHERE key=${operation.key}`.execute(
      tx,
    );
    await new PostgresDiscoveryPerformanceRepository(tx).admit(
      operation.key,
      queryRoute(operation.provider, operation.input.query),
      cost,
      "approved_query_order",
    );

    return {
      status: "claimed",
      key: operation.key,
      token,
      operation: operation.input,
    };
  }

  /** Keeps document-specific admission flat while preserving the case's durable budget outcome. */
  private async admitDocument(
    tx: Kysely<ScoutAlertDatabase>,
    caseId: string,
    key: string,
    url: string,
    limits: DiscoveryLimits,
  ): Promise<DiscoveryClaim> {
    const admission = await new PostgresDocumentAdmissionRepository(tx).reserve(
      key,
      url,
      limits.dailyDocumentRequests,
      limits.maximumConcurrentSearches,
    );
    if (admission.status === "budget") {
      await this.finish(tx, caseId, "deferred", "daily_budget_reached");
      return { status: "done" };
    }
    if (admission.status === "waiting") {
      return admission;
    }
    return {
      status: "claimed",
      key,
      token: admission.token,
      operation: { kind: "document", url },
    };
  }

  /** Completes a bounded case while retaining its plan, applied observations and reasons for future continuation. */
  private async finish(
    tx: Kysely<ScoutAlertDatabase>,
    id: string,
    status: string,
    reason: string,
  ): Promise<void> {
    await sql`UPDATE web_discovery_cases SET status=${status},reason=${reason},finished_at=now() WHERE id=${id}::uuid AND status='searching'`.execute(
      tx,
    );
  }
}
