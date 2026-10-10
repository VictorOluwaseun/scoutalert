import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { sql } from "./database.mjs";
import {
  createPostgresClient,
  migrateDatabase,
} from "../../packages/adapters/dist/database/public.js";
import {
  NodeScoutActivationIdentity,
  PostgresScoutActivationUnitOfWork,
} from "../../packages/adapters/dist/onboarding/public.js";
import {
  PublicSourceDocumentRepository,
  PostgresWebDiscoveryRepository,
  PostgresLeadReviewRepository,
  PostgresSourceMonitoringRepository,
} from "../../packages/adapters/dist/discovery/public.js";
import {
  ActivateScout,
  ReviewSearchDraft,
} from "../../packages/core/dist/onboarding/public.js";
import {
  planDiscovery,
  ReviewDiscoveryLeads,
  LearnSourceMonitoring,
} from "../../packages/core/dist/discovery/public.js";

// One known public feed, two synthetic owners, disposable database schema. No AI, SMTP, search API or application configuration.
const url = new URL(process.env.FEED_TEST_DATABASE_URL ?? "");
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.pathname === "/scoutalert_test",
);
const admin = createPostgresClient(url.toString());
const schema = `feed_live_${randomUUID().replaceAll("-", "")}`;
url.searchParams.set("options", `-c search_path=${schema}`);
const db = createPostgresClient(url.toString());
let created = false;
let captures = 0;
let feed = null;
const started = performance.now();
const feedUrl = "https://weworkremotely.com/remote-jobs.rss";
const search = {
  goal: "Find remote product design work",
  category: "employment",
  target: "Product designer",
  name: "Synthetic feed check",
  arrangement: "remote",
  arrangementRequired: true,
  residence: "Lagos",
  workLocations: "Worldwide",
  background: "Product design",
  minimumPay: "",
  currency: "USD",
  payPeriod: "year",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
const capability = {
  id: "known-feed-fixture",
  configuration: "v1",
  access: "public_index",
  language: "en",
  country: null,
  requestCostMicros: 0,
};
const limits = {
  dailySearchRequests: 4,
  dailySearchMicros: 0,
  dailyDocumentRequests: 2,
  maximumConcurrentSearches: 1,
  maximumDocuments: 1,
};
const reader = new PublicSourceDocumentRepository();
const records = new PostgresWebDiscoveryRepository(db);
const reviews = new ReviewDiscoveryLeads(
  new PostgresLeadReviewRepository(db, 0, 0),
  {
    configuration: "feed-structure-check",
    /** Parser-confirmed directories must never request a model. */
    async review() {
      throw new Error("unexpected_ai_request");
    },
  },
);
const learning = new LearnSourceMonitoring(
  new PostgresSourceMonitoringRepository(db),
);

/** Admits one publisher-documented feed as a synthetic search seed, then uses durable source capture, review and monitoring. */
async function runOwner() {
  const ownerId = randomUUID();
  await db
    .insertInto("users")
    .values({
      id: ownerId,
      email: `${ownerId}@scoutalert.test`,
      verified_at: new Date(),
    })
    .execute();
  const activate = new ActivateScout(
    new ReviewSearchDraft(),
    new PostgresScoutActivationUnitOfWork(db),
    new NodeScoutActivationIdentity(),
    () => new Date(),
  );
  const scout = await activate.execute(ownerId, "synthetic", {
    key: randomUUID(),
    search,
    confirmed: true,
    alerts: {
      frequency: "dashboard",
      timezone: "UTC",
      deliveryTime: "08:00",
      weekday: "Monday",
      promptAlerts: false,
      consent: false,
      consentVersion: "opportunity-alerts-v1",
    },
  });
  const request = {
    ownerId,
    scoutId: scout.id,
    runId: randomUUID(),
    version: 1,
  };
  const plan = planDiscovery(search, 1, 1, capability);
  plan.queries = plan.queries.slice(0, 1);
  await records.open(request, plan, capability);
  for (let step = 0; step < 12; step++) {
    const claim = await records.claim(request, limits);
    if (claim.status === "done") {
      assert.equal(await reviews.execute(request), "done");
      await learning.execute(request);
      return;
    }
    if (claim.status !== "claimed") {
      continue;
    }
    if (claim.operation.kind === "search") {
      await records.complete(claim.key, claim.token, {
        kind: "search",
        checkedAt: new Date().toISOString(),
        completeness: "window",
        nextPage: null,
        observations: [
          {
            url: feedUrl,
            title: "We Work Remotely feed",
            snippet: "Publisher-documented remote jobs feed",
            rank: 1,
          },
        ],
      });
      continue;
    }
    assert.equal(claim.operation.url, feedUrl);
    assert.equal(captures++, 0, "The second owner must reuse public work");
    feed = await reader.read(feedUrl);
    assert.ok(
      feed.status === "fetched" &&
        feed.feed &&
        feed.links?.length &&
        !feed.posting,
      `Feed capture unavailable: ${feed.reason}`,
    );
    await records.complete(claim.key, claim.token, feed);
  }
  throw new Error("feed_pipeline_did_not_settle");
}

try {
  await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
  created = true;
  await migrateDatabase(db, schema);
  await runOwner();
  await runOwner();
  const review =
    await sql`SELECT l.posting_id,r.result->>'label' AS label,r.attempts FROM web_discovery_leads l JOIN web_lead_reviews r ON r.key=l.review_key WHERE l.url=${feedUrl}`.execute(
      db,
    );
  const monitors =
    await sql`SELECT kind,count(*)::int AS count FROM web_source_monitors GROUP BY kind ORDER BY kind`.execute(
      db,
    );
  const interests =
    await sql`SELECT count(DISTINCT i.owner_id)::int AS owners FROM web_source_interests i JOIN web_source_monitors m ON m.id=i.monitor_id WHERE m.url=${feedUrl}`.execute(
      db,
    );
  const ai =
    await sql`SELECT coalesce(sum(requests),0)::int AS requests FROM intelligence_daily_budget`.execute(
      db,
    );
  assert.deepEqual(review.rows, [
    { posting_id: null, label: "directory", attempts: 0 },
  ]);
  assert.equal(interests.rows[0].owners, 2);
  assert.equal(ai.rows[0].requests, 0);
  const report = {
    kind: "live-feed-durable-pipeline-check",
    recordedAt: new Date().toISOString(),
    feedUrl,
    window: feed.feed,
    capture: feed.capture,
    captures,
    review: review.rows[0],
    monitors: monitors.rows,
    subscribedSyntheticOwners: interests.rows[0].owners,
    aiRequests: ai.rows[0].requests,
    elapsedMilliseconds: Math.round(performance.now() - started),
    limitations:
      "A documented feed was seeded explicitly, not discovered by a live search provider. Real source capture, durable review, two-owner reuse and monitor/probe registration ran against an isolated database. No child-page AI assessment, private recommendation, mail delivery or running production worker is claimed. The schema is deleted after the check.",
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
  if (created) {
    await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
  }
  await admin.destroy();
}
