import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { withSharedModelTokenBudget } from "./shared-token-budget.mjs";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";
import {
  createIntelligenceClient,
  OpenAIIntelligenceProvider,
  evidencePassages,
  fitPacket,
} from "../../packages/adapters/dist/scouting/public.js";
import {
  briefEvidence,
  postingEvidence,
  researchText,
  validFit,
} from "../../packages/core/dist/scouting/public.js";

// Two recorded synthetic cases, no fresh searches or emails. Every generation uses the shared worker ledger and a stricter 20,000-token invocation ceiling.
loadEnvFile(new URL("../../apps/api/.env", import.meta.url));
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const output = process.argv[2];
assert.ok(output, "Supply a new receipt path");
await assert.rejects(access(output), { code: "ENOENT" });
const config = readWorkerConfiguration();

/** Reconstructs only a recorded synthetic profile and its publicly captured recommendation; this does not renew availability. */
async function recordedCase(scenario) {
  const file = `evaluations/discovery/full-${scenario}-verified-2026-11-01.json`;
  const report = JSON.parse(await readFile(file, "utf8"));
  const opportunity = report.opportunities[0];
  const source = report.publication.find(
    (item) => item.url === opportunity.url,
  );
  const evidence =
    report.intelligence.find(
      (item) => item.posting_id === opportunity.id && item.result?.analysis,
    )?.result.analysis ?? source.review.analysis;
  return {
    scenario,
    file,
    search: report.search,
    analysis: evidence,
    posting: {
      id: opportunity.id,
      externalId: opportunity.id,
      familyId: opportunity.id,
      source: "recorded-synthetic",
      kind: "client_request",
      version: 1,
      fingerprint: source.input.fingerprint,
      url: source.url,
      title: opportunity.title,
      company: opportunity.company,
      location: opportunity.location,
      text: source.input.text,
      sourceUpdatedAt: null,
    },
  };
}

/** Recreates the prior repeated-evidence payload with the same original source and confirmed brief. */
function previousInput(item) {
  return JSON.stringify({
    passages: evidencePassages(
      `${postingEvidence(item.posting)}\n${researchText(item.analysis)}`,
      "p",
      3,
    ),
    kind: item.posting.kind,
    analysis: item.analysis,
    brief: item.search,
    briefPassages: Object.fromEntries(
      briefEvidence(item.search).map((value, index) => [`b${index}`, value]),
    ),
  });
}

const items = await Promise.all([
  recordedCase("projects"),
  recordedCase("services"),
]);
const report = await withSharedModelTokenBudget(
  async (_db, budget) => {
    const client = createIntelligenceClient(process.env.OPENAI_API_KEY, budget);
    const counter = createIntelligenceClient(process.env.OPENAI_API_KEY);
    const provider = new OpenAIIntelligenceProvider(
      client,
      config.SCOUT_AI_EXTRACTION_MODEL,
      config.SCOUT_AI_FIT_MODEL,
    );
    const cases = [];
    for (const item of items) {
      const row = {
        scenario: item.scenario,
        sourceReceipt: item.file,
        url: item.posting.url,
        passed: false,
      };
      cases.push(row);
      try {
        // Capture the actual provider instructions/schema without sending a generation.
        const capture = createIntelligenceClient("fixture-no-network");
        let body;
        capture.responses.parse = async (request) => {
          body = JSON.parse(JSON.stringify(request));
          throw new Error("captured");
        };
        const observer = new OpenAIIntelligenceProvider(
          capture,
          config.SCOUT_AI_EXTRACTION_MODEL,
          config.SCOUT_AI_FIT_MODEL,
        );
        await assert.rejects(
          observer.assess(item.posting, item.search, item.analysis),
          /captured/,
        );
        const previous = previousInput(item);
        const current = fitPacket(
          item.posting,
          item.search,
          item.analysis,
        ).input;
        assert.equal(current, body.input);
        const counts = [];
        for (const input of [previous, current]) {
          const counted = await counter.responses.inputTokens.count(
            {
              model: body.model,
              input,
              instructions: body.instructions,
              reasoning: body.reasoning,
              text: body.text,
            },
            { timeout: 8000, maxRetries: 0 },
          );
          counts.push(counted.input_tokens);
        }
        Object.assign(row, {
          previousBytes: Buffer.byteLength(previous),
          compactBytes: Buffer.byteLength(current),
          previousInputTokens: counts[0],
          compactInputTokens: counts[1],
          inputTokensSaved: counts[0] - counts[1],
        });
        const result = await provider.assess(
          item.posting,
          item.search,
          item.analysis,
        );
        const criteria = Object.fromEntries(
          result.fit.criteria.map((criterion) => [
            criterion.criterion,
            criterion.status,
          ]),
        );
        const passed =
          validFit(item.posting, item.search, result.fit, item.analysis) &&
          ["role", "category", "arrangement"].every(
            (criterion) => criteria[criterion] === "meets",
          ) &&
          ["location", "authorization"].every(
            (criterion) => criteria[criterion] === "unknown",
          ) &&
          criteria.experience ===
            (item.scenario === "projects" ? "unknown" : "meets") &&
          criteria.compensation !== "conflicts" &&
          counts[1] < counts[0];
        Object.assign(row, { passed, criteria, usage: result.usage });
      } catch {
        row.failure = "counting_generation_or_evidence_check_failed";
      }
    }
    return {
      checkedAt: new Date().toISOString(),
      cases,
      scope:
        "Four native input-count calls compare only payload serialization with identical current instructions and schema; two guarded mini generations verify cited fit. No expert generations, fresh availability, searches, real account data or emails. Evidence and daily caps are unchanged.",
    };
  },
  true,
  20_000,
)(undefined);
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(
  JSON.stringify(
    {
      output,
      cases: report.cases,
      accountedTokens: report.sharedTokenBudget.evaluationAccountedTokens,
    },
    null,
    2,
  ),
);
assert.ok(
  report.cases.every((item) => item.passed),
  "See the saved efficiency receipt for failed cases",
);
