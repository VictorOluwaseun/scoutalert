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
  DiscoverWeb,
  ReviewDiscoveryLeads,
  PlanScoutSearch,
} from "../../packages/core/dist/discovery/public.js";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "../../packages/adapters/dist/onboarding/public.js";
import {
  PostgresDiscoveryReasoningRepository,
  OpenAIDiscoveryReasoningProvider,
  PostgresWebAvailabilitySource,
  PublicSourceDocumentRepository,
  SerperSearchProvider,
  PostgresWebDiscoveryRepository,
  PostgresWebDiscoveryCatalogRepository,
  PostgresLeadReviewRepository,
  OpenAILeadReviewProvider,
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

// Bounded live acceptance check: six searches ($0.06 reserved), four documents and at most 20 AI attempts ($1.50 reserved).
// Disposable database, synthetic brief and one local Mailpit recipient only. Does not change any real scout.
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
assert.ok(
  process.env.SERPER_API_KEY && process.env.OPENAI_API_KEY,
  "Configure local search and AI keys first",
);
const started = performance.now();
const baseline = process.argv.includes("--baseline");
const search = {
  goal: "Find remote product designer or UX designer jobs",
  category: "employment",
  target: "Product designer or UX designer",
  name: "Synthetic model-guided scout",
  arrangement: "remote",
  arrangementRequired: true,
  residence: "London, United Kingdom",
  workLocations: "United Kingdom or remote worldwide",
  background:
    "Five years of product and UX design for B2B SaaS products, user research, prototyping and design systems",
  minimumPay: "",
  currency: "USD",
  payPeriod: "year",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
const scenario = process.argv.includes("--scenario=us") ? "us" : "uk";
if (scenario === "us") {
  Object.assign(search, {
    residence: "New York, United States",
    workLocations: "United States or remote worldwide",
    background:
      "Eight years of product and UX design for B2B SaaS products and internal tools, user research, Figma prototyping and design systems. Bachelor's degree in design and a portfolio of shipped products.",
    authorizationLocations: "United States",
    authorizationConfirmed: true,
    sponsorshipNeed: "not_needed",
  });
}
const provider = new SerperSearchProvider(process.env.SERPER_API_KEY, {
  language: "en",
  country: "us",
  requestCostMicros: 10_000,
});
const limits = {
  dailySearchRequests: 6,
  dailySearchMicros: 60_000,
  dailyDocumentRequests: 4,
  maximumConcurrentSearches: 1,
  maximumDocuments: 4,
};
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
  const activation = new ActivateScout(
    new ReviewSearchDraft(),
    new PostgresScoutActivationUnitOfWork(db),
    new NodeScoutActivationIdentity(),
    () => new Date(),
  );
  const scout = await activation.execute(ownerId, "synthetic", {
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
  const client = createIntelligenceClient(process.env.OPENAI_API_KEY);
  const model =
    process.env.SCOUT_AI_EXTRACTION_MODEL ?? "gpt-5.4-mini-2026-03-17";
  const reviews = new ReviewDiscoveryLeads(
    new PostgresLeadReviewRepository(db, 20, 1_500_000),
    new OpenAILeadReviewProvider(client, model),
  );
  const planner = new PlanScoutSearch(
    new PostgresDiscoveryReasoningRepository(db, 20, 1_500_000),
    new OpenAIDiscoveryReasoningProvider(client, model),
  );
  const discovery = new DiscoverWeb(
    new PostgresWebDiscoveryRepository(db),
    new PublicSourceDocumentRepository(),
    provider,
    limits,
    baseline ? undefined : planner,
    baseline ? undefined : reviews,
  );
  for (let step = 0; step < 64; step++) {
    const state = await discovery.execute(request);
    console.log(JSON.stringify({ phase: "discovery", step, state }));
    if (state === "done") {
      break;
    }
    if (state === "waiting") {
      await delay(2100);
    }
  }
  for (let step = 0; step < 24; step++) {
    const state = await reviews.execute(request);
    if (state === "done") {
      break;
    }
    if (state === "waiting") {
      await delay(1000);
    }
  }
  const matching = new ScoutOpportunities(
    new PostgresScoutingRepository(db),
    new EvaluateCandidates(
      new PostgresIntelligenceRepository(db, 20, 1_500_000),
      new OpenAIIntelligenceProvider(client, model, model),
      new OpenAIEmployerResearchProvider(
        client,
        model,
        new PostgresEmployerEvidenceRepository(db, {}),
        "observed-application-links-v1",
      ),
    ),
  );
  const accepted =
    await sql`SELECT id FROM opportunity_postings WHERE open LIMIT 1`.execute(
      db,
    );
  for (let step = 0; step < 32 && accepted.rows.length > 0; step++) {
    const state = await matching.execute(request);
    console.log(JSON.stringify({ phase: "matching", step, state }));
    if (state === "done") {
      break;
    }
    if (state === "waiting") {
      await delay(1000);
    }
  }
  await new ResearchAvailability(
    new PostgresAvailabilityRepository(db),
    new PostgresWebAvailabilitySource(db),
  ).execute();
  const opportunities = await new PostgresOpportunityCatalogRepository(db).list(
    ownerId,
  );
  const smtp = createSmtpClient({
    host: "127.0.0.1",
    port: 1025,
    secure: false,
  });
  let submitted = 0;
  try {
    const delivery = new DeliverOpportunityDigests(
      new PostgresOpportunityDeliveryRepository(db),
      new SmtpEmailProvider(smtp, {
        address: "scout@scoutalert.test",
        name: "ScoutAlert local planner check",
      }),
    );
    submitted = await delivery.execute(new Date());
    assert.equal(
      await delivery.execute(new Date()),
      0,
      "Repeated delivery must not send another digest",
    );
  } finally {
    smtp.close();
  }
  const reasoning =
    await sql`SELECT input,output,rejected_output,failure,state,usage,cost FROM web_reasoning_tasks ORDER BY created_at`.execute(
      db,
    );
  const intelligence =
    await sql`SELECT t.kind,t.result,a.outcome,a.usage,a.cost FROM intelligence_tasks t JOIN intelligence_attempts a ON a.task_id=t.id ORDER BY a.started_at`.execute(
      db,
    );
  const reviewsUsage =
    await sql`SELECT state,usage,cost FROM web_lead_review_attempts ORDER BY started_at`.execute(
      db,
    );
  const deliveries =
    await sql`SELECT status,provider_message_id FROM opportunity_deliveries`.execute(
      db,
    );
  const catalog = new PostgresWebDiscoveryCatalogRepository(db);
  const view = await catalog.read(ownerId);
  const usage =
    await sql`SELECT provider,requests,reserved_micros FROM web_discovery_usage ORDER BY provider`.execute(
      db,
    );
  const ai =
    await sql`SELECT requests,reserved_microusd FROM intelligence_daily_budget`.execute(
      db,
    );
  const operations =
    await sql`SELECT o.key,o.kind,o.input,o.state,o.failure,s.depth,o.result->'links' AS links,o.result->>'text' AS captured_text,o.result->>'status' AS source_status,o.result->>'reason' AS source_reason,jsonb_array_length(coalesce(o.result->'links','[]'::jsonb)) AS observed_links FROM web_discovery_steps s JOIN web_discovery_operations o ON o.key=s.operation_key WHERE s.case_id=${request.runId}::uuid ORDER BY s.position`.execute(
      db,
    );
  const decisions =
    await sql`SELECT round,reason,action,depth,parent_key FROM web_discovery_decisions WHERE case_id=${request.runId}::uuid ORDER BY round`.execute(
      db,
    );
  assert.ok(view.cases.length === 1 && view.cases[0].status !== "searching");
  assert.ok(
    decisions.rows.length > 0,
    "Live run did not reach adaptive planning",
  );
  assert.ok(
    operations.rows.filter((item) => item.kind === "search").length <= 6,
  );
  assert.ok(
    operations.rows.filter((item) => item.kind === "document").length <= 4,
  );
  assert.ok(operations.rows.every((item) => item.depth <= 2));
  for (const decision of decisions.rows.filter(
    (item) => item.reason === "follow_source_link",
  )) {
    const parent = operations.rows.find(
      (item) => item.key === decision.parent_key,
    );
    assert.ok(
      parent?.links?.some((link) => link.url === decision.action.url),
      "Follow-up URL must exist in the captured parent",
    );
  }

  assert.deepEqual(await catalog.read(randomUUID()), { cases: [], leads: [] });
  assert.equal(await discovery.execute(request), "done");
  assert.deepEqual(
    (
      await sql`SELECT provider,requests,reserved_micros FROM web_discovery_usage ORDER BY provider`.execute(
        db,
      )
    ).rows,
    usage.rows,
  );
  return {
    checkedAt: new Date().toISOString(),
    scenario,
    baseline,
    status: submitted === 1 ? "passed" : "incomplete",
    reasoning: reasoning.rows,
    sourceReviewsCompleted: view.leads.filter(
      (lead) => lead.review?.scope === "source",
    ).length,
    intelligence: intelligence.rows,
    reviewAttempts: reviewsUsage.rows,
    opportunities,
    deliveries: deliveries.rows,
    durationMs: Math.round(performance.now() - started),
    search,
    operations: operations.rows,
    decisions: decisions.rows,
    case: view.cases[0],
    usage: usage.rows,
    aiBudget: ai.rows,
    leads: view.leads.map(
      ({ url, title, contentStatus, review, postingId }) => ({
        url,
        title,
        contentStatus,
        review,
        promoted: !!postingId,
      }),
    ),
    checks: [
      "live adaptive decisions",
      "bounded provider and model admission",
      "observed parent provenance",
      "current owner isolation",
      "terminal replay without new spending",
    ],
    emailsSent: submitted,
    realAccountsUsed: 0,
    scopeNote:
      "One live synthetic case from model-guided web discovery through cited source review, linked-page research, private assessment and eligible local Mailpit delivery. Uses production use cases and admission boundaries. Labels are model judgments, not independent ground truth. Comparative precision/recall and global throughput remain unproven.",
  };
});
await writeFile(
  new URL(
    baseline
      ? "../../evaluations/discovery/paired-baseline-discovery.json"
      : "../../evaluations/discovery/latest-model-guided-discovery.json",
    import.meta.url,
  ),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      status: report.status,
      durationMs: report.durationMs,
      case: report.case,
      emailsSent: report.emailsSent,
      matches: report.opportunities.length,
      usage: report.usage,
      aiBudget: report.aiBudget,
      decisions: report.decisions,
      report: baseline
        ? "evaluations/discovery/paired-baseline-discovery.json"
        : "evaluations/discovery/latest-model-guided-discovery.json",
    },
    null,
    2,
  ),
);
