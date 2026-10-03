import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { createPostgresClient } from "../../packages/adapters/dist/database/public.js";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";
import {
  queryRevisitMinutes,
  emptyDiscoveryPerformance,
} from "../../packages/core/dist/discovery/public.js";

const require = createRequire(
  new URL("../../packages/adapters/package.json", import.meta.url),
);
const { sql } = await import(require.resolve("kysely"));
loadEnvFile(new URL("../../apps/api/.env", import.meta.url));
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const config = readWorkerConfiguration();
const db = createPostgresClient(
  config.DATABASE_URL,
  "scout-discovery-performance-report",
);
try {
  const [routes, outcomes, labels, choices, ledger, queries, posts] =
    await Promise.all([
      sql`SELECT provider,kind,count(*)::int AS routes,min(created_at) AS tracking_started_at FROM discovery_routes GROUP BY provider,kind ORDER BY provider,kind`.execute(
        db,
      ),
      sql`SELECT r.provider,r.kind,o.state,count(*)::int AS attempts,count(*) FILTER(WHERE a.successful)::int AS successful,coalesce(sum(a.observations),0)::int AS observations,coalesce(sum(a.novel),0)::int AS new_to_route,coalesce(sum(a.reserved_micros),0)::text AS reserved_micros FROM discovery_route_attempts a JOIN discovery_routes r ON r.id=a.route_id JOIN web_discovery_operations o ON o.key=a.operation_key WHERE a.created_at>now()-interval '7 days' GROUP BY r.provider,r.kind,o.state ORDER BY r.provider,r.kind,o.state`.execute(
        db,
      ),
      sql`SELECT routes.provider,routes.kind,v.result->>'label' AS label,count(DISTINCT l.id)::int AS unique_sources FROM discovery_routes routes JOIN discovery_route_leads a ON a.route_id=routes.id JOIN web_discovery_leads l ON l.id=a.lead_id AND l.content_status='fetched' JOIN web_lead_reviews v ON v.key=l.review_key AND v.state='ready' AND v.input->>'scope'='source' AND v.input->>'documentFingerprint'=l.document->>'fingerprint' AND coalesce((v.input->>'truncated')::boolean,false)=false WHERE a.last_seen_at>now()-interval '7 days' GROUP BY routes.provider,routes.kind,v.result->>'label' ORDER BY routes.provider,routes.kind,label`.execute(
        db,
      ),
      sql`SELECT r.provider,r.kind,a.selection,count(*)::int AS admissions FROM discovery_route_attempts a JOIN discovery_routes r ON r.id=a.route_id WHERE a.created_at>now()-interval '7 days' GROUP BY r.provider,r.kind,a.selection ORDER BY r.provider,r.kind,a.selection`.execute(
        db,
      ),
      sql`SELECT provider,requests,reserved_micros::text FROM web_discovery_usage WHERE day=(now() AT TIME ZONE 'UTC')::date ORDER BY provider`.execute(
        db,
      ),
      sql`SELECT reason,count(*)::int AS queries,min(next_check_at) AS next_check_at FROM x_search_queries GROUP BY reason ORDER BY reason`.execute(
        db,
      ),
      sql`SELECT count(*)::int AS posts,count(*) FILTER(WHERE unchanged>0)::int AS observed_unchanged,count(*) FILTER(WHERE next_check_at>now()+interval '1 hour')::int AS revisit_later_than_one_hour FROM x_posts WHERE NOT unavailable`.execute(
        db,
      ),
    ]);
  let elapsed = 0;
  let checks = 0;
  while (elapsed < 1440) {
    checks++;
    elapsed += queryRevisitMinutes({
      ...emptyDiscoveryPerformance(),
      attempts: Math.min(checks, 20),
      successful: Math.min(checks, 20),
    });
  }
  const report = {
    recordedAt: new Date().toISOString(),
    policy: "discovery-yield-v1",
    historicalBackfill: false,
    sampling: {
      maximumAttempts: 20,
      maximumIdentities: 200,
      windowDays: 7,
      minimumAttemptsForRanking: 3,
      minimumReviewsForQuality: 5,
    },
    routes: routes.rows,
    outcomes: outcomes.rows,
    modelClassifications: labels.rows,
    selections: choices.rows,
    dailyReservations: ledger.rows,
    nativeLimits: {
      dailyRequests: config.SCOUT_X_DAILY_REQUESTS,
      dailyReservationUsd: config.SCOUT_X_DAILY_USD,
      pacedAcrossDay: true,
    },
    nativeQueries: queries.rows,
    nativeRefreshes: posts.rows[0],
    syntheticEmptyQueryWorkload: {
      description:
        "One always-empty query over 24 hours, with no budget or provider contention; synthetic policy simulation only.",
      priorFiveMinutePolls: 288,
      adaptivePolls: checks,
      maximumRevisitMinutes: 120,
    },
    independentRelevance: null,
    knownOpportunityRecall: null,
    notes: [
      "Counts start with this deployment's admitted operations. Cached work and pre-deployment operations are not counted as new measurements.",
      "Novel means canonical identity new to that route, not globally unique, relevant or eligible. Identity totals across routes/providers must not be summed as unique opportunities.",
      "Current model classifications guide scheduling; they are not independent relevance labels or proof of personal fit. Unreviewed, stale, unavailable and truncated evidence is excluded from these labels.",
      "Attempt totals cover seven days; scheduler samples are capped per route. Request reservations are ceilings, not billed cost, and exclude AI/compute charges. Zero monetary reservation for document checks does not mean zero operating cost.",
      "Every fifth native selection prefers the oldest due query when one exists; monitoring similarly preserves oldest-due selections. This is a bounded fairness mechanism, not a global-scale service-level guarantee.",
    ],
  };
  if (process.argv.includes("--write")) {
    await writeFile(
      new URL(
        "../../evaluations/discovery/performance-local.json",
        import.meta.url,
      ),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.destroy();
}
