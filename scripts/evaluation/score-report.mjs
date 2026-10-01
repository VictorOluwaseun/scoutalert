import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { validateCorpus } from "./corpus.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { qualityMetrics, rankingMetrics } from "./quality-metrics.mjs";

const corpus = JSON.parse(
  await readFile(
    process.argv[2] ??
      new URL(
        "../../evaluations/opportunity-quality/corpus.json",
        import.meta.url,
      ),
    "utf8",
  ),
);
const report = JSON.parse(
  await readFile(
    process.argv[3] ??
      new URL(
        "../../evaluations/opportunity-quality/latest-report.json",
        import.meta.url,
      ),
    "utf8",
  ),
);
validateCorpus(corpus);
const hash = createHash("sha256")
  .update(
    JSON.stringify({
      postings: corpus.postings,
      documents: corpus.documents,
      briefs: corpus.briefs,
    }),
  )
  .digest("hex");
assert.equal(
  hash,
  corpus.contentHash,
  "Frozen source/brief content changed after capture",
);
assert.equal(
  report.corpusHash,
  hash,
  "Measurements and labels refer to different corpora",
);
assert.equal(
  new Set(corpus.cases.map((item) => item.id)).size,
  corpus.cases.length,
  "Duplicate labels would bias quality metrics",
);
const result = {
  scoredAt: new Date().toISOString(),
  measuredAt: report.measuredAt,
  corpusHash: hash,
  labelHash: createHash("sha256")
    .update(JSON.stringify(corpus.cases))
    .digest("hex"),
  completeMeasurements: report.complete,
  measurementKind: report.kind ?? "model-evaluation",
  modelConfiguration: report.configuration,
  evaluationPolicy: report.evaluationPolicy ?? "supported-criteria-v2",
  metrics: qualityMetrics(corpus.cases, report.results),
  ranking: rankingMetrics(corpus, report.results),
  cohorts: Object.fromEntries(
    corpus.briefs.map((brief) => [
      brief.cohort,
      qualityMetrics(
        corpus.cases.filter((item) => item.briefId === brief.id),
        report.results,
      ),
    ]),
  ),
  limitation:
    "Results describe only this reviewed corpus, not population accuracy or production readiness.",
};
await writeFile(
  process.argv[4] ??
    (process.argv[3]
      ? join(dirname(process.argv[3]), "reviewed-metrics.json")
      : new URL(
          "../../evaluations/opportunity-quality/reviewed-metrics.json",
          import.meta.url,
        )),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result.metrics));
