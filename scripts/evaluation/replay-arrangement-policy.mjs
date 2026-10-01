import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assessPersonalFit,
  rankWithFeedback,
} from "../../packages/core/dist/scouting/public.js";
import { isPromptMatch } from "../../packages/core/dist/notifications/public.js";
import { validateCorpus } from "./corpus.mjs";
import { qualityMetrics, rankingMetrics } from "./quality-metrics.mjs";

const [corpusPath, reportPath] = process.argv.slice(2);
assert.ok(
  corpusPath && reportPath,
  "Pass the frozen corpus and baseline report",
);
const corpus = validateCorpus(JSON.parse(await readFile(corpusPath, "utf8")));
const baseline = JSON.parse(await readFile(reportPath, "utf8"));
assert.equal(baseline.corpusHash, corpus.contentHash);
assert.ok(
  baseline.complete && baseline.configuration.includes("supported-criteria-v2"),
  "This narrow monotonic replay supports the v2 baseline only",
);
const now = new Date(baseline.measuredAt);
const results = baseline.results.map((result) => {
  // The only changed acceptance rule downgrades unsupported arrangement meets; it cannot revive rejected pairs.
  if (!result.assessment) {
    return result;
  }

  const pair = corpus.cases.find((entry) => entry.id === result.id);
  const brief = corpus.briefs.find((entry) => entry.id === pair.briefId);
  const posting = corpus.postings.find((entry) => entry.id === pair.postingId);
  const assessment = assessPersonalFit(brief.search, result.analysis, {
    criteria: result.assessment.detail.criteria,
  });
  const opportunity = {
    ...posting,
    ...assessment,
    checkedAt: now.toISOString(),
    scouts: [brief.search.name],
    availability: {
      status: "available",
      checkedAt: now.toISOString(),
      sourceUrl: posting.url,
      fingerprint: posting.fingerprint,
    },
  };

  return {
    ...result,
    accepted: !!assessment,
    assessment,
    prompt: !!assessment && isPromptMatch(opportunity, brief.search, now),
    ranking: {
      baseline: assessment?.rank ?? 0,
      feedback: assessment
        ? rankWithFeedback(posting, assessment, brief.feedbackHistory ?? [])
            .rank
        : 0,
    },
  };
});
const report = {
  ...baseline,
  kind: "deterministic-policy-replay",
  replayedAt: new Date().toISOString(),
  evaluationPolicy: "supported-criteria-v3",
  baselineReport: reportPath,
  modelConfigurationEvaluated: baseline.configuration,
  scope:
    "Monotonic arrangement-policy replay over frozen v2 model judgments. Rejections cannot become accepted. This is not a full run of the new v7 model prompts; see the separate focused live regression.",
  baselineEstimatedUsd: baseline.estimatedUsd,
  requests: 0,
  providerCalls: 0,
  reservedUsd: 0,
  estimatedUsd: 0,
  unmeasuredAttempts: 0,
  usage: [],
  changedDecisions: results
    .filter(
      (item, index) =>
        item.accepted !== baseline.results[index].accepted ||
        item.prompt !== baseline.results[index].prompt,
    )
    .map((item) => ({
      id: item.id,
      before: baseline.results.find((entry) => entry.id === item.id).accepted,
      after: item.accepted,
    })),
  results,
  metrics: qualityMetrics(corpus.cases, results),
  ranking: rankingMetrics(corpus, results),
  cohorts: Object.fromEntries(
    corpus.briefs.map((brief) => [
      brief.cohort,
      qualityMetrics(
        corpus.cases.filter((entry) => entry.briefId === brief.id),
        results,
      ),
    ]),
  ),
};
const output = join(dirname(reportPath), "policy-replay.json");
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(
  JSON.stringify({
    output,
    changedDecisions: report.changedDecisions,
    providerCalls: 0,
  }),
);
