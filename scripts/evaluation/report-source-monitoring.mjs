import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { createPostgresClient } from "../../packages/adapters/dist/database/public.js";
import { PostgresSourceMonitoringRepository } from "../../packages/adapters/dist/discovery/public.js";
import { LearnSourceMonitoring } from "../../packages/core/dist/discovery/public.js";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";

const require = createRequire(
  new URL("../../packages/adapters/package.json", import.meta.url),
);
const { sql } = await import(require.resolve("kysely"));
loadEnvFile(new URL("../../apps/api/.env", import.meta.url));
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const config = readWorkerConfiguration();
const db = createPostgresClient(config.DATABASE_URL, "scout-monitor-report");

/** Optionally enrolls already-reviewed current cases after deployment, without new source fetches or model calls. */
async function learnExisting() {
  if (
    !process.argv.includes("--learn-existing") ||
    config.SCOUT_MONITOR_ENABLED !== "true" ||
    config.SCOUT_WEB_ENABLED !== "true"
  ) {
    return 0;
  }
  const requests =
    await sql`SELECT DISTINCT ON(c.scout_id) c.id AS "runId",c.scout_id AS "scoutId",c.owner_id AS "ownerId",c.scout_version AS version
    FROM web_discovery_cases c JOIN scouts s ON s.id=c.scout_id AND s.owner_id=c.owner_id AND s.version=c.scout_version AND s.status='active'
    WHERE c.status IN ('completed','partial','deferred') AND c.started_at>now()-interval '6 hours'
    ORDER BY c.scout_id,c.started_at DESC LIMIT 100`.execute(db);
  const learning = new LearnSourceMonitoring(
    new PostgresSourceMonitoringRepository(
      db,
      config.SCOUT_MONITOR_MAX_SOURCES,
    ),
  );
  for (const request of requests.rows) {
    await learning.execute(request);
  }
  return requests.rows.length;
}

try {
  const enrolledCases = await learnExisting();
  const [monitors, checks, interests, evidence, ledger] = await Promise.all([
    sql`SELECT kind,status,count(*)::int AS count FROM web_source_monitors GROUP BY kind,status ORDER BY kind,status`.execute(
      db,
    ),
    sql`SELECT count(*)::int AS checks,count(*) FILTER(WHERE changed)::int AS changed,sum(new_links)::int AS links FROM web_source_checks`.execute(
      db,
    ),
    sql`SELECT count(*)::int AS subscriptions,count(DISTINCT i.monitor_id)::int AS sharedPages,count(DISTINCT i.scout_id)::int AS activeScouts FROM web_source_interests i JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active'`.execute(
      db,
    ),
    sql`SELECT (SELECT count(*)::int FROM web_source_monitors m JOIN web_discovery_leads l ON l.id=m.id WHERE l.posting_id IS NOT NULL) AS indexed_pages,
      (SELECT count(*)::int FROM web_source_updates WHERE case_id IS NOT NULL) AS dispatched_observations,
      (SELECT count(*)::int FROM web_source_updates u JOIN scouts s ON s.id=u.scout_id AND s.owner_id=u.owner_id AND s.version=u.scout_version AND s.status='active' WHERE u.case_id IS NULL) AS pending_observations`.execute(
      db,
    ),
    sql`SELECT provider,requests,reserved_micros::text FROM web_discovery_usage WHERE day=(now() AT TIME ZONE 'UTC')::date ORDER BY provider`.execute(
      db,
    ),
  ]);
  const report = {
    recordedAt: new Date().toISOString(),
    enrolledCases,
    monitors: monitors.rows,
    checks: checks.rows[0],
    interests: interests.rows[0],
    evidence: evidence.rows[0],
    sharedDailyLedger: ledger.rows,
    limits: {
      dailyDocuments: config.SCOUT_WEB_DAILY_DOCUMENTS,
      dailySearches: config.SCOUT_WEB_DAILY_REQUESTS,
      searchReservationUsd: config.SCOUT_WEB_DAILY_USD,
      dailyAiRequests: config.SCOUT_AI_DAILY_REQUESTS,
      aiReservationUsd: config.SCOUT_AI_DAILY_USD,
      sourcesPerScout: config.SCOUT_MONITOR_MAX_SOURCES,
    },
    independentRelevance: null,
    knownOpportunityRecall: null,
    notes: [
      "Aggregate local runtime snapshot; no account identifiers or private briefs exported.",
      "Indexed pages can predate monitoring. These counts do not establish causal yield or independently judged relevance.",
      "Daily ledgers include ordinary discovery and monitoring. Reservations are limits, not provider invoices.",
    ],
  };
  if (process.argv.includes("--write")) {
    await writeFile(
      new URL(
        "../../evaluations/discovery/continuous-monitoring-local.json",
        import.meta.url,
      ),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.destroy();
}
