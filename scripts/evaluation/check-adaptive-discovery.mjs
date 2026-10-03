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
} from "../../packages/core/dist/discovery/public.js";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "../../packages/adapters/dist/onboarding/public.js";
import {
  PublicSourceDocumentRepository,
  SerperSearchProvider,
  PostgresWebDiscoveryRepository,
  PostgresWebDiscoveryCatalogRepository,
  PostgresLeadReviewRepository,
  OpenAILeadReviewProvider,
} from "../../packages/adapters/dist/discovery/public.js";
import { createIntelligenceClient } from "../../packages/adapters/dist/scouting/public.js";

// Explicit paid smoke: at most six searches ($0.06 reservation), four documents and four AI calls ($0.30 reservation).
// Uses a disposable schema and a synthetic public brief. No real account data or email delivery is involved.
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
assert.ok(
  process.env.SERPER_API_KEY && process.env.OPENAI_API_KEY,
  "Configure local search and AI keys first",
);
const started = performance.now();
const search = {
  goal: "Find remote product design jobs",
  category: "employment",
  target: "Product designer",
  name: "Synthetic adaptive discovery",
  arrangement: "remote",
  arrangementRequired: true,
  residence: "Lagos",
  workLocations: "Remote worldwide",
  background: "Synthetic design experience",
  minimumPay: "",
  currency: "USD",
  payPeriod: "year",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
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
    version: 1,
    runId: randomUUID(),
  };
  const discovery = new DiscoverWeb(
    new PostgresWebDiscoveryRepository(db),
    new PublicSourceDocumentRepository(),
    provider,
    limits,
  );
  for (let step = 0; step < 64; step++) {
    const state = await discovery.execute(request);
    if (state === "done") {
      break;
    }
    if (state === "waiting") {
      await delay(2100);
    }
  }
  const model = new OpenAILeadReviewProvider(
    createIntelligenceClient(process.env.OPENAI_API_KEY),
    "gpt-5.4-mini-2026-03-17",
  );
  const reviews = new ReviewDiscoveryLeads(
    new PostgresLeadReviewRepository(db, 4, 300_000),
    model,
  );
  for (let step = 0; step < 16; step++) {
    const state = await reviews.execute(request);
    if (state === "done") {
      break;
    }
    if (state === "waiting") {
      await delay(1000);
    }
  }
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
    await sql`SELECT o.key,o.kind,o.input,o.state,o.failure,s.depth,o.result->'links' AS links,o.result->>'status' AS source_status,o.result->>'reason' AS source_reason,jsonb_array_length(coalesce(o.result->'links','[]'::jsonb)) AS observed_links FROM web_discovery_steps s JOIN web_discovery_operations o ON o.key=s.operation_key WHERE s.case_id=${request.runId}::uuid ORDER BY s.position`.execute(
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
  assert.ok(
    view.leads.some((lead) => lead.review),
    "No AI evidence review completed",
  );
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
    status: "passed",
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
    emailsSent: 0,
    realAccountsUsed: 0,
    scopeNote:
      "One live synthetic case using heuristic adaptive routing and AI evidence review. Labels are model judgments, not independent ground truth. No completeness, multilingual recall, private-fit, native social access or global throughput claim.",
  };
});
await writeFile(
  new URL(
    "../../evaluations/discovery/latest-adaptive-discovery.json",
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
      usage: report.usage,
      aiBudget: report.aiBudget,
      decisions: report.decisions,
      report: "evaluations/discovery/latest-adaptive-discovery.json",
    },
    null,
    2,
  ),
);
