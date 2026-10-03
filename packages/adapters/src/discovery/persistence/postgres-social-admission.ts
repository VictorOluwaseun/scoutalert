import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  emptyDiscoveryPerformance,
  nativeAdmissionDelay,
  prioritizeDiscovery,
  type SocialLimits,
  type SocialClaim,
  type SocialOperation,
} from "@repo/core/discovery";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import {
  PostgresDiscoveryPerformanceRepository,
  queryRoute,
  sourceRoute,
} from "./postgres-discovery-performance.js";

/** Admits a single native operation, alternating refresh capacity with search and preserving unfinished windows. */
export class PostgresSocialAdmissionRepository {
  /** Participates in the source-locked transaction shared by native receipts and web publication. */
  constructor(private readonly tx: Kysely<ScoutAlertDatabase>) {}

  /** Reserves worst-case returned-post cost; failures and provider billing deduplication never refund the local envelope. */
  async claim(limits: SocialLimits): Promise<SocialClaim> {
    await this.recover();
    const available =
      await sql`SELECT id FROM x_access_state WHERE id=1 AND next_allowed_at<=now() FOR UPDATE`.execute(
        this.tx,
      );
    if (!available.rows.length) {
      return { status: "done" };
    }
    const busy =
      await sql`SELECT 1 FROM web_discovery_operations WHERE provider='x-api' AND state='running' AND lease_until>now() LIMIT 1`.execute(
        this.tx,
      );
    if (busy.rows.length) {
      return { status: "waiting" };
    }
    await sql`INSERT INTO web_discovery_usage(provider,day) VALUES('x-api',(now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`.execute(
      this.tx,
    );
    const usage = await sql<{
      requests: number;
      reserved_micros: number;
    }>`SELECT requests,reserved_micros::float8 FROM web_discovery_usage WHERE provider='x-api' AND day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE`.execute(
      this.tx,
    );
    const queries = await sql<{
      id: string;
      query: string;
      start: Date;
      end: Date;
      next_token: string | null;
      gap: boolean;
    }>`
      SELECT q.id,q.query,
        greatest(coalesce(q.window_start,q.covered_until-interval '1 minute',now()-interval '1 day'),now()-interval '6 days 23 hours') AS start,
        CASE WHEN q.window_start<now()-interval '6 days 23 hours' THEN now()-interval '30 seconds' ELSE coalesce(q.window_end,now()-interval '30 seconds') END AS "end",
        CASE WHEN q.window_start<now()-interval '6 days 23 hours' THEN NULL ELSE q.next_token END AS next_token,
        coalesce(q.window_start,q.covered_until)<now()-interval '6 days 23 hours' AS gap
      FROM x_search_queries q WHERE q.next_check_at<=now() AND q.pending_key IS NULL
      AND EXISTS(SELECT 1 FROM x_search_interests i JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active' WHERE i.query_id=q.id)
      ORDER BY q.next_check_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT 20`.execute(
      this.tx,
    );
    const posts = await sql<{
      post_id: string;
    }>`SELECT p.post_id FROM x_posts p WHERE NOT p.unavailable AND p.next_check_at<=now()
      AND EXISTS(SELECT 1 FROM x_query_posts qp JOIN x_search_interests i ON i.query_id=qp.query_id JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active' WHERE qp.lead_id=p.lead_id)
      ORDER BY p.next_check_at,p.lead_id FOR UPDATE OF p SKIP LOCKED LIMIT ${limits.pageSize}`.execute(
      this.tx,
    );
    const context = await sql<{
      post_id: string;
    }>`SELECT c.post_id FROM x_context_requests c WHERE c.next_check_at<=now()
      AND EXISTS(SELECT 1 FROM x_context_dependencies d JOIN x_posts p ON p.lead_id=d.lead_id JOIN web_discovery_leads l ON l.id=p.lead_id LEFT JOIN web_lead_reviews v ON v.key=l.review_key AND v.state='ready' JOIN x_query_posts q ON q.lead_id=p.lead_id JOIN x_search_interests i ON i.query_id=q.query_id JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active' WHERE d.post_id=c.post_id AND NOT p.unavailable AND p.expires_at>now() AND (p.next_check_at<=now() OR coalesce(v.result->>'label','unknown') NOT IN ('closed','service_offer','discussion')))
      AND NOT EXISTS(SELECT 1 FROM x_posts p JOIN web_discovery_leads l ON l.id=p.lead_id WHERE p.edit_ids @> ARRAY[c.post_id]::text[] AND NOT p.unavailable AND p.expires_at>now() AND l.checked_at>now()-interval '10 minutes')
      ORDER BY c.next_check_at,c.post_id FOR UPDATE OF c SKIP LOCKED LIMIT ${limits.pageSize}`.execute(
      this.tx,
    );
    const performance = new PostgresDiscoveryPerformanceRepository(this.tx);
    const history = await performance.samples(
      queries.rows.map((row) => queryRoute("x-api", row.query)),
    );
    const count = usage.rows[0]!.requests;
    const exploring = count % 5 === 0 && queries.rows.length > 0;
    const query = prioritizeDiscovery(
      queries.rows,
      (row) =>
        history.get(queryRoute("x-api", row.query).id) ??
        emptyDiscoveryPerformance(),
      count,
    )[0];
    const slot = count % 3;
    const expanding =
      !exploring &&
      context.rows.length > 0 &&
      (slot === 1 || (!query && !posts.rows.length));
    const refreshing =
      !exploring &&
      !expanding &&
      posts.rows.length > 0 &&
      (slot === 2 || !query);
    if (!query && !expanding && !refreshing) {
      return { status: "done" };
    }
    const operation: SocialOperation = expanding
      ? {
          kind: "lookup",
          ids: context.rows.map((p) => p.post_id),
          purpose: "context",
        }
      : refreshing
        ? { kind: "lookup", ids: posts.rows.map((p) => p.post_id) }
        : {
            kind: "search",
            query: query!.query,
            startTime: query!.start.toISOString(),
            endTime: query!.end.toISOString(),
            nextToken: query!.next_token,
            limit: limits.pageSize,
          };
    const cost =
      (operation.kind === "lookup" ? operation.ids.length : operation.limit) *
      limits.postCostMicros;
    const recent = await sql<{
      created_at: Date;
    }>`SELECT created_at FROM web_discovery_operations WHERE provider='x-api' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' ORDER BY created_at DESC LIMIT 1`.execute(
      this.tx,
    );
    const delay =
      limits.paceAcrossDay === false
        ? 0
        : nativeAdmissionDelay({
            now: new Date(),
            lastAttemptAt: recent.rows[0]?.created_at ?? null,
            requests: count,
            reservedMicros: usage.rows[0]!.reserved_micros,
            dailyRequests: limits.dailyRequests,
            dailyMicros: limits.dailyMicros,
            nextCostMicros: cost,
          });
    if (delay > 0) {
      await sql`UPDATE x_search_queries SET reason='budget_pacing' WHERE id=${query?.id ?? ""}`.execute(
        this.tx,
      );
      return { status: "done" };
    }
    const reserved =
      await sql`UPDATE web_discovery_usage SET requests=requests+1,reserved_micros=reserved_micros+${cost} WHERE provider='x-api' AND day=(now() AT TIME ZONE 'UTC')::date AND requests<${limits.dailyRequests} AND reserved_micros+${cost}<=${limits.dailyMicros} RETURNING requests`.execute(
        this.tx,
      );
    if (!reserved.rows.length) {
      await sql`UPDATE x_search_queries SET reason='daily_budget_reached' WHERE id=${query?.id ?? ""}`.execute(
        this.tx,
      );
      return { status: "done" };
    }
    const key = `x:${randomUUID()}`;
    const token = randomUUID();
    await sql`INSERT INTO web_discovery_operations(key,provider,kind,input,state,lease_token,lease_until) VALUES(${key},'x-api',${operation.kind === "search" ? "search" : "document"},${JSON.stringify(operation)}::jsonb,'running',${token}::uuid,now()+interval '45 seconds')`.execute(
      this.tx,
    );
    await sql`INSERT INTO x_search_attempts(key,query_id) VALUES(${key},${operation.kind === "search" ? query!.id : null})`.execute(
      this.tx,
    );
    await performance.admit(
      key,
      operation.kind === "search"
        ? queryRoute("x-api", operation.query)
        : sourceRoute("x-api", "https://x.com"),
      cost,
      operation.kind === "search"
        ? exploring
          ? "oldest_due"
          : "measured_yield"
        : operation.purpose === "context"
          ? "context"
          : "refresh",
    );
    if (operation.kind === "search") {
      await sql`UPDATE x_search_queries SET pending_key=${key},window_start=${operation.startTime}::timestamptz,window_end=${operation.endTime}::timestamptz,next_token=${operation.nextToken},gaps=gaps+${query!.gap ? 1 : 0},reason=${query!.gap ? "recent_window_gap" : null} WHERE id=${query!.id}`.execute(
        this.tx,
      );
    }
    if (operation.kind === "lookup") {
      await sql`UPDATE x_posts SET next_check_at=now()+interval '5 minutes' WHERE post_id=ANY(${operation.ids}::text[])`.execute(
        this.tx,
      );
      await sql`UPDATE x_context_requests SET next_check_at=now()+interval '5 minutes',attempts=attempts+1 WHERE post_id=ANY(${operation.ids}::text[])`.execute(
        this.tx,
      );
    }
    return { status: "claimed", key, token, operation };
  }

  /** Expired leases keep their reservations and cursor; a later admitted attempt retries after backoff. */
  private async recover(): Promise<void> {
    const expired = await sql<{
      key: string;
    }>`UPDATE web_discovery_operations SET state='failed',failure='attempt_outcome_unknown',finished_at=now() WHERE provider='x-api' AND state='running' AND lease_until<=now() RETURNING key`.execute(
      this.tx,
    );
    await sql`UPDATE x_search_queries SET pending_key=NULL,next_check_at=now()+interval '5 minutes',reason='attempt_outcome_unknown' WHERE pending_key=ANY(${expired.rows.map((row) => row.key)}::text[])`.execute(
      this.tx,
    );
  }
}
