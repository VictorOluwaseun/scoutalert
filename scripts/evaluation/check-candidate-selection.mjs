import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import {
  planDiscovery,
  explorationChoices,
  PlanScoutSearch,
  validReasoning,
} from "../../packages/core/dist/discovery/public.js";
import { OpenAIDiscoveryReasoningProvider } from "../../packages/adapters/dist/discovery/public.js";
import {
  createIntelligenceClient,
  estimateIntelligenceCost,
} from "../../packages/adapters/dist/scouting/public.js";

// Standalone development evaluation: at most twelve model calls/$0.90 conservative reservation.
// Uses captured public text and fictional goals. No application database, search, SMTP or private account is accessed.
const live = process.argv.includes("--live");
const suppliedCorpus = process.argv
  .find((value) => value.startsWith("--corpus="))
  ?.slice(9);
const corpusText = await readFile(
  suppliedCorpus ??
    new URL(
      "../../evaluations/discovery/candidate-selection-cases.json",
      import.meta.url,
    ),
  "utf8",
);
const corpus = JSON.parse(corpusText);
assert.equal(corpus.cases.length, 6);
const usage = [];
let provider = null;
if (live) {
  loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
  const model =
    process.env.SCOUT_AI_EXTRACTION_MODEL ?? "gpt-5.4-mini-2026-03-17";
  assert.match(
    model,
    /^gpt-5\.4-mini(?:-2026-03-17)?$/,
    "This bounded diagnostic is priced for the existing mini model only",
  );
  provider = new OpenAIDiscoveryReasoningProvider(
    createIntelligenceClient(process.env.OPENAI_API_KEY),
    model,
  );
}

/** Freezes the same public target and observations for both candidate policies; no selection gets new provider results. */
function snapshot(entry, contextual) {
  const plan = planDiscovery(
    { target: entry.target, category: entry.category, arrangement: "remote" },
    1,
    4,
    undefined,
    true,
  );
  return {
    plan: {
      ...plan,
      policy: "public-intent-v3",
      strategy: {
        targets: [entry.target],
        explanation: "Original public goal.",
      },
      exploration: {
        ...plan.exploration,
        ...(contextual ? { candidatePolicy: "contextual-v1" } : {}),
      },
    },
    round: 0,
    operations: [
      {
        key: "search",
        depth: 0,
        input: { kind: "search", query: plan.queries[0] },
        result: {
          kind: "search",
          observations: entry.observations,
          checkedAt: "2026-10-10T00:00:00Z",
          completeness: "window",
          nextPage: null,
        },
      },
    ],
  };
}

/** Captures the production planner's exact public input while preventing database and implicit provider access. */
async function inputFor(state) {
  let captured = null;
  const records = {
    /** Records the input then models unavailable admission; the standalone caller alone may spend its explicit allowance. */
    async claim(_request, _phase, _config, input) {
      captured = input;
      return { status: "unavailable" };
    },
    /** This adapter cannot write application state. */
    async complete() {
      throw new Error("unexpected_completion");
    },
    /** No implicit provider call is permitted. */
    async fail() {
      throw new Error("unexpected_failure");
    },
  };
  const unavailable = {
    configuration: "input-inspection",
    /** Producing a model input must not incur provider usage. */
    async reason() {
      throw new Error("unexpected_model_call");
    },
  };
  await new PlanScoutSearch(records, unavailable).next(
    { runId: "fixture", ownerId: "fixture", scoutId: "fixture", version: 1 },
    state,
  );
  return captured;
}

/** Runs a single bounded decision; traces contain public choices and model usage, never credentials. */
async function evaluate(entry, contextual) {
  const state = snapshot(entry, contextual);
  const choices = explorationChoices(state);
  const input = await inputFor(state);
  const offered = entry.expectedUrl
    ? choices.some(
        (choice) =>
          choice.action?.kind === "document" &&
          choice.action.url === entry.expectedUrl,
      )
    : null;
  const started = performance.now();
  let selected = choices.length === 1 ? choices[0] : null;
  let explanation = null;
  if (provider && input) {
    assert.ok(usage.length < 12);
    const response = await provider.reason(input);
    usage.push(response.usage);
    assert.ok(validReasoning(input, response.output));
    selected = choices[response.output.index];
    explanation = response.output.explanation;
  }
  const selectedUrl =
    selected?.action?.kind === "document" ? selected.action.url : null;
  return {
    offered,
    choices: choices.length,
    documentChoices: choices.filter(
      (choice) => choice.action?.kind === "document",
    ).length,
    inputBytes: input ? Buffer.byteLength(JSON.stringify(input)) : 0,
    selected: selected?.action ?? null,
    explanation,
    passed: live
      ? entry.expectedUrl
        ? selectedUrl === entry.expectedUrl
        : selectedUrl === null
      : null,
    latencyMs: Math.round(performance.now() - started),
  };
}
const results = [];
for (const entry of corpus.cases) {
  results.push({
    id: entry.id,
    provenance: entry.provenance,
    baseline: await evaluate(entry, false),
    contextual: await evaluate(entry, true),
  });
}
const positive = results.filter((item) => item.baseline.offered !== null);
const report = {
  kind: "paired-candidate-selection-development-regression",
  recordedAt: new Date().toISOString(),
  corpusHash: createHash("sha256").update(corpusText).digest("hex"),
  configuration: provider?.configuration ?? null,
  corpus:
    suppliedCorpus ?? "evaluations/discovery/candidate-selection-cases.json",
  eligibleExamples: positive.length,
  baselineOffered: positive.filter((item) => item.baseline.offered).length,
  contextualOffered: positive.filter((item) => item.contextual.offered).length,
  baselineSelectionsPassed: live
    ? results.filter((item) => item.baseline.passed).length
    : null,
  contextualSelectionsPassed: live
    ? results.filter((item) => item.contextual.passed).length
    : null,
  providerCalls: usage.length,
  maximumReservedUsd: 0.9,
  estimatedUsd: live
    ? usage.reduce(
        (sum, item) =>
          sum + (estimateIntelligenceCost(item)?.estimatedMicrousd ?? 0),
        0,
      ) / 1_000_000
    : null,
  usage,
  results,
  limitations:
    "Six development cases; each records its provenance. Both routing menus use the same current model prompt and current query templates. Expected routes are implementation-authored, not independent human labels. This measures shortlist inclusion and single-step routing, not discovery recall, personal fit, whole-internet coverage, delivery or global scale. Live model calls are bounded separately from the worker ledger; the production planner retains its shared admission policy.",
};
const output = process.argv
  .find((value) => value.startsWith("--output="))
  ?.slice(9);
if (output) {
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
}
console.log(JSON.stringify(report, null, 2));
if (live && results.some((item) => !item.contextual.passed)) {
  process.exitCode = 1;
}
