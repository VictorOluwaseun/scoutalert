import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  PostgresSourceRepository,
  PostgresScoutingRepository,
} from "../../packages/adapters/dist/scouting/public.js";
import { withEvaluationDatabase, sql } from "./database.mjs";
import { percentile } from "./quality-metrics.mjs";
import { validateCorpus } from "./corpus.mjs";

const corpusPath =
  process.argv[2] ?? "evaluations/opportunity-quality/corpus.json";
const corpus = validateCorpus(JSON.parse(await readFile(corpusPath, "utf8")));
const sizes = (process.env.SCOUT_BENCH_SIZES ?? "1000,10000")
  .split(",")
  .map(Number);
assert.ok(
  sizes.length <= 4 &&
    sizes.every(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= 50000,
    ),
);
const runs = [];
const failures = [];
const report = {
  measuredAt: new Date().toISOString(),
  corpusHash: corpus.contentHash,
  scope:
    "Local PostgreSQL retrieval microbenchmark; duplicated frozen public text, synthetic identities, warm shared instance. Not population recall, end-to-end alert latency or production capacity evidence.",
  workload: { sizes, concurrency: [4, 8], batchesPerConcurrency: 10 },
  database: null,
  runs,
  failures,
};

/** Preserves completed sizes and safe failure codes so a timeout cannot erase the benchmark evidence. */
async function saveReport() {
  await writeFile(
    process.argv[3] ?? join(dirname(corpusPath), "retrieval-benchmark.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}

for (const count of sizes) {
  let phase = "setup";
  try {
    await withEvaluationDatabase(async (db) => {
      report.database = (
        await sql`SELECT current_setting('server_version') AS version,current_setting('statement_timeout') AS statement_timeout`.execute(
          db,
        )
      ).rows[0];
      const postings = Array.from({ length: count }, (_, index) => {
        const posting = corpus.postings[index % corpus.postings.length];
        const source =
          posting.kind === "client_request"
            ? "benchmark-projects"
            : "benchmark-jobs";

        return {
          ...posting,
          source,
          kind: posting.kind ?? "job",
          id: `${source}:${index}`,
          externalId: String(index),
          familyId: `${source}:${index}`,
        };
      });
      const source = new PostgresSourceRepository(db);
      const start = performance.now();
      phase = "ingestion";

      for (const id of new Set(postings.map((posting) => posting.source))) {
        const entries = postings.filter((posting) => posting.source === id);
        const lease = await source.claim(id, new Date());
        await source.publish(
          {
            source: id,
            kind: entries[0].kind,
            scope: "complete",
            checkedAt: new Date().toISOString(),
            postings: entries,
          },
          lease,
        );
      }

      const ingestionMs = performance.now() - start;
      const totals = (
        await sql`SELECT (SELECT count(*)::int FROM opportunity_postings) AS postings,(SELECT count(*)::int FROM opportunity_evidence) AS evidence`.execute(
          db,
        )
      ).rows[0];
      assert.equal(totals.postings, count);
      assert.equal(totals.evidence, count);
      phase = "retrieval";
      await sql`ANALYZE opportunity_postings`.execute(db);
      const repository = new PostgresScoutingRepository(db);

      for (const concurrency of [4, 8]) {
        const samples = [];
        const began = performance.now();

        for (let batch = 0; batch < 10; batch++) {
          const results = await Promise.all(
            Array.from({ length: concurrency }, async (_, index) => {
              const brief =
                corpus.briefs[
                  (batch * concurrency + index) % corpus.briefs.length
                ];
              const started = performance.now();
              const result = await repository.candidates({
                search: brief.search,
                request: {
                  ownerId: randomUUID(),
                  scoutId: randomUUID(),
                  version: 1,
                  runId: randomUUID(),
                },
              });

              return {
                cohort: brief.cohort,
                category: brief.search.category,
                durationMs: performance.now() - started,
                count: result?.length ?? null,
              };
            }),
          );
          samples.push(...results);
        }

        runs.push({
          status: "completed",
          postingCount: count,
          queries: samples.length,
          concurrency,
          ingestionMs,
          queryElapsedMs: performance.now() - began,
          p50Ms: percentile(
            samples.map((sample) => sample.durationMs),
            0.5,
          ),
          p95Ms: percentile(
            samples.map((sample) => sample.durationMs),
            0.95,
          ),
          maximumCandidates: Math.max(
            ...samples.map((sample) => sample.count ?? 0),
          ),
          unavailableQueries: samples.filter((sample) => sample.count === null)
            .length,
          candidateCap: 200,
          byCategory: Object.fromEntries(
            [...new Set(samples.map((sample) => sample.category))].map(
              (category) => {
                const group = samples.filter(
                  (sample) => sample.category === category,
                );

                return [
                  category,
                  {
                    queries: group.length,
                    p95Ms: percentile(
                      group.map((sample) => sample.durationMs),
                      0.95,
                    ),
                    maximumCandidates: Math.max(
                      ...group.map((sample) => sample.count ?? 0),
                    ),
                  },
                ];
              },
            ),
          ),
        });
      }
    });
  } catch (error) {
    failures.push({
      postingCount: count,
      phase,
      code: error?.code === "57014" ? "statement_timeout" : "benchmark_failed",
    });
  }
  await saveReport();
}

console.log(JSON.stringify(report));
process.exitCode = failures.length ? 1 : 0;
