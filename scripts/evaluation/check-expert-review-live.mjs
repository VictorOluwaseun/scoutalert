import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { writeFile, access } from "node:fs/promises";
import { withEvaluationDatabase, sql } from "./database.mjs";
import { withSharedModelTokenBudget } from "./shared-token-budget.mjs";
import {
  authoredExpertCases,
  recordedExpertCases,
  expertRecoveryCases,
  expertTestSearch,
} from "./expert-review-cases.mjs";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";
import {
  ActivateScout,
  ReviewSearchDraft,
} from "../../packages/core/dist/onboarding/public.js";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "../../packages/adapters/dist/onboarding/public.js";
import {
  EvaluateCandidates,
  fitReviewReason,
  fitReviewRequest,
  validFit,
  validAnalysis,
  validReviewedFit,
} from "../../packages/core/dist/scouting/public.js";
import {
  createIntelligenceClient,
  OpenAIFitReviewProvider,
  PostgresIntelligenceRepository,
  PostgresSourceRepository,
  PostgresScoutingRepository,
} from "../../packages/adapters/dist/scouting/public.js";
import { PlanScoutSearch } from "../../packages/core/dist/discovery/public.js";
import {
  OpenAIDiscoveryReasoningProvider,
  PostgresDiscoveryReasoningRepository,
  PostgresWebDiscoveryRepository,
} from "../../packages/adapters/dist/discovery/public.js";

// Live full-model generation only. Authored/recorded mini baselines and search snapshots keep this diagnostic independent of mini capacity.
// All case records are disposable; at most fourteen full-model calls share the real worker ledger and an additional 80,000-token ceiling.
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const output = process.argv[2];
assert.ok(output, "Provide a new receipt path");
await assert.rejects(access(output), { code: "ENOENT" });
const selectedNames = process.argv
  .find((value) => value.startsWith("--only="))
  ?.slice(7)
  .split(",");
const ceilingArgument = process.argv.find((value) =>
  value.startsWith("--token-ceiling="),
);
const tokenCeiling = ceilingArgument
  ? Number(ceilingArgument.slice(16))
  : 80_000;
assert.ok(
  Number.isSafeInteger(tokenCeiling) &&
    tokenCeiling >= 0 &&
    tokenCeiling <= 80_000,
  "Evaluation ceiling must be between zero and 80,000 tokens",
);
const usage = {
  model: "no-provider-call",
  inputTokens: 0,
  outputTokens: 0,
  durationMs: 0,
  responseId: "authored-or-recorded-baseline",
};

/** Makes a private synthetic scout; no real account, source refresh, notification or availability claim is created. */
async function context(db, search) {
  const ownerId = randomUUID();
  await db
    .insertInto("users")
    .values({
      id: ownerId,
      email: `${ownerId}@scoutalert.test`,
      verified_at: new Date(),
    })
    .execute();
  const activation = new ActivateScout(
    new ReviewSearchDraft(),
    new PostgresScoutActivationUnitOfWork(db),
    new NodeScoutActivationIdentity(),
    () => new Date(),
  );
  const scout = await activation.execute(ownerId, "expert-evaluation", {
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
  return {
    search,
    request: { ownerId, scoutId: scout.id, version: 1, runId: randomUUID() },
  };
}

/** Selects audit fixture identities through the actual 5% policy; no production sampling setting is changed. */
function selectAuditIdentity(scenario) {
  const original = scenario.posting.id;
  for (let index = 0; index < 1000; index++) {
    scenario.posting.id = `${original}:audit-${index}`;
    if (
      fitReviewReason(
        scenario.posting,
        scenario.search,
        scenario.analysis,
        scenario.baseline,
        5,
      ) === "sample_audit"
    ) {
      return;
    }
  }
  throw new Error("audit_fixture_not_selected");
}

/** Traverses durable extraction/baseline leases, a live expert lease and a fresh-run cache replay. */
async function evaluateFit(db, provider, scenario) {
  if (scenario.expected.reason === "sample_audit") {
    selectAuditIdentity(scenario);
  }
  assert.ok(
    validAnalysis(scenario.posting, scenario.analysis),
    `${scenario.name}: invalid analysis fixture`,
  );
  assert.ok(
    validFit(
      scenario.posting,
      scenario.search,
      scenario.baseline,
      scenario.analysis,
    ),
    `${scenario.name}: invalid baseline fixture`,
  );
  assert.equal(
    fitReviewReason(
      scenario.posting,
      scenario.search,
      scenario.analysis,
      scenario.baseline,
      5,
    ),
    scenario.expected.reason,
  );
  const packet = fitReviewRequest(
    scenario.posting,
    scenario.analysis,
    scenario.baseline,
    scenario.expected.reason,
  );
  const sources = new PostgresSourceRepository(db);
  const lease = await sources.claim(scenario.posting.source, new Date());
  await sources.publish(
    {
      source: scenario.posting.source,
      kind: "client_request",
      checkedAt: new Date().toISOString(),
      postings: [scenario.posting],
    },
    lease,
  );
  const run = await context(db, scenario.search);
  const scouting = new PostgresScoutingRepository(db);
  await scouting.begin(run.request);
  const records = new PostgresIntelligenceRepository(db, 100, 20_000_000);
  let baselineCalls = 0;
  let expertCalls = 0;
  let expertResult;
  let failure;
  let durationMs;
  const evaluator = new EvaluateCandidates(
    records,
    {
      configuration: `expert-evaluation-${scenario.name}`,
      /** Replays authored or recorded public facts without an API call. */
      async extract() {
        baselineCalls++;
        return { kind: "extraction", analysis: scenario.analysis, usage };
      },
      /** Replays a fixed baseline, leaving all live spending to the expert stage. */
      async assess() {
        baselineCalls++;
        return { kind: "fit", fit: scenario.baseline, usage };
      },
    },
    undefined,
    {
      configuration: provider.configuration,
      /** Measures the actual native expert call while leaving publication and leases to production code. */
      async review(search, analysis, request) {
        expertCalls++;
        const started = performance.now();
        try {
          expertResult = await provider.review(search, analysis, request);
          return expertResult;
        } catch (error) {
          failure = safeFailure(error);
          throw error;
        } finally {
          durationMs = Math.round(performance.now() - started);
        }
      },
    },
    5,
  );
  let result = "progress";
  for (let step = 0; step < 8 && typeof result === "string"; step++) {
    result = await evaluator.evaluate(run, [scenario.posting]);
  }
  const saved =
    await sql`SELECT status,attempts,result FROM intelligence_tasks WHERE posting_id=${scenario.posting.id} AND review_of IS NOT NULL`.execute(
      db,
    );
  const next = { ...run, request: { ...run.request, runId: randomUUID() } };
  await scouting.begin(next.request);
  const replay = await evaluator.evaluate(next, [scenario.posting]);
  const isolated = await records.plan(
    { ...next, request: { ...next.request, ownerId: randomUUID() } },
    [scenario.posting],
    "foreign-owner",
  );
  const criteria = Object.fromEntries(
    (expertResult?.fit.criteria ?? []).map((item) => [
      item.criterion,
      item.status,
    ]),
  );
  const accepted = Array.isArray(result) && result.length > 0;
  const valid =
    !!expertResult &&
    validReviewedFit(
      scenario.posting,
      scenario.search,
      scenario.analysis,
      packet,
      expertResult.fit,
    );
  const expectationsPassed =
    Object.entries(scenario.expected.criteria ?? {}).every(([name, statuses]) =>
      statuses.includes(criteria[name]),
    ) &&
    (!scenario.expected.anyConflict ||
      scenario.expected.anyConflict.some(
        (name) => criteria[name] === "conflicts",
      )) &&
    (scenario.expected.accepted === undefined ||
      accepted === scenario.expected.accepted) &&
    (scenario.expected.complete === undefined ||
      packet.sources.every((source) => source.complete) ===
        scenario.expected.complete);
  const durablePassed =
    saved.rows.length === 1 &&
    saved.rows[0].status === "ready" &&
    saved.rows[0].attempts === 1 &&
    saved.rows[0].result?.review?.status === "completed" &&
    baselineCalls === 2 &&
    expertCalls === 1 &&
    JSON.stringify(replay) === JSON.stringify(result) &&
    isolated.selected.length === 0 &&
    isolated.results.length === 0;
  return {
    name: scenario.name,
    origin: scenario.origin,
    passed: valid && expectationsPassed && durablePassed,
    valid,
    expectationsPassed,
    durablePassed,
    accepted,
    expected: scenario.expected,
    criteria,
    failure,
    durationMs,
    source: {
      url: scenario.posting.url,
      observedAt: scenario.posting.sourceUpdatedAt,
      complete: packet.sources.every((source) => source.complete),
    },
    fit: expertResult?.fit,
    usage: expertResult?.usage,
    expertCalls,
    baselineCalls,
    taskStatus: saved.rows[0]?.status,
  };
}

/** Checks live recovery selection through the real case/phase repository; cached replay must make no second call. */
async function evaluateRecovery(db, provider, scenario) {
  const run = await context(db, expertTestSearch);
  const records = new PostgresDiscoveryReasoningRepository(db, 100, 20_000_000);
  await new PostgresWebDiscoveryRepository(db).open(
    run.request,
    scenario.snapshot.plan,
    {
      id: `expert-recovery-${scenario.name}`,
      configuration: "fixture-no-search",
      access: "public_index",
      language: "en",
      country: "us",
      requestCostMicros: 0,
    },
  );
  let calls = 0;
  let output;
  let failure;
  const planner = new PlanScoutSearch(
    records,
    {
      configuration: provider.configuration,
      /** Rejects routine mini work before network access; this suite only exercises the configured expert route. */
      async reason(input) {
        assert.equal(
          input.expertReview,
          "stalled_discovery",
          "unexpected_mini_stage",
        );
        calls++;
        try {
          output = await provider.reason(input);
          return output;
        } catch (error) {
          failure = safeFailure(error);
          throw error;
        }
      },
    },
    true,
  );
  let result = "progress";
  for (let step = 0; step < 4 && typeof result === "string"; step++) {
    result = await planner.next(run.request, scenario.snapshot);
  }
  const replay = await planner.next(run.request, scenario.snapshot);
  const saved =
    await sql`SELECT t.state,t.output FROM web_reasoning_phases p JOIN web_reasoning_tasks t ON t.key=p.task_key WHERE p.run_id=${run.request.runId}::uuid AND p.phase='expert-recovery'`.execute(
      db,
    );
  const action = typeof result === "object" ? result.action : null;
  const expected = scenario.expected;
  const passed =
    calls === 1 &&
    !!output &&
    saved.rows[0]?.state === "ready" &&
    JSON.stringify(replay) === JSON.stringify(result) &&
    scenario.choices.some(
      (choice) => JSON.stringify(choice) === JSON.stringify(result),
    ) &&
    action?.kind === expected.kind &&
    (!expected.url || action.url === expected.url) &&
    (!expected.queryIncludes ||
      action.query?.query.toLowerCase().includes(expected.queryIncludes));
  return {
    name: scenario.name,
    passed,
    expected,
    decision: result,
    output: output?.output,
    usage: output?.usage,
    calls,
    failure,
    taskStatus: saved.rows[0]?.state,
  };
}

/** Exposes only bounded failure codes; credentials, prompts and raw provider responses never become error logs. */
function safeFailure(error) {
  const known = new Set([
    "daily_token_budget_exhausted",
    "expert_fit_unavailable",
    "expert_fit_packet_too_large",
    "invalid_evidence_reference",
    "discovery_reasoning_unavailable",
  ]);
  const visited = new Set();
  for (
    let current = error;
    current && !visited.has(current);
    current = current.cause
  ) {
    visited.add(current);
    if (
      [current.name, current.constructor?.name].includes(
        "APIConnectionTimeoutError",
      )
    ) {
      return "provider_timeout";
    }
    if (known.has(current.message)) {
      return current.message;
    }
    if (typeof current.status === "number") {
      return `provider_http_${current.status}`;
    }
  }
  return "provider_or_transport_unavailable";
}

const report = await withEvaluationDatabase(
  withSharedModelTokenBudget(
    async (db, budget) => {
      const config = readWorkerConfiguration();
      const client = createIntelligenceClient(config.OPENAI_API_KEY, budget);
      const expert = new OpenAIFitReviewProvider(
        client,
        config.SCOUT_AI_EXPERT_MODEL,
      );
      const recovery = new OpenAIDiscoveryReasoningProvider(
        client,
        config.SCOUT_AI_EXTRACTION_MODEL,
        config.SCOUT_AI_PLANNING_MODEL,
        config.SCOUT_AI_EXPERT_MODEL,
      );
      const cases = [];
      const fitScenarios = [
        ...authoredExpertCases(),
        ...(await recordedExpertCases()),
      ];
      const recoveryScenarios = expertRecoveryCases();
      assert.ok(
        !selectedNames ||
          selectedNames.every((name) =>
            [...fitScenarios, ...recoveryScenarios].some(
              (scenario) => scenario.name === name,
            ),
          ),
        "Unknown case selection",
      );
      for (const scenario of fitScenarios.filter(
        (item) => !selectedNames || selectedNames.includes(item.name),
      )) {
        const result = await evaluateFit(db, expert, scenario);
        cases.push(result);
        console.log(
          JSON.stringify({
            name: result.name,
            passed: result.passed,
            failure: result.failure,
            tokens: result.usage
              ? result.usage.inputTokens + result.usage.outputTokens
              : null,
          }),
        );
      }
      const recoveries = [];
      for (const scenario of recoveryScenarios.filter(
        (item) => !selectedNames || selectedNames.includes(item.name),
      )) {
        const result = await evaluateRecovery(db, recovery, scenario);
        recoveries.push(result);
        console.log(
          JSON.stringify({
            name: result.name,
            passed: result.passed,
            failure: result.failure,
            tokens: result.usage
              ? result.usage.inputTokens + result.usage.outputTokens
              : null,
          }),
        );
      }
      return {
        checkedAt: new Date().toISOString(),
        scope:
          "Live GPT-5.4 private reviews and recovery decisions through durable production use cases. Mini baselines and public search snapshots are authored or replayed from named receipts. No fresh retrieval, mini generation, availability checks or emails. Expected labels were fixed before generation; this is a small regression corpus, not independent quality benchmarking.",
        cases,
        recoveries,
      };
    },
    true,
    tokenCeiling,
  ),
);
assert.ok(
  report.sharedTokenBudget.attempts.every((attempt) =>
    /^gpt-5\.4(?:-2026-03-05)?$/u.test(attempt.model),
  ),
  "Unexpected mini generation",
);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(
  JSON.stringify(
    {
      output,
      passed: [...report.cases, ...report.recoveries].filter(
        (item) => item.passed,
      ).length,
      total: report.cases.length + report.recoveries.length,
      tokens: report.sharedTokenBudget.evaluationAccountedTokens,
      attempts: report.sharedTokenBudget.attempts.length,
      remaining: report.sharedTokenBudget.after.models.find(
        (item) => item.model === "gpt-5.4",
      ),
    },
    null,
    2,
  ),
);
if (![...report.cases, ...report.recoveries].every((item) => item.passed)) {
  process.exitCode = 1;
}
