import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import {
  OpenAIIntelligenceProvider,
  createIntelligenceClient,
  estimateIntelligenceCost,
  normalizeFreelancerProject,
} from "../../packages/adapters/dist/scouting/public.js";
import {
  validAnalysis,
  validFit,
  assessPersonalFit,
} from "../../packages/core/dist/scouting/public.js";

// Explicit paid smoke: at most two calls, 25 seconds each, no retries, public posting + synthetic brief only.
const smoke = JSON.parse(
  await readFile(
    new URL(
      "../../evaluations/marketplace-discovery/latest-smoke.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const id = smoke.selected.id.replace(/^freelancer:/, "");
assert.match(id, /^\d{1,20}$/);
const url = `https://www.freelancer.com/api/projects/0.1/projects/${id}/?full_description=true&job_details=true`;
const response = await fetch(url, {
  redirect: "error",
  signal: AbortSignal.timeout(12000),
});
assert.equal(response.status, 200);
const project = normalizeFreelancerProject((await response.json()).result);
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
assert.ok(process.env.OPENAI_API_KEY);
const model = "gpt-5.4-mini-2026-03-17";
const provider = new OpenAIIntelligenceProvider(
  createIntelligenceClient(process.env.OPENAI_API_KEY),
  model,
  model,
);
const search = {
  goal: "Find client projects and service requests",
  category: "services",
  target: project.title,
  name: "Synthetic public-project evaluation",
  arrangement: "remote",
  arrangementRequired: false,
  residence: "Lagos",
  workLocations: "Worldwide",
  background: "",
  minimumPay: "",
  currency: "USD",
  payPeriod: "project",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
const extraction = await provider.extract(project);
assert.ok(validAnalysis(project, extraction.analysis));
const fit = await provider.assess(project, search, extraction.analysis);
assert.ok(validFit(project, search, fit.fit, extraction.analysis));
const assessment = assessPersonalFit(search, extraction.analysis, fit.fit);
assert.equal(
  fit.fit.criteria.find((item) => item.criterion === "category")?.status,
  "meets",
);
assert.ok(assessment, "Exact-title client request was not accepted for review");
assert.equal(
  assessment.detail.criteria.find((item) => item.criterion === "authorization")
    ?.status,
  "unknown",
);
assert.equal(
  assessment.detail.criteria.find((item) => item.criterion === "experience")
    ?.status,
  "unknown",
);
const usage = [extraction, fit].map((item) => ({
  ...item.usage,
  cost: estimateIntelligenceCost(item.usage),
}));
const report = {
  checkedAt: new Date().toISOString(),
  postingId: project.id,
  sourceUrl: project.url,
  fingerprint: project.fingerprint,
  configuration: provider.configuration,
  modelRequests: 2,
  conservativeReserveUsd: 0.15,
  estimatedUsd:
    usage.reduce((sum, item) => sum + (item.cost?.estimatedMicrousd ?? 0), 0) /
    1_000_000,
  usage,
  assessment,
  scope:
    "One public project and a synthetic exact-title brief; validates structured extraction/category handling and explicit unknowns, not independent relevance or ranking quality.",
};
await writeFile(
  new URL(
    "../../evaluations/marketplace-discovery/latest-fit.json",
    import.meta.url,
  ),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    postingId: project.id,
    modelRequests: 2,
    estimatedUsd: report.estimatedUsd,
    criteria: assessment.detail.criteria.map(({ criterion, status }) => ({
      criterion,
      status,
    })),
  }),
);
