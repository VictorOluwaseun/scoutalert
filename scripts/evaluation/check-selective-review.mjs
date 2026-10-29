import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { withEvaluationDatabase } from "./database.mjs";
import { withSharedModelTokenBudget } from "./shared-token-budget.mjs";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";
import {
  createIntelligenceClient,
  OpenAIFitReviewProvider,
} from "../../packages/adapters/dist/scouting/public.js";
import {
  factNames,
  criterionNames,
  fitReviewRequest,
  validReviewedFit,
  assessPersonalFit,
} from "../../packages/core/dist/scouting/public.js";

// Three authored source/baseline cases, at most three expert generations. No search, email or mini generations.
// This is a live expert/policy smoke check, not a mini-versus-full benchmark or fresh discovery test.
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const output = process.argv[2];
assert.ok(output, "Provide a new receipt path");

/** Produces small, independently expected restrictions and deliberately imperfect baseline proposals. */
function fixture(name, country, remote) {
  const search = {
    goal: "Find website redesign projects",
    target: "React TypeScript website redesign",
    name: "Synthetic expert review",
    category: "services",
    arrangement: "remote",
    arrangementRequired: true,
    residence: "Nigeria",
    workLocations: "Nigeria",
    background: "5 years building React and TypeScript websites",
    minimumPay: "",
    currency: "USD",
    payPeriod: "project",
    unknownEligibility: "review",
    undisclosedPay: "include",
  };
  const condition = remote
    ? `Contractors must reside in ${country}.`
    : "Open to contractors in Nigeria.";
  const text = `We need a React TypeScript website redesign delivered as a fixed-price project.\n${remote ? "All work is fully remote.\n" : ""}${condition}\nAt least 3 years building React and TypeScript websites is required.\nBudget and payment terms will be agreed before work starts.`;
  const posting = {
    id: `expert-smoke:${name}`,
    source: "expert-smoke",
    externalId: name,
    familyId: name,
    kind: "client_request",
    company: "Synthetic buyer",
    title: "React TypeScript website redesign",
    location: country,
    url: `https://example.org/requests/${name}`,
    text,
    sourceUpdatedAt: new Date().toISOString(),
    fingerprint: name,
    version: 1,
  };
  const values = {
    role: search.target,
    arrangement: remote ? "remote" : "",
    category: "services",
    location: country,
    requirements: "3 years building React and TypeScript websites",
  };
  const analysis = {
    facts: Object.fromEntries(
      factNames.map((name) => [
        name,
        values[name]
          ? { status: "stated", value: values[name], quotes: [text] }
          : { status: "unknown", value: "", quotes: [] },
      ]),
    ),
    pay: { minimum: null, maximum: null, currency: null, period: null },
  };
  const baseline = {
    criteria: criterionNames.map((criterion) => ({
      criterion,
      status:
        criterion === "role" && name === "eligible-contractor"
          ? "conflicts"
          : "meets",
      explanation:
        "Authored baseline for a bounded correction check; not a real mini output.",
      quotes: [text],
      briefQuotes: [search.target],
    })),
  };
  return {
    name,
    search,
    posting,
    analysis,
    request: fitReviewRequest(
      posting,
      analysis,
      baseline,
      remote ? "conditional_requirements" : "sample_audit",
    ),
  };
}

const report = await withEvaluationDatabase(
  withSharedModelTokenBudget(async (_db, budget) => {
    const config = readWorkerConfiguration();
    assert.equal(config.SCOUT_AI_EXPERT_ENABLED, "true");
    const provider = new OpenAIFitReviewProvider(
      createIntelligenceClient(config.OPENAI_API_KEY, budget),
      config.SCOUT_AI_EXPERT_MODEL,
    );
    const scenarios = [
      fixture("restricted-contractor", "Canada", true),
      fixture("eligible-contractor", "Nigeria", true),
      fixture("unstated-remote", "Nigeria", false),
    ];
    const cases = [];
    for (const scenario of scenarios) {
      try {
        const result = await provider.review(
          scenario.search,
          scenario.analysis,
          scenario.request,
        );
        const valid = validReviewedFit(
          scenario.posting,
          scenario.search,
          scenario.analysis,
          scenario.request,
          result.fit,
        );
        const criteria = Object.fromEntries(
          result.fit.criteria.map((item) => [item.criterion, item.status]),
        );
        const accepted =
          valid &&
          assessPersonalFit(scenario.search, scenario.analysis, result.fit) !==
            null;
        const passed =
          valid &&
          (scenario.name === "restricted-contractor"
            ? criteria.location === "conflicts" && !accepted
            : scenario.name === "eligible-contractor"
              ? criteria.location === "meets" && accepted
              : criteria.arrangement === "unknown" && !accepted);
        cases.push({
          name: scenario.name,
          reason: scenario.request.reason,
          passed,
          valid,
          accepted,
          criteria,
          fit: result.fit,
          usage: result.usage,
        });
      } catch (error) {
        cases.push({
          name: scenario.name,
          passed: false,
          failure:
            error?.message === "expert_fit_unavailable"
              ? "expert_fit_unavailable"
              : "provider_or_budget_unavailable",
        });
      }
    }
    return {
      checkedAt: new Date().toISOString(),
      scope:
        "Authored sources and mini baselines with live GPT-5.4 review and domain validation. Zero mini generations; not a comparative quality benchmark or fresh project/service discovery.",
      cases,
    };
  }),
);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(
  JSON.stringify(
    {
      output,
      cases: report.cases.map(({ name, passed, failure, usage }) => ({
        name,
        passed,
        failure,
        tokens: usage ? usage.inputTokens + usage.outputTokens : null,
      })),
      attempts: report.sharedTokenBudget.attempts.length,
      after: report.sharedTokenBudget.after,
    },
    null,
    2,
  ),
);
if (!report.cases.every((item) => item.passed)) {
  process.exitCode = 1;
}
