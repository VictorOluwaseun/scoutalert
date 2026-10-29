import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { withEvaluationDatabase, sql } from "./database.mjs";
import { withSharedModelTokenBudget } from "./shared-token-budget.mjs";
import { summarizeLiveQuality } from "./live-quality-summary.mjs";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";
import {
  ActivateScout,
  ReviewSearchDraft,
} from "../../packages/core/dist/onboarding/public.js";
import {
  DiscoverWeb,
  ReviewDiscoveryLeads,
  PlanScoutSearch,
  mayPublishLead,
  validLeadReview,
  normalizeReviewDeadline,
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
  BlueskySourceDocumentRepository,
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
  validFit,
} from "../../packages/core/dist/scouting/public.js";
import { DeliverOpportunityDigests } from "../../packages/core/dist/notifications/public.js";
import {
  createSmtpClient,
  SmtpEmailProvider,
  PostgresOpportunityDeliveryRepository,
} from "../../packages/adapters/dist/notifications/public.js";

// Per scenario: six searches ($0.06 reserved), six documents and at most 36 AI attempts ($2.70 reserved).
// Synthetic data stays in a disposable database; AI token reservations share the running worker's durable ledger.
// One local Mailpit recipient only. Does not change any real scout.
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const withoutAi = process.argv.includes("--without-ai");
const planningFallback = process.argv.includes("--planning-fallback");
assert.ok(
  !planningFallback || withoutAi,
  "Planning fallback requires --without-ai",
);
assert.ok(
  withoutAi || process.env.OPENAI_API_KEY,
  "Configure a local AI key first",
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
const recapturePath = process.argv
  .find((value) => value.startsWith("--recapture-cases="))
  ?.slice(18);
const recaptures = recapturePath ? await captureCases(recapturePath) : null;
assert.ok(
  recaptures || process.env.SERPER_API_KEY,
  "Configure a local search key first",
);
const provider = recaptures
  ? {
      capability: {
        id: "recorded-capture-check",
        configuration: "recorded-capture-v1",
        access: "public_index",
        language: "en",
        country: "us",
        requestCostMicros: 0,
      },
      /** Seeds only previously recorded source URLs; this makes no live search call and measures no discovery recall. */
      async search(query) {
        return {
          kind: "search",
          query,
          checkedAt: new Date().toISOString(),
          observations: recaptures.map((item, index) => ({
            url: item.url,
            title: item.title,
            snippet: item.snippet,
            rank: index + 1,
          })),
        };
      },
    }
  : new SerperSearchProvider(process.env.SERPER_API_KEY, {
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
/** Exercises production use cases with synthetic records and the shared model token guard. */
const runScenario = async (db, tokenBudget) => {
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
  const client = createIntelligenceClient(
    process.env.OPENAI_API_KEY ?? "disabled",
    tokenBudget,
  );
  const model =
    process.env.SCOUT_AI_EXTRACTION_MODEL ?? "gpt-5.4-mini-2026-03-17";
  const reviewProvider = new OpenAILeadReviewProvider(client, model);
  const rejectedReviews = [];
  const reviewFailures = [];
  const reviews = new ReviewDiscoveryLeads(
    new PostgresLeadReviewRepository(db, 36, 2_700_000),
    {
      configuration: reviewProvider.configuration,
      /** Saves invalid synthetic source evidence for diagnosis without changing production validation or retry admission. */
      async review(inputs) {
        const result = await reviewProvider.review(inputs).catch((error) => {
          reviewFailures.push({
            urls: inputs.map((input) => input.url),
            name: error.name,
            message: String(error.message).slice(0, 2000),
          });
          throw error;
        });
        for (const input of inputs) {
          const output = result.reviews.find((item) => item.id === input.id);
          if (
            !output ||
            !validLeadReview(
              input,
              normalizeReviewDeadline(output.review, input.text),
            )
          ) {
            rejectedReviews.push({ input, output });
          }
        }
        return result;
      },
    },
  );
  const reasoningProvider = new OpenAIDiscoveryReasoningProvider(client, model);
  const planner = new PlanScoutSearch(
    planningFallback
      ? {
          /** Exercises the production unavailable-planner path with no database admission or model call. */
          async claim() {
            return { status: "unavailable" };
          },
          /** Unavailable work cannot complete a provider attempt. */
          async complete() {
            throw new Error("unexpected_fallback_completion");
          },
          /** Unavailable work cannot record a provider failure. */
          async fail() {
            throw new Error("unexpected_fallback_failure");
          },
        }
      : new PostgresDiscoveryReasoningRepository(db, 36, 2_700_000),
    reasoningProvider,
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
          new BlueskySourceDocumentRepository(http),
        );
  const discovery = new DiscoverWeb(
    new PostgresWebDiscoveryRepository(db),
    sourceDocuments,
    provider,
    limits,
    withoutAi && !planningFallback ? undefined : planner,
    withoutAi ? undefined : reviews,
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
  for (let step = 0; !withoutAi && step < 24; step++) {
    const state = await reviews.execute(request);
    if (state === "done") {
      break;
    }
    if (state === "waiting") {
      await delay(1000);
    }
  }
  const intelligenceProvider = new OpenAIIntelligenceProvider(
    client,
    model,
    model,
  );
  const rejectedFits = [];
  const matching = new ScoutOpportunities(
    new PostgresScoutingRepository(db),
    new EvaluateCandidates(
      new PostgresIntelligenceRepository(db, 36, 2_700_000),
      {
        configuration: intelligenceProvider.configuration,
        /** Uses the production extractor unchanged; diagnostic capture must not affect admission. */
        extract: (posting) => intelligenceProvider.extract(posting),
        /** Retains rejected output only for this synthetic receipt so evidence failures can be investigated without accepting them. */
        async assess(posting, brief, analysis) {
          const result = await intelligenceProvider.assess(
            posting,
            brief,
            analysis,
          );
          if (!validFit(posting, brief, result.fit, analysis)) {
            rejectedFits.push({ posting, analysis, result });
          }
          return result;
        },
      },
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
  for (
    let step = 0;
    !withoutAi && step < 32 && accepted.rows.length > 0;
    step++
  ) {
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
  const publicationRows =
    await sql`SELECT l.url,l.posting_id AS linked_posting_id,r.posting_id AS reviewed_posting_id,r.input,r.result
    FROM web_discovery_case_leads cl JOIN web_discovery_leads l ON l.id=cl.lead_id JOIN web_lead_reviews r ON r.key=l.review_key
    WHERE cl.case_id=${request.runId}::uuid AND r.state='ready' ORDER BY l.url`.execute(
      db,
    );
  const publication = publicationRows.rows.map((row) => ({
    url: row.url,
    linkedPostingId: row.linked_posting_id,
    reviewedPostingId: row.reviewed_posting_id,
    publishable: mayPublishLead(row.input, row.result, new Date()),
    input: row.input,
    review: row.result,
  }));
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
  if (view.cases.length !== 1 || view.cases[0].status === "searching") {
    await writeFile(
      output,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          status: "incomplete",
          scenario,
          cases: view.cases,
          reasoning: reasoning.rows,
          reviewAttempts: reviewsUsage.rows,
          operations: operations.rows,
          decisions: decisions.rows,
          usage: usage.rows,
          aiBudget: ai.rows,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
  }
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
  if (withoutAi) {
    assert.equal(reasoning.rows.length, 0, "AI planning must remain disabled");
    assert.equal(reviewsUsage.rows.length, 0, "AI review must remain disabled");
    assert.equal(
      intelligence.rows.length,
      0,
      "AI matching must remain disabled",
    );
    assert.equal(ai.rows.length, 0, "Capture checks must reserve no AI budget");
  }
  return {
    checkedAt: new Date().toISOString(),
    scenario,
    recaptureCases: recaptures,
    baseline: false,
    reasoningConfiguration: reasoningProvider.configuration,
    plan: await new PostgresWebDiscoveryRepository(db).preparedPlan(request),
    reader,
    renderingEnabled: reader === "worker" && renderingEnabled,
    status: withoutAi ? "captured_without_ai" : "measured",
    aiEnabled: !withoutAi,
    planningFallback,
    deliveryOutcome:
      submitted > 0 ? "submitted_to_mailpit" : "no_eligible_digest",
    reasoning: reasoning.rows,
    sourceReviewsCompleted: allLeads.rows.filter(
      (lead) => lead.review?.scope === "source",
    ).length,
    intelligence: intelligence.rows,
    rejectedFits,
    rejectedReviews,
    reviewFailures,
    matchingState: matchingState.rows[0] ?? {
      status: withoutAi
        ? "not_tested_ai_disabled"
        : "not_started_no_source_demand",
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
    publication,
    checks: [
      withoutAi
        ? "deterministic live capture; AI review and recommendations not tested"
        : recaptures
          ? "recorded URLs recaptured and reassessed, no new discovery search"
          : "live adaptive decisions",
      "bounded provider and model admission",
      "observed parent provenance",
      "current owner isolation",
      "terminal replay without new spending",
    ],
    emailsSent: submitted,
    realAccountsUsed: 0,
    scopeNote:
      (withoutAi
        ? "AI is explicitly disabled: this measures live source discovery and capture, not source interpretation or recommendation quality. "
        : "") +
      (recaptures
        ? "Seeded recapture regression: search observations replay previously recorded URLs; no search-provider request or new discovery/recall measurement. "
        : "") +
      "Bounded live synthetic case using production discovery, review, assessment and delivery use cases. Worker reader includes configured browser fallback and Ashby routing without shared Redis caching; HTTP reader is a controlled reduced-access path. Native X and marketplace connector loops are not exercised. All lead rows are measured separately from the dashboard's bounded sample. Matching can remain incomplete if retries exceed the check window. Model labels are not independent ground truth; precision, recall and global throughput remain unproven.",
  };
};
const report = await withEvaluationDatabase(
  withSharedModelTokenBudget(runScenario, !withoutAi),
);
const stages = summarizeLiveQuality(report);
await writeFile(output, JSON.stringify({ ...report, stages }, null, 2) + "\n", {
  flag: "wx",
});
console.log(
  JSON.stringify(
    {
      scenario,
      status: stages.executionStatus,
      durationMs: report.durationMs,
      leads: report.leads.length,
      sourceReviews: report.sourceReviewsCompleted,
      matches: report.opportunities.length,
      emailsSent: report.emailsSent,
      usage: report.usage,
      aiBudget: report.aiBudget,
      sharedTokenBudget: report.sharedTokenBudget,
      output,
    },
    null,
    2,
  ),
);

/** Validates a small regression packet against recorded operations so source URLs and previous capture states are auditable. */
async function captureCases(path) {
  const cases = JSON.parse(await readFile(path, "utf8"));
  assert.ok(Array.isArray(cases) && cases.length > 0 && cases.length <= 6);
  assert.equal(new Set(cases.map((item) => item.url)).size, cases.length);
  return Promise.all(
    cases.map(async (item) => {
      const prior = JSON.parse(await readFile(item.sourceReport, "utf8"));
      const operation = prior.operations.find(
        (entry) => entry.kind === "document" && entry.input.url === item.url,
      );
      assert.ok(
        operation,
        "Recapture URL must have a recorded source operation",
      );
      const lead = prior.leads.find((entry) => entry.url === item.url);
      return {
        url: item.url,
        sourceReport: item.sourceReport,
        priorReason: operation.source_reason,
        priorCapture: operation.capture,
        title: lead?.title ?? null,
        snippet: null,
      };
    }),
  );
}
