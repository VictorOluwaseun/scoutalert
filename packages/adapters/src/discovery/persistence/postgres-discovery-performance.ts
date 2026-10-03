import { sql, type Kysely } from "kysely";
import {
  emptyDiscoveryPerformance,
  type DiscoveryPerformance,
  type WebSearchQuery,
} from "@repo/core/discovery";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { canonicalDiscoveryUrl, discoveryKey } from "./discovery-identities.js";

/** Public provider semantics define a reusable measurement route; no account or personal-fit data participates. */
export interface DiscoveryRoute {
  id: string;
  provider: string;
  kind: "query" | "source";
  target: Record<string, unknown>;
}

/** Groups pages of the same public query while preserving language, country and freshness semantics. */
export function queryRoute(
  provider: string,
  query: string | WebSearchQuery,
): DiscoveryRoute {
  const target =
    typeof query === "string"
      ? { query }
      : {
          query: query.query,
          language: query.language,
          country: query.country,
          freshness: query.freshness,
        };
  return {
    id: discoveryKey(["route-v1", provider, "query", target]),
    provider,
    kind: "query",
    target,
  };
}

/** Shares public source-health measurements by provider and hostname, without persisting source bodies. */
export function sourceRoute(provider: string, url: string): DiscoveryRoute {
  const target = { hostname: new URL(url).hostname };
  return {
    id: discoveryKey(["route-v1", provider, "source", target]),
    provider,
    kind: "source",
    target,
  };
}

/** Records exactly one measurement per admitted operation and reads bounded indexed samples for scheduling policy. */
export class PostgresDiscoveryPerformanceRepository {
  /** Shares the admission/receipt transaction so retries cannot duplicate measurements or spend records. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {}

  /** Registers the actual paid/check admission; cache reuse by another scout never increments route attempts. */
  async admit(
    key: string,
    route: DiscoveryRoute,
    cost: number,
    selection = "initial",
  ): Promise<void> {
    await sql`INSERT INTO discovery_routes(id,provider,kind,target) VALUES(${route.id},${route.provider},${route.kind},${JSON.stringify(route.target)}::jsonb) ON CONFLICT DO NOTHING`.execute(
      this.db,
    );
    await sql`INSERT INTO discovery_route_attempts(operation_key,route_id,reserved_micros,selection) VALUES(${key},${route.id},${cost},${selection}) ON CONFLICT DO NOTHING`.execute(
      this.db,
    );
  }

  /** Counts canonical identities new to this route once; late classifications are read from current source reviews instead of copied indefinitely. */
  async settle(
    key: string,
    urls: string[],
    successful: boolean,
  ): Promise<void> {
    const attempt = await sql<{
      route_id: string;
    }>`SELECT route_id FROM discovery_route_attempts WHERE operation_key=${key} AND NOT settled FOR UPDATE`.execute(
      this.db,
    );
    const route = attempt.rows[0]?.route_id;
    if (!route) {
      return;
    }
    await sql`SELECT id FROM discovery_routes WHERE id=${route} FOR UPDATE`.execute(
      this.db,
    );
    const ids = [
      ...new Set(
        urls.flatMap((url) => {
          const canonical = canonicalDiscoveryUrl(url);
          return canonical ? [discoveryKey(canonical)] : [];
        }),
      ),
    ].sort();
    const added =
      await sql`INSERT INTO discovery_route_leads(route_id,lead_id) SELECT ${route},id FROM unnest(${ids}::text[]) AS id ON CONFLICT DO NOTHING RETURNING lead_id`.execute(
        this.db,
      );
    await sql`UPDATE discovery_route_leads SET last_seen_at=now() WHERE route_id=${route} AND lead_id=ANY(${ids}::text[])`.execute(
      this.db,
    );
    await sql`UPDATE discovery_route_attempts SET settled=true,successful=${successful},observations=${ids.length},novel=${added.rows.length} WHERE operation_key=${key}`.execute(
      this.db,
    );
  }

  /** Reads at most twenty attempts and two hundred identities per route over seven days; pending/unavailable evidence is never labeled noise. */
  async samples(
    routes: DiscoveryRoute[],
  ): Promise<Map<string, DiscoveryPerformance>> {
    const ids = [...new Set(routes.map((route) => route.id))];
    const rows = await sql<DiscoveryPerformance & { id: string }>`SELECT r.id,
      coalesce(a.attempts,0)::int AS attempts,coalesce(a.successful,0)::int AS successful,
      coalesce(a.observations,0)::int AS observations,coalesce(a.novel,0)::int AS novel,
      coalesce(l.reviewed,0)::int AS reviewed,coalesce(l.demand,0)::int AS demand,coalesce(l.noise,0)::int AS noise
      FROM unnest(${ids}::text[]) AS r(id)
      LEFT JOIN LATERAL (SELECT count(*) AS attempts,count(*) FILTER(WHERE successful) AS successful,sum(observations) AS observations,sum(novel) AS novel
        FROM (SELECT a.* FROM discovery_route_attempts a JOIN web_discovery_operations o ON o.key=a.operation_key WHERE a.route_id=r.id AND a.created_at>now()-interval '7 days' AND o.state IN ('succeeded','failed') ORDER BY a.created_at DESC,a.operation_key LIMIT 20) recent) a ON true
      LEFT JOIN LATERAL (SELECT count(*) AS reviewed,count(*) FILTER(WHERE v.result->>'label' IN ('job_opening','client_request')) AS demand,count(*) FILTER(WHERE v.result->>'label' IN ('service_offer','discussion','closed')) AS noise
        FROM (SELECT lead_id FROM discovery_route_leads WHERE route_id=r.id AND last_seen_at>now()-interval '7 days' ORDER BY last_seen_at DESC,lead_id LIMIT 200) recent
        JOIN web_discovery_leads d ON d.id=recent.lead_id AND d.content_status='fetched'
        JOIN web_lead_reviews v ON v.key=d.review_key AND v.state='ready' AND v.input->>'scope'='source' AND v.input->>'documentFingerprint'=d.document->>'fingerprint' AND coalesce((v.input->>'truncated')::boolean,false)=false) l ON true`.execute(
      this.db,
    );
    return new Map(
      ids.map((id) => [
        id,
        rows.rows.find((row) => row.id === id) ?? emptyDiscoveryPerformance(),
      ]),
    );
  }
}
