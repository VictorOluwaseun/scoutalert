import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { createPostgresClient } from "../../packages/adapters/dist/database/public.js";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";
import { nativeAdmissionDelay } from "../../packages/core/dist/discovery/public.js";

const require = createRequire(
  new URL("../../packages/adapters/package.json", import.meta.url),
);
const { sql } = await import(require.resolve("kysely"));
loadEnvFile(new URL("../../apps/api/.env", import.meta.url));
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const config = readWorkerConfiguration();
const db = createPostgresClient(
  config.DATABASE_URL,
  "scout-native-pacing-report",
);

try {
  const snapshot = await db.transaction().execute(async (tx) => {
    await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(
      tx,
    );
    const clock = (
      await sql`SELECT now() AS now,(now() AT TIME ZONE 'UTC')::date::text AS day`.execute(
        tx,
      )
    ).rows[0];
    const attempts =
      await sql`SELECT o.key,o.created_at,o.state,o.failure,o.input->>'kind' AS kind,o.input->>'purpose' AS purpose,o.input->>'startTime' AS start_time,o.input->>'endTime' AS end_time,
      CASE WHEN o.input->>'kind'='search' THEN (o.input->>'limit')::int ELSE jsonb_array_length(o.input->'ids') END AS reserved_posts,
      a.query_id,a.returned_posts,a.new_posts,a.partial,a.latency_ms,r.reserved_micros::float8 AS reservation
      FROM web_discovery_operations o JOIN x_search_attempts a ON a.key=o.key LEFT JOIN discovery_route_attempts r ON r.operation_key=o.key
      WHERE o.provider='x-api' AND o.created_at>now()-interval '7 days' ORDER BY o.created_at DESC LIMIT 10001`.execute(
        tx,
      );
    const ledger =
      await sql`SELECT day::text,requests,reserved_micros::float8 AS reserved_micros FROM web_discovery_usage WHERE provider='x-api' AND day>=(now() AT TIME ZONE 'UTC')::date-1 ORDER BY day`.execute(
        tx,
      );
    const queries =
      await sql`SELECT id,reason,covered_until,window_start,window_end,next_token IS NOT NULL AS has_cursor,pending_key IS NOT NULL AS pending,gaps FROM x_search_queries`.execute(
        tx,
      );
    const reviews =
      await sql`SELECT coalesce(r.state,'not_started') AS state,r.failure,count(*)::int AS count FROM x_posts p JOIN web_discovery_leads l ON l.id=p.lead_id
        LEFT JOIN LATERAL(SELECT v.state,v.failure FROM web_lead_reviews v WHERE v.lead_id=p.lead_id AND v.input->>'documentFingerprint'=l.document->>'fingerprint' ORDER BY (v.key=l.review_key) DESC NULLS LAST,v.created_at DESC LIMIT 1) r ON true
        WHERE NOT p.unavailable AND p.expires_at>now() GROUP BY r.state,r.failure ORDER BY r.state,r.failure`.execute(
        tx,
      );
    const safety =
      await sql`SELECT count(*) FILTER(WHERE coalesce((r.input->>'truncated')::boolean,false) AND r.posting_id IS NOT NULL)::int AS incomplete_sources_promoted,
      count(*) FILTER(WHERE r.result->>'label' IN ('service_offer','discussion','directory','closed') AND r.posting_id IS NOT NULL)::int AS non_demand_promoted
      FROM x_posts p JOIN web_discovery_leads l ON l.id=p.lead_id JOIN web_lead_reviews r ON r.key=l.review_key AND r.state='ready'
      WHERE NOT p.unavailable AND p.expires_at>now()`.execute(tx);
    return {
      ...clock,
      attempts: attempts.rows,
      ledger: ledger.rows,
      queries: queries.rows,
      reviews: reviews.rows,
      safety: safety.rows[0],
    };
  });
  const truncated = snapshot.attempts.length > 10000;
  const ordered = snapshot.attempts.slice(0, 10000).reverse();
  const today = ordered.filter(
    (row) => row.created_at.toISOString().slice(0, 10) === snapshot.day,
  );
  const ledger = snapshot.ledger.find((row) => row.day === snapshot.day);
  const dailyMicros = Math.floor(config.SCOUT_X_DAILY_USD * 1_000_000);
  const postMicros = Math.floor(config.SCOUT_X_POST_USD * 1_000_000);
  const reservation = today.reduce(
    (sum, row) => sum + (row.reservation ?? 0),
    0,
  );
  let requests = 0;
  let spent = 0;
  let previous = null;
  const spacing = [];
  for (const row of today) {
    const cost = row.reserved_posts * postMicros;
    const remainingDelay = nativeAdmissionDelay({
      now: row.created_at,
      lastAttemptAt: previous,
      requests,
      reservedMicros: spent,
      dailyRequests: config.SCOUT_X_DAILY_REQUESTS,
      dailyMicros: dailyMicros,
      nextCostMicros: cost,
    });
    if (requests >= 3) {
      spacing.push({
        admittedAt: row.created_at,
        gapSeconds: (row.created_at - previous) / 1000,
        remainingPolicyDelayMs: remainingDelay,
        passes: remainingDelay <= 1000,
      });
    }
    requests++;
    spent += row.reservation ?? 0;
    previous = row.created_at;
  }
  const lastWindows = new Map();
  let comparedWindows = 0;
  let unexplainedGaps = 0;
  for (const row of ordered.filter((item) => item.kind === "search")) {
    const prior = lastWindows.get(row.query_id);
    const withinHorizon =
      prior &&
      Date.parse(prior.end_time) >=
        row.created_at.getTime() - (6 * 24 + 23) * 3_600_000;
    if (
      withinHorizon &&
      row.created_at.toISOString().slice(0, 10) === snapshot.day
    ) {
      comparedWindows++;
      unexplainedGaps += Number(
        Date.parse(row.start_time) > Date.parse(prior.end_time),
      );
    }
    lastWindows.set(row.query_id, row);
  }
  const currentDelay = nativeAdmissionDelay({
    now: snapshot.now,
    lastAttemptAt: previous,
    requests: ledger?.requests ?? 0,
    reservedMicros: ledger?.reserved_micros ?? 0,
    dailyRequests: config.SCOUT_X_DAILY_REQUESTS,
    dailyMicros,
    nextCostMicros: config.SCOUT_X_PAGE_SIZE * postMicros,
  });
  const report = {
    recordedAt: snapshot.now.toISOString(),
    dayUtc: snapshot.day,
    protocol: "native-pacing-audit-v1",
    limits: {
      requests: config.SCOUT_X_DAILY_REQUESTS,
      reservationUsd: config.SCOUT_X_DAILY_USD,
      postReservationUsd: config.SCOUT_X_POST_USD,
    },
    ledgerDays: snapshot.ledger,
    ledgerChecks: {
      completeHistory: !truncated,
      requestsReconcile: !truncated && requests === (ledger?.requests ?? 0),
      reservationsReconcile:
        !truncated && reservation === (ledger?.reserved_micros ?? 0),
      perAttemptReservationsMatchConfiguredPrice: today.every(
        (row) => row.reservation === row.reserved_posts * postMicros,
      ),
      withinRequestCap:
        (ledger?.requests ?? 0) <= config.SCOUT_X_DAILY_REQUESTS,
      withinReservationCap: (ledger?.reserved_micros ?? 0) <= dailyMicros,
    },
    today: today.map((row) => ({
      admittedAt: row.created_at,
      kind: row.kind,
      purpose: row.purpose,
      state: row.state,
      failure: row.failure,
      reservationMicros: row.reservation,
      returnedPosts: row.returned_posts,
      firstNativeCaptures: row.new_posts,
      partial: row.partial,
      latencyMs: row.latency_ms,
    })),
    pacing: {
      checkedAdmissionsAfterStartup: spacing.length,
      comparisons: spacing,
      currentlyDelayedQueries: snapshot.queries.filter(
        (row) => row.reason === "budget_pacing",
      ).length,
      estimatedDelayForFullPageMs: currentDelay,
    },
    cursors: {
      comparedWindows,
      unexplainedGaps,
      recordedHorizonGaps: snapshot.queries.reduce(
        (sum, row) => sum + row.gaps,
        0,
      ),
      unfinishedWindows: snapshot.queries.filter((row) => row.has_cursor)
        .length,
      pendingReceipts: snapshot.queries.filter((row) => row.pending).length,
    },
    currentNativeReviewStates: snapshot.reviews,
    currentPublicationGuards: snapshot.safety,
    independentQuality: null,
    assumptions: [
      "Retrospective pacing and per-post reservation comparisons assume the configured limits and price were unchanged during this UTC day. Oldest three daily admissions are the permitted startup burst.",
      "A one-second timing tolerance accounts for PostgreSQL transaction timestamps preceding application admission checks. No ledger, due time, cursor or configured limit is changed by this report.",
      "Pacing comparisons require an actual post-startup admission; zero comparisons means that step remains unverified. Current pacing reasons alone do not prove a later read resumed.",
      "Cursor comparisons check overlapping fixed search windows, not completeness of provider results. Preserved unfinished pages are not completed windows.",
      "Only timestamps, counts and safe status categories are exported; no post bodies, query text, cursor tokens, credentials or private account identifiers.",
    ],
  };
  if (process.argv.includes("--write")) {
    await writeFile(
      new URL(
        `../../evaluations/discovery/native-pacing-${snapshot.day}.json`,
        import.meta.url,
      ),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx" },
    );
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.destroy();
}
