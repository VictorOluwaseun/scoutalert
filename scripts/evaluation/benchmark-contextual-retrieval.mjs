import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { withEvaluationDatabase, sql } from "./database.mjs";
import { percentile } from "./quality-metrics.mjs";
import { PostgresScoutingRepository } from "../../packages/adapters/dist/scouting/public.js";
import {
  NodeScoutActivationIdentity,
  PostgresScoutActivationUnitOfWork,
} from "../../packages/adapters/dist/onboarding/public.js";
import {
  ActivateScout,
  ReviewSearchDraft,
} from "../../packages/core/dist/onboarding/public.js";

// Fixed local synthetic load, no source network, paid provider or SMTP; the generated schema is removed afterward.
const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.pathname === "/scoutalert_test",
);
const report = {
  kind: "contextual-retrieval-local-microbenchmark",
  recordedAt: new Date().toISOString(),
  postingCount: 50000,
  discoveredCount: 8,
  fixtureBatchSize: 500,
  setupNotes:
    "The first fixture insert attempted all 50,000 rows in one statement and hit the existing 10-second statement timeout before any retrieval was measured. Fixture setup now uses batches of 500; application timeouts are unchanged.",
  runs: [],
  limitations:
    "One synthetic scout, eight manually seeded source-review records and 50,000 synthetic postings in a warm disposable local database. Both modes use the current repository; keyword_only has no admitted discovery IDs. This checks the retrieval handoff, not production capacity, large discovery-history joins, independent relevance, provider work or full pipeline latency.",
};
const search = {
  goal: "Find product design jobs",
  target: "Product designer",
  name: "Synthetic retrieval check",
  category: "employment",
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
await withEvaluationDatabase(async (db) => {
  report.database = (
    await sql`SELECT current_setting('server_version') AS version,current_setting('statement_timeout') AS statement_timeout`.execute(
      db,
    )
  ).rows[0];
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
  ).execute(ownerId, "fixture", {
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
  const runId = randomUUID();
  await sql`INSERT INTO opportunity_sources(id,kind,checked_at) VALUES('retrieval-fixture','job',now())`.execute(
    db,
  );
  for (let start = 1; start <= 50000; start += 500) {
    await sql`INSERT INTO opportunity_postings(id,source_id,external_id,family_id,company,title,location,url,content,fingerprint,version,source_updated_at,checked_at,open,kind)
    SELECT 'posting:'||n,'retrieval-fixture',n::text,'posting:'||n,'Synthetic',
      CASE WHEN n<=8 THEN 'UX interaction specialist' WHEN n%200=0 THEN 'Product designer' ELSE 'Account manager' END,
      'Remote','https://example.org/open/'||n,repeat('Synthetic opening: work with the team to deliver useful outcomes. ',20),'v1',1,now(),now(),true,'job'
    FROM generate_series(${start}::integer,${start + 499}::integer) AS n`.execute(
      db,
    );
  }
  await sql`INSERT INTO web_discovery_cases(id,scout_id,owner_id,scout_version,plan,status,deadline) VALUES(${runId}::uuid,${scout.id}::uuid,${ownerId}::uuid,1,'{}','completed',now())`.execute(
    db,
  );
  await sql`INSERT INTO web_discovery_leads(id,url,source,first_seen_at,last_seen_at,content_status,document,posting_id)
    SELECT 'lead:'||n,'https://example.org/open/'||n,'example.org',now(),now(),'fetched','{"fingerprint":"v1"}','posting:'||n FROM generate_series(1,8) AS n`.execute(
    db,
  );
  await sql`INSERT INTO web_lead_reviews(key,lead_id,configuration,input,state,result,posting_id,posting_version)
    SELECT 'review:'||n,'lead:'||n,'fixture','{"scope":"source","documentFingerprint":"v1"}','ready','{"label":"job_opening"}','posting:'||n,1 FROM generate_series(1,8) AS n`.execute(
    db,
  );
  await sql`UPDATE web_discovery_leads SET review_key='review:'||split_part(id,':',2)`.execute(
    db,
  );
  await sql`INSERT INTO web_discovery_case_leads(case_id,lead_id) SELECT ${runId}::uuid,id FROM web_discovery_leads`.execute(
    db,
  );
  await sql`ANALYZE opportunity_postings; ANALYZE web_discovery_cases; ANALYZE web_discovery_leads; ANALYZE web_discovery_case_leads; ANALYZE web_lead_reviews`.execute(
    db,
  );
  const context = {
    search,
    request: { ownerId, scoutId: scout.id, runId, version: 1 },
  };
  const repository = new PostgresScoutingRepository(db);
  for (const mode of ["keyword_only", "with_discovered"]) {
    const plan =
      mode === "with_discovered"
        ? { exploration: { candidatePolicy: "contextual-v1" } }
        : {};
    await sql`UPDATE web_discovery_cases SET plan=${JSON.stringify(plan)}::jsonb WHERE id=${runId}::uuid`.execute(
      db,
    );
    const warm = await repository.candidates(context);
    assert.equal(warm.length, 200);
    assert.equal(
      warm.filter((p) => p.title === "UX interaction specialist").length,
      mode === "with_discovered" ? 8 : 0,
    );
    for (const concurrency of [4, 8]) {
      const durations = [];
      for (let batch = 0; batch < 10; batch++) {
        durations.push(
          ...(await Promise.all(
            Array.from({ length: concurrency }, async () => {
              const started = performance.now();
              const result = await repository.candidates(context);
              const elapsed = performance.now() - started;
              assert.equal(result.length, 200);
              assert.equal(new Set(result.map((p) => p.id)).size, 200);
              assert.equal(
                result
                  .slice(0, 8)
                  .filter((p) => p.title === "UX interaction specialist")
                  .length,
                mode === "with_discovered" ? 8 : 0,
              );
              return elapsed;
            }),
          )),
        );
      }
      report.runs.push({
        mode,
        concurrency,
        queries: durations.length,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        maximumMs: Math.max(...durations),
      });
    }
  }
});
const output = process.argv
  .find((value) => value.startsWith("--output="))
  ?.slice(9);
if (output) {
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
}
console.log(JSON.stringify(report, null, 2));
