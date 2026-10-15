import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { withEvaluationDatabase, sql } from "./database.mjs";
import {
  ActivateScout,
  ReviewSearchDraft,
} from "../../packages/core/dist/onboarding/public.js";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "../../packages/adapters/dist/onboarding/public.js";
import {
  socialQuery,
  SocialProviderError,
  ReviewDiscoveryLeads,
} from "../../packages/core/dist/discovery/public.js";
import {
  XSocialProvider,
  PostgresSocialDiscoveryRepository,
  PostgresLeadReviewRepository,
  OpenAILeadReviewProvider,
  PostgresWebAvailabilitySource,
  PostgresWebDiscoveryCatalogRepository,
} from "../../packages/adapters/dist/discovery/public.js";
import {
  createIntelligenceClient,
  PostgresScoutingRepository,
  PostgresIntelligenceRepository,
  OpenAIIntelligenceProvider,
  OpenAIEmployerResearchProvider,
  PostgresEmployerEvidenceRepository,
  PostgresAvailabilityRepository,
  PostgresOpportunityCatalogRepository,
} from "../../packages/adapters/dist/scouting/public.js";
import {
  ScoutOpportunities,
  EvaluateCandidates,
  ResearchAvailability,
} from "../../packages/core/dist/scouting/public.js";
import { DeliverOpportunityDigests } from "../../packages/core/dist/notifications/public.js";
import {
  createSmtpClient,
  SmtpEmailProvider,
  PostgresOpportunityDeliveryRepository,
} from "../../packages/adapters/dist/notifications/public.js";

// At most three native calls / $0.15 reserved and 36 AI attempts / $2.70 reserved.
// Uses disposable PostgreSQL and local Mailpit only; no saved scouts or global ledgers change.
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const scenario = process.argv
  .find((value) => value.startsWith("--scenario="))
  ?.slice(11);
const output = process.argv
  .find((value) => value.startsWith("--output="))
  ?.slice(9);
assert.ok(["projects", "services"].includes(scenario) && output);
assert.ok(
  process.env.X_BEARER_TOKEN && process.env.OPENAI_API_KEY,
  "Configure provider credentials locally first",
);
const search = {
  goal:
    scenario === "projects"
      ? "Find remote freelance React development projects"
      : "Find clients requesting website redesign services",
  category: "services",
  target:
    scenario === "projects"
      ? "React TypeScript web development"
      : "Website redesign",
  name: `Synthetic native ${scenario} scout`,
  arrangement: "remote",
  arrangementRequired: true,
  residence: "New York, United States",
  workLocations: "United States or remote worldwide",
  authorizationLocations: "United States",
  authorizationConfirmed: true,
  sponsorshipNeed: "not_needed",
  background:
    scenario === "projects"
      ? "Five years delivering React and TypeScript web applications, API integrations and dashboards for clients"
      : "Five years delivering website redesign, responsive layouts, WordPress and accessible user interfaces for small businesses",
  minimumPay: "",
  currency: "USD",
  payPeriod: "project",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
const started = performance.now();
const report = await withEvaluationDatabase(async (db) => {
  const ownerId = randomUUID();
  await db
    .insertInto("users")
    .values({
      id: ownerId,
      email: `${ownerId}@scoutalert.test`,
      verified_at: new Date(),
    })
    .execute();
  const scout = await new ActivateScout(
    new ReviewSearchDraft(),
    new PostgresScoutActivationUnitOfWork(db),
    new NodeScoutActivationIdentity(),
    () => new Date(),
  ).execute(ownerId, "synthetic", {
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
  // Acknowledge only this synthetic activation event, as the local diagnostic acts as its dispatcher.
  await sql`UPDATE outbox_events SET published_at=now()`.execute(db);
  const records = new PostgresSocialDiscoveryRepository(db, {
    dailyRequests: 36,
    dailyMicros: 2_700_000,
  });
  const native = new XSocialProvider(process.env.X_BEARER_TOKEN);
  const query = socialQuery(search);
  await records.subscribe(
    { scoutId: scout.id, ownerId, version: 1, search },
    "x-public-demand-v1",
    query,
  );
  const limits = {
    paceAcrossDay: false,
    dailyRequests: 3,
    dailyMicros: 150_000,
    postCostMicros: 5_000,
    pageSize: 10,
  };
  for (let step = 0; step < 3; step++) {
    const claim = await records.claim(limits);
    if (claim.status !== "claimed") {
      break;
    }
    try {
      await records.complete(claim, await native.read(claim.operation));
    } catch (error) {
      await records.fail(
        claim,
        error instanceof SocialProviderError
          ? error
          : new SocialProviderError("provider_unavailable"),
      );
    }
    await records.maintain();
  }
  const client = createIntelligenceClient(process.env.OPENAI_API_KEY);
  const model =
    process.env.SCOUT_AI_EXTRACTION_MODEL ?? "gpt-5.4-mini-2026-03-17";
  const reviews = new ReviewDiscoveryLeads(
    new PostgresLeadReviewRepository(db, 36, 2_700_000),
    new OpenAILeadReviewProvider(client, model),
  );
  const cases = (
    await sql`SELECT id AS "runId",scout_id AS "scoutId",owner_id AS "ownerId",scout_version AS version FROM web_discovery_cases ORDER BY started_at`.execute(
      db,
    )
  ).rows;
  for (const request of cases) {
    for (let step = 0; step < 20; step++) {
      const state = await reviews.execute(request);
      if (state === "done") {
        break;
      }
      if (state === "waiting") {
        await delay(1000);
      }
    }
    await sql`UPDATE web_discovery_cases SET status='completed' WHERE id=${request.runId}::uuid AND status='searching'`.execute(
      db,
    );
    const matching = new ScoutOpportunities(
      new PostgresScoutingRepository(db),
      new EvaluateCandidates(
        new PostgresIntelligenceRepository(db, 36, 2_700_000),
        new OpenAIIntelligenceProvider(client, model, model),
        new OpenAIEmployerResearchProvider(
          client,
          model,
          new PostgresEmployerEvidenceRepository(db, {}),
          "observed-application-links-v1",
        ),
      ),
    );
    for (let step = 0; step < 32; step++) {
      const state = await matching.execute(request);
      if (state === "done") {
        break;
      }
      if (state === "waiting") {
        await delay(1000);
      }
    }
  }
  await new ResearchAvailability(
    new PostgresAvailabilityRepository(db),
    new PostgresWebAvailabilitySource(db),
  ).execute();
  const recommendations = await new PostgresOpportunityCatalogRepository(
    db,
  ).list(ownerId);
  const smtp = createSmtpClient({
    host: "127.0.0.1",
    port: 1025,
    secure: false,
  });
  let emailsSent;
  try {
    const delivery = new DeliverOpportunityDigests(
      new PostgresOpportunityDeliveryRepository(db),
      new SmtpEmailProvider(smtp, {
        address: "scout@scoutalert.test",
        name: "ScoutAlert native diagnostic",
      }),
    );
    emailsSent = await delivery.execute(new Date());
    assert.equal(await delivery.execute(new Date()), 0);
  } finally {
    smtp.close();
  }
  const catalog = new PostgresWebDiscoveryCatalogRepository(db);
  assert.deepEqual(await catalog.read(randomUUID()), {
    cases: [],
    monitors: [],
    leads: [],
  });
  const attempts = (
    await sql`SELECT o.kind,o.state,o.failure,a.returned_posts,a.partial FROM x_search_attempts a JOIN web_discovery_operations o ON o.key=a.key ORDER BY o.created_at`.execute(
      db,
    )
  ).rows;
  const captures = (
    await sql`SELECT l.url,l.content_status,l.document->>'truncated' AS truncated,r.state AS review_state,r.result->>'label' AS label,r.failure AS review_failure FROM x_posts p JOIN web_discovery_leads l ON l.id=p.lead_id LEFT JOIN web_lead_reviews r ON r.key=l.review_key ORDER BY l.url`.execute(
      db,
    )
  ).rows;
  const usage = (
    await sql`SELECT provider,requests,reserved_micros FROM web_discovery_usage ORDER BY provider`.execute(
      db,
    )
  ).rows;
  const ai = (
    await sql`SELECT state,usage,cost FROM web_lead_review_attempts UNION ALL SELECT outcome,usage,cost FROM intelligence_attempts`.execute(
      db,
    )
  ).rows;
  const fit = (
    await sql`SELECT kind,status,count(*)::int AS count FROM intelligence_tasks GROUP BY kind,status`.execute(
      db,
    )
  ).rows;
  return {
    checkedAt: new Date().toISOString(),
    scenario,
    query,
    policy: "x-public-demand-v1",
    attempts,
    captures,
    fit,
    usage,
    ai,
    recommendations: recommendations.map((item) => ({
      url: item.url,
      title: item.title,
      uncertainties: item.uncertainties,
    })),
    emailsSent,
    durationMs: Math.round(performance.now() - started),
    downstreamEvidence:
      captures.length === 0
        ? "not_exercised_no_posts_returned"
        : "see_recorded_reviews_fit_and_delivery",
    checks: [
      "native API admission",
      captures.length === 0
        ? "zero-result path only; no source review or fit evidence"
        : "production source review and private matching",
      emailsSent > 0 ? "local Mailpit delivery" : "no digest submitted",
      "owner isolation",
      "no duplicate delivery",
    ],
    scope:
      "Bounded fresh native X run with synthetic brief and disposable database. Raw post bodies are not retained in this diagnostic. No independent precision, recall or useful-result claim.",
  };
});
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(
  JSON.stringify({
    output,
    attempts: report.attempts,
    captures: report.captures.length,
    recommendations: report.recommendations.length,
    emailsSent: report.emailsSent,
  }),
);
