import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { DiscoveryPlan } from "@repo/core/discovery";
import type { SearchDraft } from "@repo/core/onboarding";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Coalesces source observations into current-revision scout workflows without another paid search portfolio. */
export class PostgresMonitorDispatchRepository {
  /** Uses the same source-first transaction as monitor receipts and normal discovery publication. */
  constructor(private readonly tx: Kysely<ScoutAlertDatabase>) {}

  /** Fairly selects up to 50 idle scouts; pending updates survive outages, contention and worker restarts. */
  async dispatch(): Promise<number> {
    const scouts = await sql<{
      id: string;
      owner_id: string;
      version: number;
      search: SearchDraft;
    }>`SELECT s.id,s.owner_id,s.version,s.search FROM scouts s
      WHERE s.status='active' AND s.monitoring_requested_at<now()-interval '2 minutes'
      AND EXISTS(SELECT 1 FROM web_source_updates u WHERE u.scout_id=s.id AND u.owner_id=s.owner_id AND u.scout_version=s.version AND u.case_id IS NULL)
      AND NOT EXISTS(SELECT 1 FROM outbox_events e WHERE e.aggregate_id=s.id AND e.published_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM discovery_runs r WHERE r.scout_id=s.id AND r.status='searching' AND r.started_at>now()-interval '20 minutes')
      AND NOT EXISTS(SELECT 1 FROM web_discovery_cases c WHERE c.scout_id=s.id AND ((c.status='searching' AND c.deadline>now()) OR c.started_at>now()-interval '5 minutes'))
      ORDER BY s.monitoring_requested_at,s.id FOR UPDATE OF s SKIP LOCKED LIMIT 50`.execute(
      this.tx,
    );
    let dispatched = 0;
    for (const scout of scouts.rows) {
      const updates = await sql<{
        operation_key: string;
        monitor_id: string;
      }>`SELECT DISTINCT ON(u.monitor_id) u.operation_key,u.monitor_id FROM web_source_updates u
        JOIN web_discovery_leads l ON l.id=u.monitor_id
        WHERE u.scout_id=${scout.id}::uuid AND u.owner_id=${scout.owner_id}::uuid AND u.scout_version=${scout.version} AND u.case_id IS NULL
        AND l.content_status='fetched' AND l.checked_at>now()-interval '30 minutes'
        ORDER BY u.monitor_id,u.created_at DESC LIMIT 4`.execute(this.tx);
      if (!updates.rows.length) {
        continue;
      }
      const id = randomUUID();
      const plan: DiscoveryPlan = {
        policy: "public-intent-v3",
        origin: "source_monitor",
        scoutVersion: scout.version,
        category: scout.search.category,
        queries: [],
        maximumDocuments: 4,
        deadlineSeconds: 240,
        continuation: "explore_on_next_run",
        blockedReason: null,
      };
      await sql`INSERT INTO web_discovery_cases(id,scout_id,owner_id,scout_version,plan,provider,status,reason,deadline,finished_at) VALUES(${id}::uuid,${scout.id}::uuid,${scout.owner_id}::uuid,${scout.version},${JSON.stringify(plan)}::jsonb,'public-documents','completed','monitored_sources_checked',now()+interval '4 minutes',now())`.execute(
        this.tx,
      );
      for (const [position, update] of updates.rows.entries()) {
        await sql`INSERT INTO web_discovery_case_leads(case_id,lead_id) VALUES(${id}::uuid,${update.monitor_id})`.execute(
          this.tx,
        );
        await sql`INSERT INTO web_discovery_steps(case_id,position,operation_key,applied) VALUES(${id}::uuid,${position},${update.operation_key},true)`.execute(
          this.tx,
        );
        await sql`UPDATE web_source_updates SET case_id=${id}::uuid WHERE scout_id=${scout.id}::uuid AND scout_version=${scout.version} AND monitor_id=${update.monitor_id} AND case_id IS NULL`.execute(
          this.tx,
        );
      }
      await sql`INSERT INTO outbox_events(id,owner_id,aggregate_id,aggregate_version,event_type,deduplication_key,payload,created_at) VALUES(${id}::uuid,${scout.owner_id}::uuid,${scout.id}::uuid,${scout.version},'scout.refresh_requested',${`source-monitor:${id}`},${JSON.stringify({ scoutId: scout.id, ownerId: scout.owner_id, version: scout.version })}::jsonb,now())`.execute(
        this.tx,
      );
      await sql`UPDATE scouts SET monitoring_requested_at=now() WHERE id=${scout.id}::uuid`.execute(
        this.tx,
      );
      dispatched++;
    }
    return dispatched;
  }
}
