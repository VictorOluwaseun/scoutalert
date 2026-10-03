import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { withEvaluationDatabase, sql } from "./database.mjs";
import {
  ActivateScout,
  ReviewSearchDraft,
} from "../../packages/core/dist/onboarding/public.js";
import {
  ReviewDiscoveryLeads,
  planDiscovery,
} from "../../packages/core/dist/discovery/public.js";
import {
  ScoutOpportunities,
  EvaluateCandidates,
  ResearchAvailability,
} from "../../packages/core/dist/scouting/public.js";
import { DeliverOpportunityDigests } from "../../packages/core/dist/notifications/public.js";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "../../packages/adapters/dist/onboarding/public.js";
import {
  PublicSourceDocumentRepository,
  PostgresWebDiscoveryRepository,
  PostgresLeadReviewRepository,
  PostgresWebAvailabilitySource,
  OpenAILeadReviewProvider,
  PostgresWebDiscoveryCatalogRepository,
} from "../../packages/adapters/dist/discovery/public.js";
import {
  PostgresScoutingRepository,
  PostgresIntelligenceRepository,
  OpenAIIntelligenceProvider,
  createIntelligenceClient,
  PostgresOpportunityCatalogRepository,
  PostgresAvailabilityRepository,
} from "../../packages/adapters/dist/scouting/public.js";
import {
  createSmtpClient,
  SmtpEmailProvider,
  PostgresOpportunityDeliveryRepository,
} from "../../packages/adapters/dist/notifications/public.js";

// Explicit live check: two public pages, at most five AI reservations, one synthetic recipient in local Mailpit.
// Uses a disposable test schema; it never starts or changes a real account's scout.
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
assert.ok(
  process.env.OPENAI_API_KEY,
  "A locally configured AI key is required",
);
const model =
  process.env.SCOUT_AI_EXTRACTION_MODEL ?? "gpt-5.4-mini-2026-03-17";
const client = createIntelligenceClient(process.env.OPENAI_API_KEY);
const sourceUrls = [
  "https://www.wearedevelopers.com/jobs/ext/3129074-software-engineer-2-mobile-developer-ios-android",
  "https://www.freelancermap.com/projects",
];
const started = performance.now();
const report = await withEvaluationDatabase(async (db) => {
  const ownerId = randomUUID();
  const recipient = `web-review-${ownerId}@scoutalert.test`;
  await db
    .insertInto("users")
    .values({ id: ownerId, email: recipient, verified_at: new Date() })
    .execute();
  const search = {
    goal: "Find software engineering employment",
    category: "employment",
    target: "Software engineer",
    name: "Synthetic web evidence check",
    arrangement: "open",
    arrangementRequired: false,
    residence: "Lagos",
    workLocations: "Open to relocation",
    background: "Two years building mobile applications with Kotlin and Swift",
    minimumPay: "",
    currency: "USD",
    payPeriod: "year",
    unknownEligibility: "review",
    undisclosedPay: "include",
  };
  const alerts = {
    frequency: "daily",
    timezone: "UTC",
    deliveryTime: "00:00",
    weekday: "Monday",
    promptAlerts: false,
    consent: true,
    consentVersion: "opportunity-alerts-v1",
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
    alerts,
  });
  const request = {
    ownerId,
    scoutId: scout.id,
    version: 1,
    runId: randomUUID(),
  };
  const discovery = new PostgresWebDiscoveryRepository(db);
  await discovery.open(request, planDiscovery(search, 1, 2), null);
  await sql`UPDATE web_discovery_cases SET status='completed',finished_at=now() WHERE id=${request.runId}::uuid`.execute(
    db,
  );
  const documents = new PublicSourceDocumentRepository();
  const captures = [];
  for (const url of sourceUrls) {
    const document = await documents.read(url);
    const id = createHash("sha256").update(url).digest("hex");
    await sql`INSERT INTO web_discovery_leads(id,url,source,title,snippet,first_seen_at,last_seen_at,checked_at,content_status,document) VALUES(${id},${url},${new URL(url).hostname},NULL,NULL,now(),now(),${document.checkedAt}::timestamptz,${document.status},${JSON.stringify(document)}::jsonb)`.execute(
      db,
    );
    await sql`INSERT INTO web_discovery_case_leads(case_id,lead_id) VALUES(${request.runId}::uuid,${id})`.execute(
      db,
    );
    captures.push(document);
    console.log(
      JSON.stringify({
        phase: "source",
        url,
        status: document.status,
        characters: document.text?.length ?? 0,
      }),
    );
  }
  const examples = [
    {
      text: "I build websites for small businesses. Hire me for your next project; my portfolio is open.",
      expected: "service_offer",
    },
    {
      text: "Hiring trends: five tips for finding a software engineer role in 2026.",
      expected: "discussion",
    },
    {
      text: "We need a freelance designer to build our company website. Budget USD 2000. Please send a portfolio.",
      expected: "client_request",
    },
    {
      text: "The Software Engineer opening is now closed. We are no longer accepting applications.",
      expected: "closed",
    },
  ];
  for (const [index, example] of examples.entries()) {
    const id = `synthetic-${index}`;
    await sql`INSERT INTO web_discovery_leads(id,url,source,snippet,first_seen_at,last_seen_at) VALUES(${id},${`https://example.org/fixture/${index}`},'example.org',${example.text},now(),now())`.execute(
      db,
    );
    await sql`INSERT INTO web_discovery_case_leads(case_id,lead_id) VALUES(${request.runId}::uuid,${id})`.execute(
      db,
    );
  }
  const reviewer = new OpenAILeadReviewProvider(client, model);
  const reviews = new ReviewDiscoveryLeads(
    new PostgresLeadReviewRepository(db, 5, 375_000),
    reviewer,
  );
  for (let step = 0; step < 12; step++) {
    const outcome = await reviews.execute(request);
    console.log(JSON.stringify({ phase: "review", step, outcome }));
    if (outcome === "done" || outcome === "waiting") {
      break;
    }
  }
  const view = await new PostgresWebDiscoveryCatalogRepository(db).read(
    ownerId,
  );
  const provider = new OpenAIIntelligenceProvider(client, model, model);
  const scouting = new ScoutOpportunities(
    new PostgresScoutingRepository(db),
    new EvaluateCandidates(
      new PostgresIntelligenceRepository(db, 5, 375_000),
      provider,
    ),
  );
  for (let step = 0; step < 8; step++) {
    const outcome = await scouting.execute(request);
    console.log(JSON.stringify({ phase: "personal-fit", step, outcome }));
    if (outcome === "done" || outcome === "waiting") {
      break;
    }
  }
  const research = new ResearchAvailability(
    new PostgresAvailabilityRepository(db),
    new PostgresWebAvailabilitySource(db),
  );
  await research.execute();
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
        name: "ScoutAlert local evidence check",
      }),
    );
    submitted = await delivery.execute(new Date());
    assert.equal(
      await delivery.execute(new Date()),
      0,
      "A repeated maintenance pass must not submit a duplicate digest",
    );
  } finally {
    smtp.close();
  }
  const attempts =
    await sql`SELECT state,usage,cost,failure FROM web_lead_review_attempts ORDER BY started_at`.execute(
      db,
    );
  const fitAttempts =
    await sql`SELECT outcome,usage,cost FROM intelligence_attempts ORDER BY started_at`.execute(
      db,
    );
  const budget =
    await sql`SELECT requests,reserved_microusd FROM intelligence_daily_budget`.execute(
      db,
    );
  const deliveries =
    await sql`SELECT status,provider_message_id FROM opportunity_deliveries`.execute(
      db,
    );
  assert.ok((budget.rows[0]?.requests ?? 0) <= 5);
  assert.deepEqual(
    await new PostgresWebDiscoveryCatalogRepository(db).read(randomUUID()),
    { cases: [], leads: [] },
  );
  const excerptChecks = examples.map((example, index) => ({
    expected: example.expected,
    actual:
      view.leads.find((lead) => lead.id === `synthetic-${index}`)?.review
        ?.label ?? null,
  }));
  return {
    checkedAt: new Date().toISOString(),
    configuration: reviewer.configuration,
    captures,
    leads: view.leads,
    excerptChecks,
    opportunities,
    attempts: attempts.rows,
    fitAttempts: fitAttempts.rows,
    budget: budget.rows,
    mailpitSubmissions: submitted,
    deliveries: deliveries.rows,
    realAccountsUsed: 0,
    scopeNote:
      "Two recaptured public pages, four authored excerpt cases and one synthetic broad software-engineering brief. Uses at most five test-budget AI reservations; no Serper calls. SMTP is hard-bound to local Mailpit. This is a bounded integration smoke, not independent relevance/recall evaluation or global-scale evidence.",
  };
});
report.durationMs = Math.round(performance.now() - started);
await writeFile(
  new URL(
    "../../evaluations/discovery/latest-lead-review.json",
    import.meta.url,
  ),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      durationMs: report.durationMs,
      reviews: report.leads.map(({ url, review, postingId }) => ({
        url,
        label: review?.label,
        promoted: !!postingId,
      })),
      excerptChecks: report.excerptChecks,
      matches: report.opportunities.length,
      mailpitSubmissions: report.mailpitSubmissions,
      budget: report.budget,
    },
    null,
    2,
  ),
);
