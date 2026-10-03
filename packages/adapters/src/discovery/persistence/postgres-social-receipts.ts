import { sql, type Kysely } from "kysely";
import {
  emptyDiscoveryPerformance,
  nativeRevisitMinutes,
  queryRevisitMinutes,
  type SocialClaim,
  type SocialResult,
  type SocialProviderError,
} from "@repo/core/discovery";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { discoveryKey } from "./discovery-identities.js";
import { PostgresDiscoveryLeadRepository } from "./postgres-discovery-leads.js";
import { PostgresSocialRetentionRepository } from "./postgres-social-retention.js";
import { PostgresSocialContextRepository } from "./postgres-social-context.js";
import {
  PostgresDiscoveryPerformanceRepository,
  queryRoute,
} from "./postgres-discovery-performance.js";

type Claimed = Extract<SocialClaim, { status: "claimed" }>;

/** Accepts native receipts atomically with evidence, observations and window progress. */
export class PostgresSocialReceiptRepository {
  /** Uses the caller's source-locked transaction; external calls already completed outside it. */
  constructor(private readonly tx: Kysely<ScoutAlertDatabase>) {}

  /** Only the exact leased operation may publish; audit results retain identities and counts rather than duplicate post bodies. */
  async complete(claim: Claimed, result: SocialResult): Promise<void> {
    const active = await this.active(claim);
    if (!active) {
      return;
    }
    let added = 0;
    let overlap = 0;
    const leadIds: string[] = [];
    for (const doc of [...result.documents].sort((a, b) =>
      a.url.localeCompare(b.url),
    )) {
      const leadId = discoveryKey(doc.url);
      leadIds.push(leadId);
      const prior =
        await sql`SELECT 1 FROM web_discovery_observations observation JOIN web_discovery_operations operation ON operation.key=observation.operation_key WHERE observation.lead_id=${leadId} AND operation.provider='serper' LIMIT 1`.execute(
          this.tx,
        );
      overlap += prior.rows.length ? 1 : 0;
      await sql`INSERT INTO web_discovery_leads(id,url,source,title,first_seen_at,last_seen_at) VALUES(${leadId},${doc.url},'x.com',NULL,${result.checkedAt}::timestamptz,${result.checkedAt}::timestamptz) ON CONFLICT(id) DO UPDATE SET last_seen_at=greatest(web_discovery_leads.last_seen_at,excluded.last_seen_at)`.execute(
        this.tx,
      );
      const known = await sql<{
        unchanged: number;
        label: string | null;
      }>`SELECT p.unchanged,v.result->>'label' AS label FROM x_posts p JOIN web_discovery_leads l ON l.id=p.lead_id LEFT JOIN web_lead_reviews v ON v.key=l.review_key AND v.state='ready' AND v.input->>'scope'='source' AND coalesce((v.input->>'truncated')::boolean,false)=false WHERE p.lead_id=${leadId}`.execute(
        this.tx,
      );
      added += known.rows.length ? 0 : 1;
      const changed =
        await sql`SELECT 1 FROM web_discovery_leads WHERE id=${leadId} AND (document IS NULL OR document->>'text' IS DISTINCT FROM ${doc.text} OR document->'nativePost' IS DISTINCT FROM ${JSON.stringify(doc.nativePost)}::jsonb)`.execute(
          this.tx,
        );
      if (changed.rows.length > 0) {
        await new PostgresSocialRetentionRepository(this.tx).invalidateContext(
          doc.nativePost.editIds,
        );
      }
      const unchanged = changed.rows.length
        ? 0
        : Math.min(1024, (known.rows[0]?.unchanged ?? 0) + 1);
      const revisit = nativeRevisitMinutes(
        changed.rows.length ? null : (known.rows[0]?.label ?? null),
        unchanged,
      );
      await new PostgresDiscoveryLeadRepository(this.tx).acceptDocument(doc);
      await sql`INSERT INTO x_posts(lead_id,post_id,edit_ids,expires_at,next_check_at,unchanged) VALUES(${leadId},${doc.nativePost.id},${doc.nativePost.editIds}::text[],${doc.checkedAt}::timestamptz+interval '24 hours',now()+make_interval(mins=>${revisit}),${unchanged}) ON CONFLICT(lead_id) DO UPDATE SET post_id=excluded.post_id,edit_ids=excluded.edit_ids,expires_at=excluded.expires_at,next_check_at=excluded.next_check_at,unchanged=excluded.unchanged,unavailable=false,context_due_at=now()`.execute(
        this.tx,
      );
      if (active.query_id) {
        await sql`INSERT INTO x_query_posts(query_id,lead_id) VALUES(${active.query_id},${leadId}) ON CONFLICT(query_id,lead_id) DO UPDATE SET is_context=false`.execute(
          this.tx,
        );
      }
      await sql`INSERT INTO x_query_posts(query_id,lead_id,is_context)
        SELECT DISTINCT q.query_id,${leadId},true FROM x_context_dependencies d JOIN x_query_posts q ON q.lead_id=d.lead_id WHERE d.post_id=ANY(${doc.nativePost.editIds}::text[])
        ON CONFLICT DO NOTHING`.execute(this.tx);
      await new PostgresSocialContextRepository(this.tx).observed(doc);
      await sql`INSERT INTO web_discovery_observations(operation_key,lead_id,rank,title,snippet,observed_at) VALUES(${claim.key},${leadId},${leadIds.length},NULL,NULL,${result.checkedAt}::timestamptz) ON CONFLICT DO NOTHING`.execute(
        this.tx,
      );
      await sql`INSERT INTO x_source_updates(lead_id,scout_id,owner_id,scout_version,observed_at)
        SELECT DISTINCT ${leadId},s.id,s.owner_id,s.version,${doc.checkedAt}::timestamptz FROM x_query_posts p
        JOIN x_search_interests i ON i.query_id=p.query_id JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active'
        WHERE p.lead_id=${leadId}
        ON CONFLICT(lead_id,scout_id,scout_version) DO UPDATE SET observed_at=excluded.observed_at,case_id=CASE WHEN ${changed.rows.length > 0} OR x_source_updates.observed_at<excluded.observed_at-interval '5 minutes' THEN NULL ELSE x_source_updates.case_id END`.execute(
        this.tx,
      );
    }
    const removed = await sql<{
      lead_id: string;
    }>`SELECT lead_id FROM x_posts WHERE edit_ids && ${result.unavailableIds}::text[]`.execute(
      this.tx,
    );
    await new PostgresSocialRetentionRepository(this.tx).withdraw(
      removed.rows.map((row) => row.lead_id),
    );
    await new PostgresSocialRetentionRepository(this.tx).invalidateContext(
      result.unavailableIds,
    );
    await new PostgresSocialContextRepository(this.tx).unavailable(
      result.unavailableIds,
    );
    await new PostgresDiscoveryPerformanceRepository(this.tx).settle(
      claim.key,
      result.documents.map((doc) => doc.url),
      !result.partial,
    );
    await sql`UPDATE web_discovery_operations SET state='succeeded',result=${JSON.stringify({ kind: "search", checkedAt: result.checkedAt, observations: result.documents.map((doc, index) => ({ url: doc.url, rank: index + 1, title: null, snippet: null })), nextPage: null, completeness: "window" })}::jsonb,finished_at=now(),lease_until=NULL WHERE key=${claim.key}`.execute(
      this.tx,
    );
    await sql`UPDATE x_search_attempts SET returned_posts=${result.documents.length},new_posts=${added},overlap_posts=${overlap},partial=${result.partial},latency_ms=(SELECT least(2147483647,extract(epoch FROM now()-created_at)*1000)::int FROM web_discovery_operations WHERE key=${claim.key}) WHERE key=${claim.key}`.execute(
      this.tx,
    );
    await sql`UPDATE x_access_state SET next_allowed_at=greatest(next_allowed_at,now()+make_interval(secs=>${result.retryAfterSeconds})),reason=${result.retryAfterSeconds ? "rate_limited" : null} WHERE id=1`.execute(
      this.tx,
    );
    if (active.query_id) {
      await this.advance(active.query_id, result);
    }
  }

  /** Incomplete pages retain their cursor; only the last successful page closes the fixed time window. */
  private async advance(queryId: string, result: SocialResult): Promise<void> {
    if (result.partial) {
      await sql`UPDATE x_search_queries SET pending_key=NULL,next_check_at=now()+interval '5 minutes',last_checked_at=now(),reason='partial_response' WHERE id=${queryId}`.execute(
        this.tx,
      );
      return;
    }
    if (result.nextToken) {
      await sql`UPDATE x_search_queries SET pending_key=NULL,next_token=${result.nextToken},next_check_at=now()+interval '2 seconds',last_checked_at=now(),reason='more_pages' WHERE id=${queryId}`.execute(
        this.tx,
      );
      return;
    }
    const query = await sql<{
      query: string;
    }>`SELECT query FROM x_search_queries WHERE id=${queryId}`.execute(this.tx);
    const route = queryRoute("x-api", query.rows[0]!.query);
    const history = await new PostgresDiscoveryPerformanceRepository(
      this.tx,
    ).samples([route]);
    const revisit = queryRevisitMinutes(
      history.get(route.id) ?? emptyDiscoveryPerformance(),
    );
    await sql`UPDATE x_search_queries SET pending_key=NULL,covered_until=window_end,window_start=NULL,window_end=NULL,next_token=NULL,next_check_at=now()+make_interval(mins=>${revisit}),last_checked_at=now(),reason='recent_window_checked' WHERE id=${queryId}`.execute(
      this.tx,
    );
  }

  /** Access and rate failures pause the provider; cursor rejection restarts the same bounded window and records the interruption. */
  async fail(claim: Claimed, error: SocialProviderError): Promise<void> {
    const active = await this.active(claim);
    if (!active) {
      return;
    }
    await sql`UPDATE web_discovery_operations SET state='failed',failure=${error.reason},finished_at=now(),lease_until=NULL WHERE key=${claim.key}`.execute(
      this.tx,
    );
    await sql`UPDATE x_search_queries SET pending_key=NULL,next_check_at=now()+make_interval(secs=>${Math.max(60, error.retryAfterSeconds)}),next_token=CASE WHEN ${error.reason === "invalid_cursor"} THEN NULL ELSE next_token END,reason=${error.reason} WHERE id=${active.query_id}`.execute(
      this.tx,
    );
    if (
      error.reason === "rate_limited" ||
      error.reason === "access_unavailable"
    ) {
      await sql`UPDATE x_access_state SET next_allowed_at=greatest(next_allowed_at,now()+make_interval(secs=>${error.retryAfterSeconds})),reason=${error.reason} WHERE id=1`.execute(
        this.tx,
      );
    }
  }

  /** Validates supplied operation identity against durable input to prevent a forged or replayed receipt. */
  private async active(
    claim: Claimed,
  ): Promise<{ query_id: string | null } | undefined> {
    const rows = await sql<{
      query_id: string | null;
    }>`SELECT a.query_id FROM web_discovery_operations o JOIN x_search_attempts a ON a.key=o.key
      WHERE o.key=${claim.key} AND o.provider='x-api' AND o.state='running' AND o.lease_token=${claim.token}::uuid AND o.lease_until>now() AND o.input=${JSON.stringify(claim.operation)}::jsonb FOR UPDATE OF o`.execute(
      this.tx,
    );
    return rows.rows[0];
  }
}
