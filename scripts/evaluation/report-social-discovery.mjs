import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { createPostgresClient } from "../../packages/adapters/dist/database/public.js";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";

const require = createRequire(
  new URL("../../packages/adapters/package.json", import.meta.url),
);
const { sql } = await import(require.resolve("kysely"));
loadEnvFile(new URL("../../apps/api/.env", import.meta.url));
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const config = readWorkerConfiguration();
const db = createPostgresClient(config.DATABASE_URL, "scout-social-report");
try {
  const [
    queries,
    attempts,
    posts,
    ledger,
    access,
    reviews,
    reviewCases,
    aiBudget,
    operationKinds,
    context,
    contextRequests,
  ] = await Promise.all([
    sql`SELECT count(*)::int AS queries,count(*) FILTER(WHERE next_token IS NOT NULL)::int AS unfinished_windows,sum(gaps)::int AS recorded_window_gaps FROM x_search_queries`.execute(
      db,
    ),
    sql`SELECT o.state,count(*)::int AS attempts,sum(a.returned_posts)::int AS returned_posts,sum(a.new_posts)::int AS first_native_captures,sum(a.overlap_posts)::int AS previously_seen_through_google,percentile_cont(0.5) WITHIN GROUP(ORDER BY a.latency_ms) AS p50_ms,percentile_cont(0.95) WITHIN GROUP(ORDER BY a.latency_ms) AS p95_ms FROM x_search_attempts a JOIN web_discovery_operations o ON o.key=a.key GROUP BY o.state ORDER BY o.state`.execute(
      db,
    ),
    sql`SELECT count(*)::int AS retained_identities,count(*) FILTER(WHERE NOT unavailable)::int AS available_captures,(SELECT count(*)::int FROM x_source_updates WHERE case_id IS NULL) AS pending_updates,(SELECT count(*)::int FROM web_discovery_cases WHERE provider='x-api') AS dispatched_cases FROM x_posts`.execute(
      db,
    ),
    sql`SELECT requests,reserved_micros::text FROM web_discovery_usage WHERE provider='x-api' AND day=(now() AT TIME ZONE 'UTC')::date`.execute(
      db,
    ),
    sql`SELECT reason,next_allowed_at::text FROM x_access_state WHERE id=1`.execute(
      db,
    ),
    sql`SELECT r.result->>'label' AS label,count(*)::int AS count FROM x_posts p JOIN web_discovery_leads l ON l.id=p.lead_id JOIN web_lead_reviews r ON r.key=l.review_key AND r.state='ready' GROUP BY r.result->>'label' ORDER BY label`.execute(
      db,
    ),
    sql`SELECT coalesce(r.status,'not_started') AS status,r.reason,count(*)::int AS count FROM web_discovery_cases c LEFT JOIN web_lead_review_cases r ON r.case_id=c.id WHERE c.provider='x-api' GROUP BY r.status,r.reason ORDER BY status,r.reason`.execute(
      db,
    ),
    sql`SELECT requests,reserved_microusd::text FROM intelligence_daily_budget WHERE day=(now() AT TIME ZONE 'UTC')::date`.execute(
      db,
    ),
    sql`SELECT input->>'kind' AS kind,input->>'purpose' AS purpose,state,count(*)::int AS attempts FROM web_discovery_operations WHERE provider='x-api' GROUP BY input->>'kind',input->>'purpose',state ORDER BY kind,purpose,state`.execute(
      db,
    ),
    sql`SELECT count(*)::int AS packets,count(*) FILTER(WHERE (document->'nativeContext'->>'complete')::boolean)::int AS complete_packets,count(*) FILTER(WHERE NOT (document->'nativeContext'->>'complete')::boolean)::int AS incomplete_packets,coalesce(sum(jsonb_array_length(document->'nativeContext'->'posts')),0)::int AS related_post_references FROM web_discovery_leads WHERE document ? 'nativeContext'`.execute(
      db,
    ),
    sql`SELECT state,count(*)::int AS identities,sum(attempts)::int AS lookup_admissions FROM x_context_requests GROUP BY state ORDER BY state`.execute(
      db,
    ),
  ]);
  const report = {
    recordedAt: new Date().toISOString(),
    protocol: "native-x-context-v1",
    enabled: config.SCOUT_X_ENABLED === "true",
    credentialConfigured: Boolean(config.X_BEARER_TOKEN),
    limits: {
      dailyRequests: config.SCOUT_X_DAILY_REQUESTS,
      dailyReservationUsd: config.SCOUT_X_DAILY_USD,
      postReservationUsd: config.SCOUT_X_POST_USD,
      pageSize: config.SCOUT_X_PAGE_SIZE,
    },
    queries: queries.rows[0],
    attempts: attempts.rows,
    operationKinds: operationKinds.rows,
    context: context.rows[0],
    contextRequests: contextRequests.rows,
    posts: posts.rows[0],
    dailyLedger: ledger.rows[0] ?? null,
    providerAccess: access.rows[0],
    modelClassifications: reviews.rows,
    reviewCases: reviewCases.rows,
    sharedAiBudget: {
      dailyRequests: config.SCOUT_AI_DAILY_REQUESTS,
      dailyReservationUsd: config.SCOUT_AI_DAILY_USD,
      ledger: aiBudget.rows[0] ?? null,
    },
    independentRelevance: null,
    knownOpportunityRecall: null,
    notes: [
      "Aggregate operational measurements; no private briefs, account IDs or credentials exported.",
      "Overlap covers matching canonical post identities previously observed through Serper; it is not a paired recall benchmark.",
      "Model classifications are not independent relevance judgments. Reservations are conservative ceilings, not billed provider cost.",
      "Parent/quote/conversation-root checks are bounded to six related posts and two reference levels; a complete packet does not mean a complete thread. Missing or truncated context remains incomplete.",
      "Native streaming and full-archive search are not enabled. Context counts establish captured references, not classification quality.",
    ],
  };
  if (process.argv.includes("--write")) {
    await writeFile(
      new URL(
        "../../evaluations/discovery/native-social-local.json",
        import.meta.url,
      ),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.destroy();
}
