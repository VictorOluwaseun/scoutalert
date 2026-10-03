import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

/** Reads only recorded synthetic reports; comparison does not call providers or send mail. */
async function report(name) {
  return JSON.parse(
    await readFile(
      new URL(`../../evaluations/discovery/${name}`, import.meta.url),
      "utf8",
    ),
  );
}

/** Reports observed pipeline yield and cost accounting separately from independently judged relevance. */
function metrics(run) {
  const attempts = [
    ...run.reasoning,
    ...run.reviewAttempts,
    ...run.intelligence,
  ];
  return {
    observedAt: run.checkedAt,
    durationMs: run.durationMs,
    searches: run.case.searchesCompleted,
    sourceChecks: run.case.documentsChecked,
    leads: run.case.leadCount,
    recommendations: run.opportunities.length,
    localMailpitSubmissions: run.emailsSent,
    admittedAiAttempts: run.aiBudget.reduce(
      (total, row) => total + row.requests,
      0,
    ),
    recordedModelCalls: attempts.filter(
      (row) => row.usage && row.usage.model !== "no-provider-call",
    ).length,
    attemptsWithoutUsage: attempts.filter((row) => !row.usage).length,
    estimatedRecordedAiMicrousd: attempts.reduce(
      (total, row) => total + (row.cost?.estimatedMicrousd ?? 0),
      0,
    ),
    reservedAiMicrousd: run.aiBudget.reduce(
      (total, row) => total + Number(row.reserved_microusd),
      0,
    ),
    reservedSearchMicrousd: run.usage.reduce(
      (total, row) => total + Number(row.reserved_micros),
      0,
    ),
    independentlyJudgedPrecision: null,
    knownOpportunityRecall: null,
  };
}

const guided = await report("latest-model-guided-discovery.json");
const baseline = await report("paired-baseline-discovery.json");
assert.deepEqual(
  guided.search,
  baseline.search,
  "The paired synthetic brief must be identical.",
);
const comparison = {
  policy: "diagnostic-paired-run-v1",
  brief: guided.search,
  envelope: {
    maximumSearches: 6,
    maximumDocuments: 4,
    maximumAiAttempts: 20,
    maximumAiReservationMicrousd: 1_500_000,
  },
  modelGuided: metrics(guided),
  deterministic: metrics(baseline),
  limitations: [
    "One tuning scenario, successive live runs, no randomized or held-out cohort.",
    "Provider results can change between runs. Different query portfolios are part of the compared policies.",
    "Classifications and personal-fit judgments are model outputs, not independent labels. Missed opportunities and precision remain unmeasured.",
    "Recorded AI estimates exclude attempts without usage and are not invoices; search amounts are configured reservations.",
    "The successful synthetic US brief was chosen after a separate UK case exposed location restrictions; this proves pipeline mechanics, not general relevance.",
    "The model-guided policy reviews captured sources during discovery. Historical deterministic cases also review excerpts afterward; this scheduling change is part of the comparison.",
  ],
};
await writeFile(
  new URL(
    "../../evaluations/discovery/planning-comparison.json",
    import.meta.url,
  ),
  JSON.stringify(comparison, null, 2) + "\n",
);
console.log(JSON.stringify(comparison, null, 2));
