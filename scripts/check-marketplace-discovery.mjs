import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { withEvaluationDatabase, sql } from "./evaluation/database.mjs";
import {
  ActivateScout,
  ReviewSearchDraft,
} from "../packages/core/dist/onboarding/public.js";
import { ScoutOpportunities } from "../packages/core/dist/scouting/public.js";
import {
  NodeScoutActivationIdentity,
  PostgresScoutActivationUnitOfWork,
} from "../packages/adapters/dist/onboarding/public.js";
import {
  FreelancerSourceConnector,
  FreelancerAvailabilitySource,
  PostgresSourceRepository,
  PostgresScoutingRepository,
  PostgresOpportunityCatalogRepository,
  PostgresRelevanceFeedbackRepository,
  PostgresAvailabilityRepository,
} from "../packages/adapters/dist/scouting/public.js";
import { PostgresOpportunityFeedbackRepository } from "../packages/adapters/dist/scouts/public.js";
import { PostgresOpportunityDeliveryRepository } from "../packages/adapters/dist/notifications/public.js";

// Public reads plus a disposable test schema only: no real account, browser session, model request or email send.
const started = performance.now();
const snapshot = await new FreelancerSourceConnector().read(
  "freelancer",
  new Date(),
);
const selected = snapshot.postings.find(
  (posting) => posting.title.length >= 5 && posting.title.length <= 100,
);
assert.ok(selected, "No suitable public request in this source window");
const availability = await new FreelancerAvailabilitySource().check(selected);
assert.equal(
  availability.status,
  "available",
  "Posting changed or cannot be verified; rerun with a fresh snapshot",
);
const report = await withEvaluationDatabase(async (db) => {
  const sources = new PostgresSourceRepository(db);
  const lease = await sources.claim(snapshot.source, new Date());
  await sources.publish(snapshot, lease);
  const ownerId = randomUUID();
  await db
    .insertInto("users")
    .values({
      id: ownerId,
      email: `${ownerId}@scoutalert.test`,
      verified_at: new Date(),
    })
    .execute();
  const search = {
    goal: "Find client projects and service requests",
    category: "services",
    target: selected.title,
    name: "Synthetic marketplace check",
    arrangement: "remote",
    arrangementRequired: false,
    residence: "Lagos",
    workLocations: "Worldwide",
    background: "Synthetic professional profile for connector validation only",
    minimumPay: "",
    currency: "USD",
    payPeriod: "project",
    unknownEligibility: "review",
    undisclosedPay: "include",
  };
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
      frequency: "daily",
      timezone: "UTC",
      deliveryTime: "00:00",
      weekday: "Monday",
      promptAlerts: false,
      consent: true,
      consentVersion: "opportunity-alerts-v1",
    },
  });
  const request = {
    ownerId,
    scoutId: scout.id,
    version: 1,
    runId: randomUUID(),
  };
  const matching = new ScoutOpportunities(
    new PostgresScoutingRepository(db),
    undefined,
    new PostgresRelevanceFeedbackRepository(db),
  );
  assert.equal(await matching.execute(request), "done");
  const catalog = new PostgresOpportunityCatalogRepository(db);
  const matches = await catalog.list(ownerId);
  assert.ok(matches.some((item) => item.id === selected.id));
  assert.deepEqual(await catalog.list(randomUUID()), []);
  const before = await db
    .selectFrom("scout_recommendations")
    .select("rank")
    .where("scout_id", "=", scout.id)
    .where("posting_id", "=", selected.id)
    .executeTakeFirstOrThrow();
  const feedback = new PostgresOpportunityFeedbackRepository(db);
  await feedback.record(ownerId, selected.id, {
    key: randomUUID(),
    version: 0,
    value: "relevant",
  });
  await matching.execute({ ...request, runId: randomUUID() });
  const after = await db
    .selectFrom("scout_recommendations")
    .select("rank")
    .where("scout_id", "=", scout.id)
    .where("posting_id", "=", selected.id)
    .executeTakeFirstOrThrow();
  assert.equal(after.rank, before.rank + 1);
  const research = new PostgresAvailabilityRepository(db);
  let checked = false;

  for (let index = 0; index < matches.length; index++) {
    const claim = await research.claim();
    assert.ok(claim);

    if (claim.posting.id !== selected.id) {
      await research.complete(claim.token, {
        status: "unresolved",
        checkedAt: new Date().toISOString(),
        sourceUrl: claim.posting.url,
        fingerprint: null,
      });
      continue;
    }

    await research.complete(claim.token, availability);
    checked = true;
    break;
  }

  assert.ok(checked);
  const delivery = new PostgresOpportunityDeliveryRepository(db);
  const candidates = await delivery.candidates();
  const window = `digest:UTC:${new Date().toISOString().slice(0, 10)}:00:00`;
  const prepared = await delivery.prepare(ownerId, window, candidates);
  assert.ok(prepared?.opportunities.some((item) => item.id === selected.id));
  assert.equal(await delivery.prepare(ownerId, window, candidates), null);
  await feedback.record(ownerId, selected.id, {
    key: randomUUID(),
    version: 1,
    value: "hidden",
  });
  assert.ok(
    !(await catalog.list(ownerId)).some((item) => item.id === selected.id),
  );
  const intents =
    await sql`SELECT id FROM outbox_events WHERE owner_id=${ownerId}::uuid AND event_type='scout.refresh_requested'`.execute(
      db,
    );
  assert.equal(intents.rows.length, 2);

  return {
    checkedAt: new Date().toISOString(),
    source: snapshot.source,
    scope: snapshot.scope,
    fetchedCount: snapshot.postings.length,
    selected: { id: selected.id, title: selected.title, url: selected.url },
    availability,
    matchedCount: matches.length,
    feedbackRankChange: after.rank - before.rank,
    checks: [
      "public collection",
      "leased persistence",
      "category retrieval",
      "provisional matching",
      "owner isolation",
      "feedback ranking",
      "individual availability",
      "idempotent delivery reservation",
      "hidden suppression",
      "durable refresh intents",
    ],
    emailsSent: 0,
    modelRequests: 0,
    scopeNote:
      "Integration smoke check with a synthetic brief targeting one captured title; not relevance, worldwide eligibility or production-scale validation.",
  };
});
report.durationMs = Math.round(performance.now() - started);
await writeFile(
  new URL(
    "../evaluations/marketplace-discovery/latest-smoke.json",
    import.meta.url,
  ),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
