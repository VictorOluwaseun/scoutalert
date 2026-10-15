import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
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
  DiscoverWeb,
  PlanScoutSearch,
  ReviewDiscoveryLeads,
} from "../../packages/core/dist/discovery/public.js";
import {
  PublicHttpRepository,
  PublicSourceDocumentRepository,
  PostgresWebDiscoveryRepository,
  PostgresDiscoveryReasoningRepository,
  PostgresLeadReviewRepository,
  PostgresWebAvailabilitySource,
} from "../../packages/adapters/dist/discovery/public.js";
import {
  ScoutOpportunities,
  EvaluateCandidates,
  ResearchAvailability,
  factNames,
  criterionNames,
} from "../../packages/core/dist/scouting/public.js";
import {
  PostgresScoutingRepository,
  PostgresIntelligenceRepository,
  PostgresOpportunityCatalogRepository,
  PostgresAvailabilityRepository,
} from "../../packages/adapters/dist/scouting/public.js";
import { DeliverOpportunityDigests } from "../../packages/core/dist/notifications/public.js";
import {
  PostgresOpportunityDeliveryRepository,
  createSmtpClient,
  SmtpEmailProvider,
} from "../../packages/adapters/dist/notifications/public.js";

const [output] = process.argv.slice(2);
assert.ok(output, "Supply a new output path");
const planningUnavailable = process.argv.includes("--planning-unavailable");
const usage = {
  model: "authored-fixture",
  inputTokens: 0,
  outputTokens: 0,
  durationMs: 0,
  responseId: "fixture",
};
const reports = [];

/** Exercises real admission, parsing, persistence, fit policy, availability and local delivery with explicitly authored search/model fixtures. */
async function scenario(kind, target, title, requirements) {
  return withEvaluationDatabase(async (db) => {
    const ownerId = randomUUID();
    const email = `${ownerId}@scoutalert.test`;
    await db
      .insertInto("users")
      .values({ id: ownerId, email, verified_at: new Date() })
      .execute();
    const search = {
      goal: `Find ${target} client work`,
      category: "services",
      target,
      name: `Fixture ${kind}`,
      arrangement: "remote",
      arrangementRequired: true,
      residence: "United States",
      workLocations: "Worldwide",
      background: requirements,
      minimumPay: "",
      currency: "USD",
      payPeriod: "project",
      unknownEligibility: "review",
      undisclosedPay: "include",
    };
    const scout = await new ActivateScout(
      new ReviewSearchDraft(),
      new PostgresScoutActivationUnitOfWork(db),
      new NodeScoutActivationIdentity(),
      () => new Date(),
    ).execute(ownerId, "fixture", {
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
    const urls = ["remote", "onsite", "seller"].map(
      (name) =>
        `https://www.freelancer.com/projects/web-design/${kind}-${name}`,
    );
    const pages = new Map(
      urls.map((url, index) => [
        url,
        buyerHtml(url, title, requirements, index),
      ]),
    );
    const http = new FixtureHttp(pages);
    const documents = new PublicSourceDocumentRepository(http);
    const provider = {
      capability: {
        id: "authored-search",
        configuration: "fixture-v1",
        access: "public_index",
        language: "en",
        country: "us",
        requestCostMicros: 0,
      },
      /** Returns only declared fixture observations; no live discovery or recall is claimed. */
      async search() {
        return {
          kind: "search",
          checkedAt: new Date().toISOString(),
          observations: urls.map((url, index) => ({
            url,
            title,
            snippet: `We need ${requirements}. Project budget INR 5000.`,
            rank: index + 1,
          })),
        };
      },
    };
    const planner = new PlanScoutSearch(
      new PostgresDiscoveryReasoningRepository(db, 36, 2_700_000),
      {
        configuration: "authored-planner-v1",
        /** Selects observed fixture pages only, leaving core admission and stopping limits in control. */
        async reason(input) {
          if (planningUnavailable) {
            throw new Error("authored_provider_unavailable");
          }
          return {
            output:
              input.kind === "strategy"
                ? {
                    kind: "strategy",
                    strategy: {
                      targets: [target],
                      explanation: "Keep the supplied fixture target.",
                    },
                  }
                : {
                    kind: "choice",
                    index: Math.max(
                      0,
                      input.choices.findIndex(
                        (choice) =>
                          choice.action?.kind === "document" &&
                          urls.includes(choice.action.url),
                      ),
                    ),
                    explanation: "Inspect a declared fixture page.",
                  },
            usage,
          };
        },
      },
    );
    const reviews = new ReviewDiscoveryLeads(
      new PostgresLeadReviewRepository(db, 36, 2_700_000),
      {
        configuration: "authored-review-v1",
        /** Supplies cited fixture verdicts to test the pipeline, not the quality of a live model. */
        async review(inputs) {
          return {
            usage,
            reviews: inputs.map((input) => ({
              id: input.id,
              review: fixtureReview(input, title),
            })),
          };
        },
      },
    );
    const records = new PostgresWebDiscoveryRepository(db);
    const discovery = new DiscoverWeb(
      records,
      documents,
      provider,
      {
        dailySearchRequests: 6,
        dailySearchMicros: 60_000,
        dailyDocumentRequests: 6,
        maximumConcurrentSearches: 1,
        maximumDocuments: 6,
        exploration: {
          maximumDepth: 3,
          maximumRounds: 8,
          maximumSourcePages: 2,
        },
      },
      planner,
      reviews,
    );
    let state;
    for (let step = 0; step < 90; step++) {
      state = await discovery.execute(request);
      if (state === "done") {
        break;
      }
      // Advance only this disposable fixture's host clock; no real source is contacted.
      await sql`UPDATE web_discovery_hosts SET next_allowed_at=now()`.execute(
        db,
      );
    }
    assert.equal(state, "done");
    const evaluator = new EvaluateCandidates(
      new PostgresIntelligenceRepository(db, 36, 2_700_000),
      {
        configuration: "authored-fit-v1",
        /** Source review must provide extraction; duplicate extraction is a pipeline regression. */
        async extract() {
          throw new Error("unexpected_duplicate_extraction");
        },
        /** Deliberately proposes an unsupported pay conflict and remote match; deterministic policies must correct both. */
        async assess(posting, brief) {
          return {
            kind: "fit",
            usage,
            fit: {
              criteria: criterionNames.map((criterion) => ({
                criterion,
                status:
                  criterion === "compensation"
                    ? "conflicts"
                    : ["role", "category", "arrangement"].includes(criterion)
                      ? "meets"
                      : "unknown",
                explanation: "Authored fixture comparison",
                quotes: [posting.text],
                briefQuotes: [brief.target],
              })),
            },
          };
        },
      },
    );
    const matching = new ScoutOpportunities(
      new PostgresScoutingRepository(db),
      evaluator,
    );
    for (let step = 0; step < 24; step++) {
      state = await matching.execute(request);
      if (state === "done") {
        break;
      }
    }
    assert.equal(state, "done");
    await new ResearchAvailability(
      new PostgresAvailabilityRepository(db),
      new PostgresWebAvailabilitySource(db),
    ).execute();
    const catalog = new PostgresOpportunityCatalogRepository(db);
    const opportunities = await catalog.list(ownerId);
    assert.deepEqual(
      opportunities.map((item) => item.url),
      [urls[0]],
    );
    assert.equal(
      opportunities[0].detail.criteria.find(
        (item) => item.criterion === "compensation",
      ).status,
      "unknown",
    );
    assert.deepEqual(await catalog.list(randomUUID()), []);
    const smtp = createSmtpClient({
      host: "127.0.0.1",
      port: 1025,
      secure: false,
    });
    let sent;
    let repeated;
    try {
      const delivery = new DeliverOpportunityDigests(
        new PostgresOpportunityDeliveryRepository(db),
        new SmtpEmailProvider(smtp, {
          address: "scout@scoutalert.test",
          name: "ScoutAlert fixture",
        }),
      );
      sent = await delivery.execute(new Date());
      repeated = await delivery.execute(new Date());
      assert.equal(sent, 1);
      assert.equal(repeated, 0);
    } finally {
      smtp.close();
    }
    const attempts =
      await sql`SELECT count(*)::integer AS count FROM web_discovery_operations`.execute(
        db,
      );
    assert.equal(await discovery.execute(request), "done");
    assert.deepEqual(
      (
        await sql`SELECT count(*)::integer AS count FROM web_discovery_operations`.execute(
          db,
        )
      ).rows,
      attempts.rows,
    );
    return {
      scenario: kind,
      search,
      syntheticRecipient: email,
      capturedPages: http.requested.filter(
        (url) => !url.endsWith("/robots.txt"),
      ),
      recommendations: opportunities.map((item) => ({
        title: item.title,
        url: item.url,
      })),
      excluded: { onsite: urls[1], seller: urls[2] },
      emailsSent: sent,
      duplicateEmails: repeated,
      operations: attempts.rows[0].count,
      queryPolicy: (await records.preparedPlan(request)).exploration
        .queryPolicy,
      planningUnavailable,
    };
  });
}

/** Serves fixed public HTML/robots responses through the actual parser without external HTTP access. */
class FixtureHttp extends PublicHttpRepository {
  requested = [];
  /** Binds this isolated scenario's explicit source bodies. */
  constructor(pages) {
    super();
    this.pages = pages;
  }
  /** Enforces requested destination and byte ceilings even for fixture bodies. */
  async read(url, maximum, signal) {
    signal.throwIfAborted();
    this.requested.push(url);
    if (url.endsWith("/robots.txt")) {
      return { status: 404, contentType: "text/plain", body: "" };
    }
    assert.ok(this.pages.has(url), "Unexpected fixture source");
    const body = this.pages.get(url);
    assert.ok(Buffer.byteLength(body) <= maximum);
    return { status: 200, contentType: "text/html", body };
  }
}

/** Uses the recognized public buyer layout; misleading bidder text must never enter the primary capture. */
function buyerHtml(url, title, requirements, index) {
  return `<html><head><link rel="canonical" href="${url}"></head><body><app-project-view-logged-out-main><div class="Project-heading"><h1>${title}</h1><p>Open</p><p>INR 5000</p></div><p class="Project-description">${index === 2 ? "I offer my services" : "We need help"}: ${requirements}. Send a proposal for this client project.</p><p>Project ID: ${123456 + index}</p><app-project-view-logged-out-about><p>Open for bidding</p><p>${index === 1 ? "Onsite project" : "Remote project"}</p></app-project-view-logged-out-about><app-project-view-logged-out-bid-list>All buyers allow remote work. USD 9000.</app-project-view-logged-out-bid-list></app-project-view-logged-out-main></body></html>`;
}

/** Produces source-cited fixtures with a deliberate employment mislabel; parser-confirmed buyer provenance must correct it while retaining seller rejection. */
function fixtureReview(input, title) {
  const unknown = { status: "unknown", value: "", quotes: [] };
  const facts = Object.fromEntries(
    factNames.map((name) => [name, { ...unknown }]),
  );
  const analysis = {
    facts,
    pay: { minimum: null, maximum: null, currency: null, period: null },
  };
  const review = {
    label: input.text.includes("I offer my services")
      ? "service_offer"
      : "job_opening",
    explanation: "Authored source classification",
    quotes: [input.text],
    company: unknown,
    deadline: unknown,
    application: unknown,
    analysis,
  };
  if (input.scope !== "source") {
    return review;
  }
  review.application = {
    status: "stated",
    value: "Send a proposal",
    quotes: [input.text],
  };
  facts.role = { status: "stated", value: title, quotes: [input.text] };
  facts.category = {
    status: "stated",
    value: "contract",
    quotes: [input.text],
  };
  facts.arrangement = {
    status: "stated",
    value: input.text.includes("Onsite project") ? "onsite" : "remote",
    quotes: [input.text],
  };
  return review;
}

reports.push(
  await scenario(
    "projects",
    "React TypeScript web development",
    "React dashboard",
    "React and TypeScript dashboards with API integrations",
  ),
);
reports.push(
  await scenario(
    "services",
    "Website redesign",
    "Website redesign",
    "WordPress website redesign and accessible responsive layouts",
  ),
);
const report = {
  checkedAt: new Date().toISOString(),
  scope:
    "Authored search, HTTP and model fixtures through real use cases, source parser, isolated PostgreSQL and local Mailpit. No live provider calls, organic usefulness or recall measurement. No real accounts used.",
  reports,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(report, null, 2));
