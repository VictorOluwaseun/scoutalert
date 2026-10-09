import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { createPostgresClient } from "../../packages/adapters/dist/database/public.js";

const require = createRequire(
  new URL("../../packages/adapters/package.json", import.meta.url),
);
const { sql } = await import(require.resolve("kysely"));
loadEnvFile(new URL("../../apps/api/.env", import.meta.url));
const db = createPostgresClient(
  process.env.DATABASE_URL,
  "scout-review-recovery-report",
);

try {
  const snapshot = await db.transaction().execute(async (tx) => {
    await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(
      tx,
    );
    const clock = (await sql`SELECT now() AS recorded_at`.execute(tx)).rows[0];
    const native =
      await sql`SELECT coalesce(review.state,'not_started') AS state,review.failure,count(*)::int AS posts
      FROM x_posts p JOIN web_discovery_leads l ON l.id=p.lead_id
      LEFT JOIN LATERAL (
        SELECT r.state,r.failure FROM web_lead_reviews r WHERE r.lead_id=p.lead_id AND r.input->>'documentFingerprint'=l.document->>'fingerprint'
        ORDER BY r.created_at DESC,r.key LIMIT 1
      ) review ON true
      WHERE NOT p.unavailable AND p.expires_at>now()
      GROUP BY review.state,review.failure ORDER BY state,review.failure`.execute(
        tx,
      );
    const subscriptions = await sql`WITH current AS (
      SELECT u.lead_id,u.observed_at,u.case_id,review.state,review.failure,review.attempts,review.retry_at,
        c.status AS review_status,c.reason AS review_reason,c.deadline<now() AS review_window_ended,
        EXISTS(SELECT 1 FROM web_discovery_cases newer WHERE newer.scout_id=s.id AND newer.owner_id=s.owner_id AND newer.started_at>original.started_at) AS superseded,
        c.case_id IS NULL AS review_not_started
      FROM x_source_updates u
      JOIN scouts s ON s.id=u.scout_id AND s.owner_id=u.owner_id AND s.version=u.scout_version AND s.status='active'
      JOIN x_posts p ON p.lead_id=u.lead_id AND NOT p.unavailable AND p.expires_at>now()
      JOIN web_discovery_leads l ON l.id=u.lead_id
      LEFT JOIN web_discovery_cases original ON original.id=u.case_id
      LEFT JOIN web_lead_review_cases c ON c.case_id=u.case_id
      LEFT JOIN LATERAL (
        SELECT r.state,r.failure,r.attempts,r.retry_at FROM web_lead_reviews r
        WHERE r.lead_id=u.lead_id AND r.input->>'documentFingerprint'=l.document->>'fingerprint'
        ORDER BY r.created_at DESC,r.key LIMIT 1
      ) review ON true
    ) SELECT CASE
      WHEN state='ready' THEN 'public_review_ready'
      WHEN case_id IS NULL THEN 'awaiting_dispatch'
      WHEN superseded AND review_not_started THEN 'replaced_before_review'
      WHEN state='failed' AND (retry_at IS NULL OR attempts>=2) THEN 'terminal_for_this_input'
      WHEN state='failed' AND retry_at<=now() THEN 'retry_due'
      WHEN state='failed' THEN 'retry_wait'
      WHEN review_window_ended THEN 'review_window_ended'
      WHEN state='running' THEN 'review_running'
      ELSE 'queued_for_review' END AS status,
      count(*)::int AS subscriptions,count(DISTINCT lead_id)::int AS unique_posts,min(observed_at) AS oldest_source_observation
      FROM current GROUP BY status ORDER BY status`.execute(tx);
    const families = await sql`SELECT
      CASE WHEN p.lead_id IS NOT NULL AND (p.unavailable OR p.expires_at<=now()) THEN 'expired_or_unavailable_native_x'
      WHEN p.lead_id IS NOT NULL THEN 'native_x'
      WHEN l.url ~ '^https://([^/]+[.])?linkedin[.]com/' THEN 'indexed_linkedin'
      WHEN l.url ~ '^https://([^/]+[.])?(x|twitter)[.]com/' THEN 'indexed_x'
      ELSE 'other_public_web' END AS family,
      l.content_status,count(*)::int AS leads,
      count(*) FILTER(WHERE r.state='ready' AND r.input->>'scope'='source' AND r.input->>'documentFingerprint'=l.document->>'fingerprint')::int AS source_reviews,
      count(*) FILTER(WHERE r.state='ready' AND r.input->>'scope'='search_excerpt')::int AS excerpt_reviews,
      count(*) FILTER(WHERE l.posting_id IS NOT NULL AND o.open)::int AS open_candidates
      FROM web_discovery_leads l LEFT JOIN x_posts p ON p.lead_id=l.id
      LEFT JOIN web_lead_reviews r ON r.key=l.review_key LEFT JOIN opportunity_postings o ON o.id=l.posting_id
      WHERE l.last_seen_at>now()-interval '7 days' GROUP BY family,l.content_status ORDER BY family,l.content_status`.execute(
      tx,
    );
    const guards = (
      await sql`SELECT count(*) FILTER(WHERE coalesce((r.input->>'truncated')::boolean,false) AND r.posting_id IS NOT NULL)::int AS incomplete_promoted,
      count(*) FILTER(WHERE r.result->>'label' IN ('service_offer','discussion','directory','closed') AND r.posting_id IS NOT NULL)::int AS non_demand_promoted
      FROM x_posts p JOIN web_discovery_leads l ON l.id=p.lead_id JOIN web_lead_reviews r ON r.key=l.review_key AND r.state='ready'
      WHERE NOT p.unavailable AND p.expires_at>now()`.execute(tx)
    ).rows[0];
    return {
      recordedAt: clock.recorded_at,
      nativeReviews: native.rows,
      nativeSubscriptions: subscriptions.rows,
      discoveryFamilies: families.rows,
      publicationGuards: guards,
    };
  });
  const report = {
    protocol: "review-recovery-audit-v1",
    ...snapshot,
    independentQuality: null,
    notes: [
      "Read-only operational snapshot; no provider calls, paid work or email. No source text, query text, personal brief, account ID or credential is exported.",
      "Native review totals include only the current document version on a retained available source. Subscription totals include only active current-version scouts. A shared public review is not a completed private fit assessment.",
      "Subscription status is per account-source pair; unique post counts across status groups overlap. A pending review is not a negative relevance judgment.",
      "Source-family counts describe the last seven days of observed leads, not internet coverage or recall. Indexed social content is not native platform access; open candidates may still need freshness, eligibility and personal-fit checks.",
      "Independent relevance and global capacity remain unverified. Failed or incomplete evidence is never counted as a useful opportunity.",
    ],
  };
  const output = process.argv
    .find((value) => value.startsWith("--output="))
    ?.slice(9);
  if (output) {
    await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
    });
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.destroy();
}
