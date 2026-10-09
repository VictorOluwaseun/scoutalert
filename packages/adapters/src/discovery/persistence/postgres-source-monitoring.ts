import { sql, type Kysely } from "kysely";
import {
  SourceMonitoringRepository,
  monitorFingerprint,
  monitoringKind,
  prioritizeDiscovery,
  emptyDiscoveryPerformance,
  type MonitorCandidate,
  type MonitorClaim,
  type MonitorKind,
  type MonitorOutcome,
  type SourceDocumentResult,
  type SourceMonitor,
} from "@repo/core/discovery";
import type { ScoutRunRequest } from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { canonicalDiscoveryUrl, discoveryKey } from "./discovery-identities.js";
import { lockWebSources } from "./web-source-locks.js";
import { PostgresDocumentAdmissionRepository } from "./postgres-document-admission.js";
import { PostgresMonitorReceiptRepository } from "./postgres-monitor-receipts.js";
import { PostgresMonitorDispatchRepository } from "./postgres-monitor-dispatch.js";
import {
  PostgresDiscoveryPerformanceRepository,
  sourceRoute,
} from "./postgres-discovery-performance.js";

type MonitorRow = SourceMonitor & { pending_key: string | null };

/** Owns shared URL admission and private subscriptions; all source and scout writes use explicit short transactions. */
export class PostgresSourceMonitoringRepository extends SourceMonitoringRepository {
  /** Bounds active subscriptions per scout while sharing each public URL across every interested owner. */
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly maximumSources = 32,
  ) {
    super();
  }

  /** Returns current complete source reviews only; ownership is verified before exposing the private case association. */
  async candidates(request: ScoutRunRequest): Promise<MonitorCandidate[]> {
    const rows =
      await sql<MonitorCandidate>`SELECT l.id AS "leadId",r.key AS "reviewKey",r.input,r.result AS review,l.document
      FROM web_discovery_case_leads cl JOIN web_discovery_cases c ON c.id=cl.case_id
      JOIN scouts s ON s.id=c.scout_id AND s.owner_id=c.owner_id AND s.version=c.scout_version
      JOIN web_discovery_leads l ON l.id=cl.lead_id JOIN web_lead_reviews r ON r.key=l.review_key
      WHERE c.id=${request.runId}::uuid AND s.id=${request.scoutId}::uuid AND s.owner_id=${request.ownerId}::uuid AND s.version=${request.version} AND s.status='active'
      AND r.state='ready' AND r.input->>'scope'='source' AND l.content_status='fetched'
      AND r.input->>'documentFingerprint'=l.document->>'fingerprint' ORDER BY l.id LIMIT 40`.execute(
        this.db,
      );
    return rows.rows;
  }

  /** Revalidates reviewed evidence and current intent before enrolling a URL; repeated learning never postpones a due check. */
  async subscribe(
    request: ScoutRunRequest,
    candidate: MonitorCandidate,
    kind: Exclude<MonitorKind, "probe"> | null,
  ): Promise<void> {
    if (
      canonicalDiscoveryUrl(candidate.document.url) !==
        candidate.document.url ||
      kind !== monitoringKind(candidate, new Date())
    ) {
      return;
    }
    await this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      const current =
        await sql`SELECT s.id FROM scouts s JOIN web_discovery_cases c ON c.scout_id=s.id AND c.owner_id=s.owner_id AND c.scout_version=s.version JOIN web_discovery_case_leads cl ON cl.case_id=c.id JOIN web_discovery_leads l ON l.id=cl.lead_id JOIN web_lead_reviews r ON r.key=l.review_key AND r.state='ready'
        WHERE c.id=${request.runId}::uuid AND s.id=${request.scoutId}::uuid AND s.owner_id=${request.ownerId}::uuid AND s.version=${request.version} AND s.status='active'
        AND l.id=${candidate.leadId} AND l.review_key=${candidate.reviewKey} AND r.input=${JSON.stringify(candidate.input)}::jsonb AND r.result=${JSON.stringify(candidate.review)}::jsonb AND l.document=${JSON.stringify(candidate.document)}::jsonb FOR UPDATE OF s`.execute(
          tx,
        );
      if (!current.rows.length) {
        return;
      }
      if (!kind) {
        await sql`UPDATE web_source_monitors SET status='retired',reason='source_not_useful',review_key=${candidate.reviewKey},updated_at=now() WHERE id=${candidate.leadId} AND pending_key IS NULL`.execute(
          tx,
        );
        return;
      }
      const available =
        await sql`SELECT 1 WHERE EXISTS(SELECT 1 FROM web_source_interests WHERE monitor_id=${candidate.leadId} AND scout_id=${request.scoutId}::uuid) OR (SELECT count(*) FROM web_source_interests i JOIN web_source_monitors m ON m.id=i.monitor_id WHERE i.scout_id=${request.scoutId}::uuid AND i.scout_version=${request.version} AND m.status<>'retired')<${this.maximumSources}`.execute(
          tx,
        );
      if (!available.rows.length) {
        return;
      }
      await sql`INSERT INTO web_source_monitors(id,url,kind,review_key,fingerprint,next_check_at,checked_at) VALUES(${candidate.leadId},${candidate.document.url},${kind},${candidate.reviewKey},${monitorFingerprint(candidate.document)},now()+interval '30 minutes',${candidate.document.checkedAt}::timestamptz)
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,review_key=excluded.review_key,status=CASE WHEN web_source_monitors.review_key IS DISTINCT FROM excluded.review_key THEN 'active' ELSE web_source_monitors.status END,reason=CASE WHEN web_source_monitors.review_key IS DISTINCT FROM excluded.review_key THEN 'reviewed_source' ELSE web_source_monitors.reason END,updated_at=now()`.execute(
        tx,
      );
      await sql`INSERT INTO web_source_interests(monitor_id,scout_id,owner_id,scout_version) VALUES(${candidate.leadId},${request.scoutId}::uuid,${request.ownerId}::uuid,${request.version}) ON CONFLICT(monitor_id,scout_id) DO UPDATE SET scout_version=excluded.scout_version`.execute(
        tx,
      );
      if (kind === "directory") {
        await new PostgresMonitorReceiptRepository(
          tx,
          this.maximumSources,
        ).links(candidate.leadId, candidate.document);
      }
    });
  }

  /**
   * Recovers completed shared operations before reserving new work; stale attempts remain charged and are never resent.
   * A raised daily limit releases budget-only holds before UTC reset; host pacing, concurrency and scout fences still apply.
   */
  async claim(
    dailyDocuments: number,
    concurrency: number,
  ): Promise<MonitorClaim> {
    return this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      const found =
        await sql<MonitorRow>`SELECT m.id,m.url,m.kind,m.depth,m.fingerprint,m.unchanged,m.failures,m.pending_key FROM web_source_monitors m
        WHERE m.status IN ('active','deferred','pending_review')
        AND (m.next_check_at<=now() OR (
          m.status='deferred' AND m.reason='daily_budget_reached' AND m.pending_key IS NULL
          AND COALESCE((SELECT requests FROM web_discovery_usage WHERE provider='public-documents' AND day=(now() AT TIME ZONE 'UTC')::date),0)<${dailyDocuments}
        ))
        AND EXISTS(SELECT 1 FROM web_source_interests i JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active' WHERE i.monitor_id=m.id)
        ORDER BY m.next_check_at,m.id FOR UPDATE OF m SKIP LOCKED LIMIT 20`.execute(
          tx,
        );
      const history = await new PostgresDiscoveryPerformanceRepository(
        tx,
      ).samples(
        found.rows.map((row) => sourceRoute("public-documents", row.url)),
      );
      const usage = await sql<{
        requests: number;
      }>`SELECT requests FROM web_discovery_usage WHERE provider='public-documents' AND day=(now() AT TIME ZONE 'UTC')::date`.execute(
        tx,
      );
      const monitor =
        found.rows.find((row) => row.pending_key) ??
        prioritizeDiscovery(
          found.rows,
          (row) =>
            history.get(sourceRoute("public-documents", row.url).id) ??
            emptyDiscoveryPerformance(),
          usage.rows[0]?.requests ?? 0,
        )[0];
      if (!monitor) {
        return { status: "done" };
      }
      const epoch = await sql<{
        value: number;
      }>`SELECT floor(extract(epoch FROM now())/1800)::int AS value`.execute(
        tx,
      );
      const key =
        monitor.pending_key ??
        discoveryKey(["public-document-v5", monitor.url, epoch.rows[0]!.value]);
      await sql`INSERT INTO web_discovery_operations(key,provider,kind,input) VALUES(${key},'public-documents','document',${JSON.stringify({ kind: "document", url: monitor.url })}::jsonb) ON CONFLICT DO NOTHING`.execute(
        tx,
      );
      await sql`UPDATE web_source_monitors SET pending_key=${key},next_check_at=LEAST(next_check_at,now()) WHERE id=${monitor.id}`.execute(
        tx,
      );
      const operation = await sql<{
        state: string;
        expired: boolean;
        result: SourceDocumentResult | null;
      }>`SELECT state,lease_until<=now() AS expired,result FROM web_discovery_operations WHERE key=${key} FOR UPDATE`.execute(
        tx,
      );
      const work = operation.rows[0]!;
      if (work.state === "running" && work.expired) {
        await sql`UPDATE web_discovery_operations SET state='failed',failure='attempt_outcome_unknown',finished_at=now() WHERE key=${key}`.execute(
          tx,
        );
        return { status: "observed", key, monitor, result: null };
      }
      if (work.state === "running") {
        await this.defer(tx, monitor.id, 5);
        return { status: "progress" };
      }
      if (work.state === "succeeded" || work.state === "failed") {
        return { status: "observed", key, monitor, result: work.result };
      }
      const admission = await new PostgresDocumentAdmissionRepository(
        tx,
      ).reserve(
        key,
        monitor.url,
        dailyDocuments,
        concurrency,
        (usage.rows[0]?.requests ?? 0) % 5 === 0
          ? "oldest_due"
          : "measured_yield",
      );
      if (admission.status === "budget") {
        await sql`UPDATE web_source_monitors SET status='deferred',reason='daily_budget_reached',pending_key=NULL,next_check_at=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'+interval '1 day' WHERE id=${monitor.id}`.execute(
          tx,
        );
        return { status: "done" };
      }
      if (admission.status === "waiting") {
        await this.defer(tx, monitor.id, 5);
        return { status: "progress" };
      }
      return {
        status: "claimed",
        key,
        token: admission.token,
        url: monitor.url,
      };
    });
  }

  /** Moves a busy source to the back of the due queue, preventing one slow host from starving other sources. */
  private async defer(
    tx: Kysely<ScoutAlertDatabase>,
    id: string,
    seconds: number,
  ): Promise<void> {
    await sql`UPDATE web_source_monitors SET next_check_at=now()+make_interval(secs=>${seconds}) WHERE id=${id}`.execute(
      tx,
    );
  }

  /** Receipts and subscriber notifications commit together; repeated activity completion cannot duplicate downstream work. */
  async settle(
    claim: Extract<MonitorClaim, { status: "observed" }>,
    outcome: MonitorOutcome,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      await new PostgresMonitorReceiptRepository(
        tx,
        this.maximumSources,
      ).accept(claim, outcome);
    });
  }

  /** Dispatches one bounded fair batch; untouched notifications remain durable for subsequent schedule ticks. */
  async dispatch(): Promise<number> {
    return this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      return new PostgresMonitorDispatchRepository(tx).dispatch();
    });
  }
}
