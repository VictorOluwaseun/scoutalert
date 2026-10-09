import { sql, type Kysely } from "kysely";
import type {
  DiscoveryPlan,
  SourceDocumentResult,
  WebSearchResult,
} from "@repo/core/discovery";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { canonicalDiscoveryUrl, discoveryKey } from "./discovery-identities.js";

/** Applies public observations and evidence inside the coordinator's explicit current-revision transaction. */
export class PostgresDiscoveryLeadRepository {
  /** Receives the same transaction as case acceptance; no independent connection is opened. */
  constructor(private readonly tx: Kysely<ScoutAlertDatabase>) {}

  /** Retains incomplete leads and source candidates; source absence never withdraws earlier opportunities. */
  async acceptSearch(
    caseId: string,
    operationKey: string,
    result: WebSearchResult,
    plan: DiscoveryPlan,
    epoch: number,
  ): Promise<void> {
    const existing = await sql<{
      count: number;
      position: number;
    }>`SELECT count(*) FILTER(WHERE o.kind='document')::integer AS count,coalesce(max(s.position),0)::integer AS position FROM web_discovery_steps s JOIN web_discovery_operations o ON o.key=s.operation_key WHERE s.case_id=${caseId}::uuid`.execute(
      this.tx,
    );
    const initialAllowance =
      plan.policy === "public-intent-v3"
        ? 0
        : plan.exploration
          ? Math.ceil(plan.maximumDocuments / 2)
          : plan.maximumDocuments;
    let remaining = Math.min(
      Math.ceil(plan.maximumDocuments / Math.max(1, plan.queries.length)),
      Math.max(0, initialAllowance - (existing.rows[0]?.count ?? 0)),
    );
    let position = existing.rows[0]?.position ?? 0;
    const candidates = result.observations
      .flatMap((observation) => {
        const url = canonicalDiscoveryUrl(observation.url);

        return url ? [{ ...observation, url, id: discoveryKey(url) }] : [];
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const item of candidates) {
      const hostname = new URL(item.url).hostname;
      await sql`INSERT INTO web_discovery_leads(id,url,source,title,snippet,first_seen_at,last_seen_at) VALUES(${item.id},${item.url},${hostname},${item.title},${item.snippet},${result.checkedAt}::timestamptz,${result.checkedAt}::timestamptz) ON CONFLICT(id) DO UPDATE SET review_key=CASE WHEN web_discovery_leads.content_status<>'fetched' AND (coalesce(excluded.title,web_discovery_leads.title) IS DISTINCT FROM web_discovery_leads.title OR coalesce(excluded.snippet,web_discovery_leads.snippet) IS DISTINCT FROM web_discovery_leads.snippet) THEN NULL ELSE web_discovery_leads.review_key END,last_seen_at=excluded.last_seen_at,title=coalesce(excluded.title,web_discovery_leads.title),snippet=coalesce(excluded.snippet,web_discovery_leads.snippet) WHERE excluded.last_seen_at>=web_discovery_leads.last_seen_at`.execute(
        this.tx,
      );
      await sql`INSERT INTO web_discovery_observations(operation_key,lead_id,rank,title,snippet,observed_at) VALUES(${operationKey},${item.id},${item.rank},${item.title},${item.snippet},${result.checkedAt}::timestamptz) ON CONFLICT DO NOTHING`.execute(
        this.tx,
      );
      await sql`INSERT INTO web_discovery_case_leads(case_id,lead_id) VALUES(${caseId}::uuid,${item.id}) ON CONFLICT DO NOTHING`.execute(
        this.tx,
      );
    }

    const hosts = new Map(
      candidates.map((item) => [new URL(item.url).hostname, item.url]),
    );

    for (const [hostname, url] of [...hosts].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      await sql`INSERT INTO web_source_candidates(hostname,example_url,first_seen_at,last_seen_at) VALUES(${hostname},${url},${result.checkedAt}::timestamptz,${result.checkedAt}::timestamptz) ON CONFLICT(hostname) DO UPDATE SET last_seen_at=greatest(web_source_candidates.last_seen_at,excluded.last_seen_at)`.execute(
        this.tx,
      );
    }

    for (const item of candidates.sort((a, b) => a.rank - b.rank)) {
      if (remaining === 0) {
        break;
      }

      const key = discoveryKey([
        plan.exploration ? "public-document-v5" : "public-document-v1",
        item.url,
        epoch,
      ]);
      await sql`INSERT INTO web_discovery_operations(key,provider,kind,input) VALUES(${key},'public-documents','document',${JSON.stringify({ kind: "document", url: item.url })}::jsonb) ON CONFLICT DO NOTHING`.execute(
        this.tx,
      );
      const added =
        await sql`INSERT INTO web_discovery_steps(case_id,position,operation_key) VALUES(${caseId}::uuid,${position + 1},${key}) ON CONFLICT(case_id,operation_key) DO NOTHING RETURNING position`.execute(
          this.tx,
        );

      if (added.rows.length) {
        position += 1;
        remaining -= 1;
      }
    }
  }

  /** Stores retrieval status separately from availability; changed or inaccessible content withholds prior web postings until reviewed again. */
  async acceptDocument(result: SourceDocumentResult): Promise<void> {
    const leadId = discoveryKey(result.url);
    const current = await sql<{
      checked_at: Date | null;
      native: boolean;
    }>`SELECT checked_at,document->'nativePost' IS NOT NULL AS native FROM web_discovery_leads WHERE id=${leadId} FOR UPDATE`.execute(
      this.tx,
    );

    if (
      !current.rows.length ||
      (current.rows[0]!.native && !result.nativePost) ||
      (current.rows[0]!.checked_at &&
        current.rows[0]!.checked_at > new Date(result.checkedAt))
    ) {
      return;
    }

    await sql`UPDATE opportunity_postings SET open=false WHERE id=(SELECT posting_id FROM web_discovery_leads WHERE id=${leadId}) AND source_id IN ('web-discovery','web-client-requests') AND EXISTS(SELECT 1 FROM web_discovery_leads WHERE id=${leadId} AND (document->>'fingerprint' IS DISTINCT FROM ${result.fingerprint} OR ${result.status}<>'fetched'))`.execute(
      this.tx,
    );
    await sql`UPDATE web_discovery_leads SET checked_at=${result.checkedAt}::timestamptz,content_status=${result.status},review_key=CASE WHEN document->>'fingerprint' IS DISTINCT FROM ${result.fingerprint} OR content_status<>${result.status} THEN NULL ELSE review_key END,document=${JSON.stringify(result)}::jsonb WHERE id=${leadId}`.execute(
      this.tx,
    );
  }
}
