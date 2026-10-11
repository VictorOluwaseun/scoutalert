import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { withEvaluationDatabase, sql } from "./database.mjs";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";
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
  SourceDocumentRouter,
  PublicHttpRepository,
  BrowserDocumentRepository,
  AshbySourceDocumentRepository,
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

// Per scenario: six searches ($0.06 reserved), six documents and at most 36 AI attempts ($2.70 reserved).
// Disposable database, synthetic brief and one local Mailpit recipient only. Does not change any real scout.
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
assert.ok(
  process.env.SERPER_API_KEY && process.env.OPENAI_API_KEY,
  "Configure local search and AI keys first",
);
const started = performance.now();
const search = {
  goal: "Find remote product designer or UX designer jobs",
  category: "employment",
  target: "Product designer or UX designer",
  name: "Synthetic model-guided scout",
  arrangement: "remote",
  arrangementRequired: true,
  residence: "New York, United States",
  workLocations: "United States or remote worldwide",
  authorizationLocations: "United States",
  authorizationConfirmed: true,
  sponsorshipNeed: "not_needed",
  background:
    "Five years of product and UX design for B2B SaaS products, user research, prototyping and design systems",
  minimumPay: "",
  currency: "USD",
  payPeriod: "year",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
const scenario =
  process.argv.find((value) => value.startsWith("--scenario="))?.slice(11) ??
  "jobs";
assert.ok(["jobs", "projects", "services"].includes(scenario));
const output = process.argv
  .find((value) => value.startsWith("--output="))
  ?.slice(9);
assert.ok(output, "Supply a new report path with --output");
const reader =
  process.argv.find((value) => value.startsWith("--reader="))?.slice(9) ??
  "worker";
assert.ok(["http", "worker"].includes(reader));
if (scenario === "projects") {
  Object.assign(search, {
    goal: "Find remote freelance React development projects",
    category: "services",
    target: "React TypeScript web development",
    name: "Synthetic client-project scout",
    background:
      "Five years delivering React and TypeScript web applications, API integrations and dashboards for clients",
    payPeriod: "project",
  });
}
if (scenario === "services") {
  Object.assign(search, {
    goal: "Find clients requesting website redesign services",
    category: "services",
    target: "Website redesign",
    name: "Synthetic service-request scout",
    background:
      "Five years delivering website redesign, responsive layouts, WordPress and accessible user interfaces for small businesses",
    payPeriod: "project",
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
  dailyDocumentRequests: 6,
  maximumConcurrentSearches: 1,
  maximumDocuments: 6,
  exploration: { maximumDepth: 3, maximumRounds: 8, maximumSourcePages: 2 },
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
    new PostgresLeadReviewRepository(db, 36, 2_700_000),
    new OpenAILeadReviewProvider(client, model),
  );
  const planner = new PlanScoutSearch(
    new PostgresDiscoveryReasoningRepository(db, 36, 2_700_000),
    new OpenAIDiscoveryReasoningProvider(client, model),
  );
  const http = new PublicHttpRepository();
  const renderingEnabled =
    readWorkerConfiguration().SCOUT_WEB_RENDER_ENABLED === "true";
  const sourceDocuments =
    reader === "http"
      ? new PublicSourceDocumentRepository()
      : new SourceDocumentRouter(
          new PublicSourceDocumentRepository(
            http,
            renderingEnabled ? new BrowserDocumentRepository() : null,
          ),
          new AshbySourceDocumentRepository(http),
        );
  const discovery = new DiscoverWeb(
    new PostgresWebDiscoveryRepository(db),
    sourceDocuments,
    provider,
    limits,
    planner,
    reviews,
  );
  for (let step = 0; step < 120; step++) {
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
  const accepted =
    await sql`SELECT id FROM opportunity_postings WHERE open AND kind=${search.category === "services" ? "client_request" : "job"} LIMIT 1`.execute(
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
    await sql`SELECT t.id,t.posting_id,t.kind,t.result,t.analysis_task_id,a.outcome,a.usage,a.cost FROM intelligence_tasks t JOIN intelligence_attempts a ON a.task_id=t.id ORDER BY a.started_at`.execute(
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
    await sql`SELECT o.key,o.kind,o.input,o.state,o.failure,s.depth,o.result->'links' AS links,o.result->'feeds' AS feeds,o.result->'sitemaps' AS sitemaps,o.result->>'retrievedUrl' AS retrieved_url,o.result->'capture' AS capture,left(o.result->>'text',12000) AS captured_text,o.result->>'status' AS source_status,o.result->>'reason' AS source_reason,jsonb_array_length(coalesce(o.result->'links','[]'::jsonb)) AS observed_links FROM web_discovery_steps s JOIN web_discovery_operations o ON o.key=s.operation_key WHERE s.case_id=${request.runId}::uuid ORDER BY s.position`.execute(
      db,
    );
  const allLeads =
    await sql`SELECT l.url,l.title,l.content_status AS "contentStatus",l.document->>'reason' AS "contentReason",l.posting_id AS "postingId",l.posting_id IS NOT NULL AS promoted,
    CASE WHEN r.state='ready' THEN jsonb_build_object('label',r.result->>'label','scope',r.input->>'scope','explanation',r.result->>'explanation','quotes',r.result->'quotes','facts',r.result->'analysis'->'facts') ELSE NULL END AS review
    FROM web_discovery_case_leads cl JOIN web_discovery_leads l ON l.id=cl.lead_id LEFT JOIN web_lead_reviews r ON r.key=l.review_key
    WHERE cl.case_id=${request.runId}::uuid ORDER BY l.url`.execute(db);
  const matchingState =
    await sql`SELECT status,match_count FROM discovery_runs WHERE id=${request.runId}::uuid`.execute(
      db,
    );
  const taskStates =
    await sql`SELECT kind,status,count(*)::int AS count FROM intelligence_tasks GROUP BY kind,status ORDER BY kind,status`.execute(
      db,
    );
  const eligiblePostings =
    await sql`SELECT id,kind,title,url FROM opportunity_postings WHERE open ORDER BY id`.execute(
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
    operations.rows.filter((item) => item.kind === "document").length <= 6,
  );
  assert.ok(operations.rows.every((item) => item.depth <= 3));
  for (const decision of decisions.rows.filter(
    (item) => item.reason === "follow_source_link",
  )) {
    const parent = operations.rows.find(
      (item) => item.key === decision.parent_key,
    );
    assert.ok(
      [
        ...(parent?.links ?? []),
        ...(parent?.feeds ?? []),
        ...(parent?.sitemaps ?? []),
      ].some((link) => link.url === decision.action.url),
      "Follow-up URL must exist in the captured parent",
    );
  }

  assert.deepEqual(await catalog.read(randomUUID()), {
    cases: [],
    monitors: [],
    leads: [],
  });
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
    baseline: false,
    reader,
    renderingEnabled: reader === "worker" && renderingEnabled,
    status: "measured",
    deliveryOutcome:
      submitted > 0 ? "submitted_to_mailpit" : "no_eligible_digest",
    reasoning: reasoning.rows,
    sourceReviewsCompleted: allLeads.rows.filter(
      (lead) => lead.review?.scope === "source",
    ).length,
    intelligence: intelligence.rows,
    matchingState: matchingState.rows[0] ?? {
      status: "not_started_no_source_demand",
      match_count: 0,
    },
    taskStates: taskStates.rows,
    eligiblePostings: eligiblePostings.rows,
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
    dashboardLeadSampleSize: view.leads.length,
    leads: allLeads.rows,
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
      "Bounded live synthetic case using production discovery, review, assessment and delivery use cases. Worker reader includes configured browser fallback and Ashby routing without shared Redis caching; HTTP reader is a controlled reduced-access path. Native X and marketplace connector loops are not exercised. All lead rows are measured separately from the dashboard's bounded sample. Matching can remain incomplete if retries exceed the check window. Model labels are not independent ground truth; precision, recall and global throughput remain unproven.",
  };
});
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(
  JSON.stringify(
    {
      scenario,
      status: report.status,
      durationMs: report.durationMs,
      leads: report.leads.length,
      sourceReviews: report.sourceReviewsCompleted,
      matches: report.opportunities.length,
      emailsSent: report.emailsSent,
      usage: report.usage,
      aiBudget: report.aiBudget,
      output,
    },
    null,
    2,
  ),
);
