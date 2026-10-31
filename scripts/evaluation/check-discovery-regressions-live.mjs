import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { withSharedModelTokenBudget } from "./shared-token-budget.mjs";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";
import {
  createIntelligenceClient,
  OpenAIIntelligenceProvider,
  OpenAIFitReviewProvider,
} from "../../packages/adapters/dist/scouting/public.js";
import { evidencePassages } from "../../packages/adapters/dist/scouting/intelligence/evidence-passages.js";
import {
  briefEvidence,
  fitReviewRequest,
  validFit,
  validReviewedFit,
} from "../../packages/core/dist/scouting/public.js";

// Reassesses two recorded synthetic cases; no searches, real accounts, publishing or email.
// A stricter 20,000-token invocation ceiling sits below the unchanged shared daily model allocations.
loadEnvFile(new URL("../../apps/api/.env", import.meta.url));
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const output = process.argv[2];
assert.ok(output, "Supply a new receipt path");
await assert.rejects(access(output), { code: "ENOENT" });

/** Reconstructs the immutable posting, extracted facts and mini baseline from a named live-test receipt. */
async function recordedCase(file, urlFragment) {
  const report = JSON.parse(await readFile(file, "utf8"));
  const source = report.publication.find((item) =>
    item.url.includes(urlFragment),
  );
  assert.ok(source);
  const postingId = source.linkedPostingId;
  const extraction = report.intelligence.find(
    (item) =>
      item.posting_id === postingId &&
      ["extraction", "research"].includes(item.kind) &&
      item.result?.analysis,
  );
  const baseline = report.intelligence.find(
    (item) =>
      item.posting_id === postingId && item.kind === "fit" && item.result,
  );
  assert.ok(extraction && baseline);
  return {
    file,
    search: report.search,
    analysis: extraction.result.analysis,
    baseline: baseline.result.fit,
    posting: {
      id: postingId,
      source: "recorded-live-regression",
      externalId: postingId,
      familyId: postingId,
      kind: "client_request",
      version: 1,
      company: source.review.company.value || null,
      location: null,
      title: source.review.analysis.facts.role.value,
      url: source.url,
      text: source.input.text,
      fingerprint: source.input.fingerprint,
      sourceUpdatedAt: source.input.observedAt,
    },
  };
}

/** Reproduces the previous serializer's byte size without making a provider request. */
function previousPacketBytes(item, request) {
  const passages = {};
  const sources = request.sources.map(({ text, ...source }) => ({
    ...source,
    passages: Object.fromEntries(
      Object.values(evidencePassages(text, "p", 3)).map((quote) => {
        const id = `p${Object.keys(passages).length}`;
        passages[id] = quote;
        return [id, quote];
      }),
    ),
  }));
  return Buffer.byteLength(
    JSON.stringify({
      reason: request.reason,
      sources,
      baseline: request.baseline,
      facts: item.analysis.facts,
      pay: item.analysis.pay,
      brief: item.search,
      briefPassages: Object.fromEntries(
        briefEvidence(item.search).map((value, index) => [`b${index}`, value]),
      ),
    }),
  );
}

const preference = await recordedCase(
  "evaluations/discovery/full-services-live-2026-10-31.json",
  "wordpress-woocommerce-website-redesign",
);
const oversized = await recordedCase(
  "evaluations/discovery/full-projects-live-funded-2026-10-31.json",
  "based-aem-react-front-end",
);
const request = fitReviewRequest(
  oversized.posting,
  oversized.analysis,
  oversized.baseline,
  "conditional_requirements",
);
const oldBytes = previousPacketBytes(oversized, request);
assert.ok(
  oldBytes > 24_000,
  "Recorded case must reproduce the original packet rejection",
);
const config = readWorkerConfiguration();
const report = await withSharedModelTokenBudget(
  async (_db, budget) => {
    const client = createIntelligenceClient(process.env.OPENAI_API_KEY, budget);
    const mini = new OpenAIIntelligenceProvider(
      client,
      config.SCOUT_AI_EXTRACTION_MODEL,
      config.SCOUT_AI_FIT_MODEL,
    );
    const expert = new OpenAIFitReviewProvider(
      client,
      config.SCOUT_AI_EXPERT_MODEL,
    );
    const parse = client.responses.parse.bind(client.responses);
    let packetBytes = 0;
    client.responses.parse = (body, ...rest) => {
      packetBytes = Buffer.byteLength(body.input);
      return parse(body, ...rest);
    };
    const corrected = await mini.assess(
      preference.posting,
      preference.search,
      preference.analysis,
    );
    const location = corrected.fit.criteria.find(
      (item) => item.criterion === "location",
    );
    const preferencePassed =
      validFit(
        preference.posting,
        preference.search,
        corrected.fit,
        preference.analysis,
      ) && location.status === "unknown";
    const reviewed = await expert.review(
      oversized.search,
      oversized.analysis,
      request,
    );
    const experience = reviewed.fit.criteria.find(
      (item) => item.criterion === "experience",
    );
    const packetPassed =
      packetBytes <= 24_000 &&
      validReviewedFit(
        oversized.posting,
        oversized.search,
        oversized.analysis,
        request,
        reviewed.fit,
      ) &&
      experience.status === "unknown";
    return {
      checkedAt: new Date().toISOString(),
      cases: [
        {
          name: "employer-location-preference",
          passed: preferencePassed,
          sourceReceipt: preference.file,
          sourceUrl: preference.posting.url,
          previousLocation: "conflicts",
          location,
          usage: corrected.usage,
        },
        {
          name: "repeated-expert-citations",
          passed: packetPassed,
          sourceReceipt: oversized.file,
          sourceUrl: oversized.posting.url,
          previousPacketBytes: oldBytes,
          packetBytes,
          maximumPacketBytes: 24_000,
          experience,
          usage: reviewed.usage,
        },
      ],
      scope:
        "Live mini and expert reassessment of two earlier captured synthetic test cases. This does not refresh source availability or publish the paused preference example. Source text and daily caps are unchanged; source-review availability is verified by separate full-flow tests.",
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
      cases: report.cases.map(({ name, passed }) => ({ name, passed })),
      tokens: report.sharedTokenBudget.evaluationAccountedTokens,
    },
    null,
    2,
  ),
);
assert.ok(
  report.cases.every((item) => item.passed),
  "A live regression failed; see the saved receipt",
);
