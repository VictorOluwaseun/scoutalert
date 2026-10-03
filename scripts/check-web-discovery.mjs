import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { withEvaluationDatabase, sql } from "./evaluation/database.mjs";
import {
  ActivateScout,
  ReviewSearchDraft,
} from "../packages/core/dist/onboarding/public.js";
import { planDiscovery } from "../packages/core/dist/discovery/public.js";
import {
  NodeScoutActivationIdentity,
  PostgresScoutActivationUnitOfWork,
} from "../packages/adapters/dist/onboarding/public.js";
import {
  SerperSearchProvider,
  PublicSourceDocumentRepository,
  PostgresWebDiscoveryRepository,
  PostgresWebDiscoveryCatalogRepository,
} from "../packages/adapters/dist/discovery/public.js";

// Explicit live check: one paid search plus at most one public document operation.
// The disposable test schema uses the production admission repository; no real accounts, models or email are involved.
loadEnvFile(new URL("../apps/worker/.env", import.meta.url));
assert.ok(
  process.env.SERPER_API_KEY?.trim(),
  "Configure SERPER_API_KEY locally before this live check",
);
const reservation = Math.ceil(
  Number(process.env.SCOUT_WEB_REQUEST_USD ?? 0.01) * 1_000_000,
);
assert.ok(
  Number.isSafeInteger(reservation) &&
    reservation > 0 &&
    reservation <= 1_000_000,
);
const provider = new SerperSearchProvider(process.env.SERPER_API_KEY, {
  language: process.env.SCOUT_WEB_LANGUAGE ?? "en",
  country: process.env.SCOUT_WEB_COUNTRY ?? "us",
  requestCostMicros: reservation,
});
const documents = new PublicSourceDocumentRepository();
const limits = {
  dailySearchRequests: 1,
  dailySearchMicros: reservation,
  dailyDocumentRequests: 1,
  maximumConcurrentSearches: 1,
  maximumDocuments: 1,
};
const search = {
  goal: "Find remote product design jobs",
  category: "employment",
  target: "Product designer",
  name: "Synthetic web discovery check",
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
  const records = new PostgresWebDiscoveryRepository(db);
  const plan = planDiscovery(search, 1, 1, provider.capability);
  plan.queries = plan.queries.slice(0, 1);
  await records.open(request, plan, provider.capability);
  const calls = { search: 0, document: 0 };
  const observations = [];
  let document = null;

  for (let step = 0; step < 10; step++) {
    const claim = await records.claim(request, limits);

    if (claim.status === "done") {
      break;
    }
    if (claim.status !== "claimed") {
      continue;
    }

    calls[claim.operation.kind] += 1;
    assert.ok(
      calls[claim.operation.kind] <= 1,
      "The smoke check must not repeat an external operation",
    );

    try {
      const result =
        claim.operation.kind === "search"
          ? await provider.search(claim.operation.query)
          : await documents.read(claim.operation.url);
      await records.complete(claim.key, claim.token, result);

      if (result.kind === "search") {
        observations.push(
          ...result.observations.map(({ url, rank }) => ({ url, rank })),
        );
      }
      if (result.kind === "document") {
        document = {
          url: result.url,
          status: result.status,
          reason: result.reason,
          textCharacters: result.text?.length ?? 0,
          formalPosting: Boolean(result.posting),
        };
      }
    } catch {
      await records.fail(claim.key, claim.token);
      throw new Error(
        "Live web discovery failed; no automatic paid retry was attempted",
      );
    }
  }

  const catalog = new PostgresWebDiscoveryCatalogRepository(db);
  const view = await catalog.read(ownerId);
  const usage =
    await sql`SELECT provider,requests,reserved_micros FROM web_discovery_usage ORDER BY provider`.execute(
      db,
    );
  assert.equal(calls.search, 1);
  assert.ok(
    observations.length > 0,
    "The selected query returned no search observations",
  );
  assert.ok(view.leads.length > 0, "No usable public lead was persisted");
  assert.equal(view.cases[0].searchesCompleted, 1);
  assert.ok(["completed", "partial"].includes(view.cases[0].status));
  assert.deepEqual(await catalog.read(randomUUID()), { cases: [], leads: [] });
  assert.equal(
    await records.claim(request, limits).then((claim) => claim.status),
    "done",
  );
  const ledger = usage.rows.find((row) => row.provider === "serper");
  assert.equal(ledger.requests, 1);
  assert.equal(Number(ledger.reserved_micros), reservation);

  return {
    checkedAt: new Date().toISOString(),
    status: "passed",
    provider: provider.capability,
    query: plan.queries[0],
    calls,
    observations,
    document,
    caseStatus: view.cases[0].status,
    persistedLeads: view.leads.length,
    usage: usage.rows,
    checks: [
      "live Serper response contract",
      "durable admission before network",
      "public lead persistence",
      "owner isolation",
      "completed case replay without another paid request",
    ],
    emailsSent: 0,
    modelRequests: 0,
    realAccountsUsed: 0,
    scopeNote:
      "One synthetic public query with at most one source document check. Admission reservations are not reconciled provider charges. This checks connectivity and persistence, not discovery recall, relevance, native social access or eligible delivery.",
  };
});
report.durationMs = Math.round(performance.now() - started);
await writeFile(
  new URL("../evaluations/discovery/latest-serper-smoke.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
