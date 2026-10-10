import { sql, type Kysely } from "kysely";
import {
  WebDiscoveryCatalogRepository,
  type DiscoveryCaseView,
  type DiscoveryLeadView,
  type WebDiscoveryView,
  type SourceMonitorView,
} from "@repo/core/discovery";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Reads public leads exclusively through current account-owned case associations. */
export class PostgresWebDiscoveryCatalogRepository extends WebDiscoveryCatalogRepository {
  /** Receives the native pool at the API composition root. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Bounds results independently of user count and keeps unassessed leads separate from recommendations. */
  async read(ownerId: string): Promise<WebDiscoveryView> {
    const [cases, leads, monitors] = await Promise.all([
      sql<DiscoveryCaseView>`SELECT DISTINCT ON(c.scout_id) c.id,c.scout_id AS "scoutId",s.name AS "scoutName",c.scout_version AS "scoutVersion",c.provider,c.plan->'strategy' AS strategy,
        coalesce((SELECT jsonb_agg(jsonb_build_object('reason',d.reason,'kind',d.action->>'kind','target',CASE WHEN d.action->>'kind'='search' THEN d.action->'query'->>'query' ELSE d.action->>'url' END) ORDER BY d.round) FROM web_discovery_decisions d WHERE d.case_id=c.id),'[]'::jsonb) AS exploration,
        CASE WHEN rc.status IN ('pending','reviewing') AND rc.deadline<=now() THEN 'deferred' ELSE rc.status END AS "reviewStatus",CASE WHEN rc.status IN ('pending','reviewing') AND rc.deadline<=now() THEN 'review_window_ended' ELSE rc.reason END AS "reviewReason",
        CASE WHEN c.status='searching' AND c.deadline<=now() THEN 'deferred' ELSE c.status END AS status,
        CASE WHEN c.status='searching' AND c.deadline<=now() THEN 'deadline_reached' ELSE c.reason END AS reason,
        c.started_at::text AS "startedAt",c.finished_at::text AS "finishedAt",
        (SELECT count(*)::integer FROM web_discovery_steps s JOIN web_discovery_operations o ON o.key=s.operation_key WHERE s.case_id=c.id AND s.applied AND o.kind='search' AND o.state='succeeded') AS "searchesCompleted",
        (SELECT count(*)::integer FROM web_discovery_steps s JOIN web_discovery_operations o ON o.key=s.operation_key WHERE s.case_id=c.id AND s.applied AND o.kind='document' AND o.state='succeeded') AS "documentsChecked",
        (SELECT count(*)::integer FROM web_discovery_case_leads l WHERE l.case_id=c.id) AS "leadCount"
        FROM web_discovery_cases c LEFT JOIN web_lead_review_cases rc ON rc.case_id=c.id JOIN scouts s ON s.id=c.scout_id AND s.owner_id=c.owner_id AND s.version=c.scout_version WHERE c.owner_id=${ownerId}::uuid ORDER BY c.scout_id,c.started_at DESC LIMIT 20`.execute(
        this.db,
      ),
      sql<DiscoveryLeadView>`SELECT l.id,l.url,l.title,l.snippet,l.source,l.document->'nativePost' AS "nativePost",l.document->'nativeContext' AS "nativeContext",l.first_seen_at::text AS "firstSeenAt",l.last_seen_at::text AS "lastSeenAt",l.checked_at::text AS "checkedAt",l.content_status AS "contentStatus",l.document->>'reason' AS "contentReason",left(l.document->>'text',16000) AS content,l.posting_id AS "postingId",CASE WHEN r.state='ready' THEN jsonb_build_object('label',r.result->>'label','scope',r.input->>'scope','explanation',r.result->>'explanation','quotes',r.result->'quotes','reviewedAt',r.reviewed_at::text,'facts',r.result->'analysis'->'facts') ELSE NULL END AS review,array_agg(DISTINCT s.name) AS scouts
        FROM web_discovery_leads l LEFT JOIN web_lead_reviews r ON r.key=l.review_key JOIN web_discovery_case_leads cl ON cl.lead_id=l.id JOIN web_discovery_cases c ON c.id=cl.case_id JOIN scouts s ON s.id=c.scout_id AND s.owner_id=c.owner_id AND s.version=c.scout_version
        WHERE c.owner_id=${ownerId}::uuid AND c.status<>'cancelled' AND c.started_at>now()-interval '7 days'
        GROUP BY l.id,r.key ORDER BY l.last_seen_at DESC,l.id LIMIT 40`.execute(
        this.db,
      ),
      sql<SourceMonitorView>`SELECT l.title,m.url,m.kind,m.status,m.reason,m.checked_at::text AS "checkedAt",m.next_check_at::text AS "nextCheckAt",m.checks,m.changes,m.discovered_links AS "discoveredLinks",array_agg(DISTINCT s.name) AS scouts
        FROM web_source_monitors m JOIN web_discovery_leads l ON l.id=m.id JOIN web_source_interests i ON i.monitor_id=m.id
        JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active'
        WHERE s.owner_id=${ownerId}::uuid GROUP BY m.id,l.id ORDER BY m.updated_at DESC,m.id LIMIT 40`.execute(
        this.db,
      ),
    ]);

    return {
      cases: cases.rows,
      monitors: monitors.rows,
      leads: leads.rows.map((lead) => ({
        ...lead,
        content: transportExcerpt(lead.content),
      })),
    };
  }
}

/** PostgreSQL counts Unicode characters while JavaScript validators count UTF-16 units; preserve whole code points within both limits. */
function transportExcerpt(value: string | null): string | null {
  return value === null
    ? null
    : value.slice(0, 16000).replace(/[\uD800-\uDBFF]$/u, "");
}
