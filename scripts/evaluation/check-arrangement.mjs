import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { dirname, join } from "node:path";
import {
  OpenAIIntelligenceProvider,
  createIntelligenceClient,
  estimateIntelligenceCost,
} from "../../packages/adapters/dist/scouting/public.js";
import {
  validAnalysis,
  validFit,
  assessPersonalFit,
} from "../../packages/core/dist/scouting/public.js";
import { validateCorpus } from "./corpus.mjs";

const corpusPath = process.argv[2];
const corpus = validateCorpus(JSON.parse(await readFile(corpusPath, "utf8")));
const project = corpus.postings.find(
  (posting) => posting.id === "freelancer:40742146",
);
const strict = corpus.briefs.find((brief) => brief.id === "contract-us").search;
assert.ok(
  project,
  "Use the captured regression posting; never substitute a current live request",
);
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const model = "gpt-5.4-mini-2026-03-17";
const provider = new OpenAIIntelligenceProvider(
  createIntelligenceClient(process.env.OPENAI_API_KEY),
  model,
  model,
);
const usage = [];
const extraction = await provider.extract(project);
usage.push(extraction.usage);
assert.ok(validAnalysis(project, extraction.analysis));
const fit = await provider.assess(project, strict, extraction.analysis);
usage.push(fit.usage);
assert.ok(validFit(project, strict, fit.fit, extraction.analysis));
const result = assessPersonalFit(strict, extraction.analysis, fit.fit);
const arrangement = fit.fit.criteria.find(
  (item) => item.criterion === "arrangement",
);
const passed = result === null && arrangement.status !== "meets";
const report = {
  measuredAt: new Date().toISOString(),
  kind: "implementation-authored-regression",
  corpusHash: corpus.contentHash,
  postingId: project.id,
  configuration: provider.configuration,
  providerCalls: 2,
  maxReservedUsd: 0.15,
  estimatedUsd:
    usage.reduce(
      (sum, item) =>
        sum + (estimateIntelligenceCost(item)?.estimatedMicrousd ?? 0),
      0,
    ) / 1_000_000,
  usage,
  passed,
  arrangementFact: extraction.analysis.facts.arrangement,
  arrangementCriterion: arrangement,
  accepted: result !== null,
  scope:
    "Captured public hourly project and synthetic remote-mandatory brief. Tests that engagement type is not work-location evidence; not independent human relevance labeling.",
};
await writeFile(
  join(dirname(corpusPath), "arrangement-regression.json"),
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    passed,
    providerCalls: 2,
    estimatedUsd: report.estimatedUsd,
    arrangement: arrangement.status,
    accepted: result !== null,
  }),
);
assert.ok(passed, "Hourly terms cannot satisfy a mandatory remote arrangement");
