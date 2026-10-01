import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCorpus } from "./corpus.mjs";
import {
  EmployerEvidenceRepository,
  needsEmployerResearch,
  validAnalysis,
  validFit,
  assessPersonalFit,
  prioritizeWithFeedback,
  rankWithFeedback,
} from "../../packages/core/dist/scouting/public.js";
import { isPromptMatch } from "../../packages/core/dist/notifications/public.js";
import {
  OpenAIIntelligenceProvider,
  OpenAIEmployerResearchProvider,
  createIntelligenceClient,
  estimateIntelligenceCost,
  PostgresSourceRepository,
  PostgresScoutingRepository,
} from "../../packages/adapters/dist/scouting/public.js";
import { withEvaluationDatabase } from "./database.mjs";
import {
  qualityMetrics,
  rankingMetrics,
  percentile,
} from "./quality-metrics.mjs";

const corpusPath =
  process.argv[2] ??
  new URL("../../evaluations/opportunity-quality/corpus.json", import.meta.url);
const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
validateCorpus(corpus);
loadEnvFile(new URL("../../apps/worker/.env", import.meta.url));
const client = createIntelligenceClient(process.env.OPENAI_API_KEY);
const model = "gpt-5.4-mini-2026-03-17";
const provider = new OpenAIIntelligenceProvider(client, model, model);

/** Replays frozen text at the evaluation clock; original capture dates stay in the corpus and the report discloses this freshness assumption. */
class CorpusEvidenceRepository extends EmployerEvidenceRepository {
  /** Source evidence is held separately from the synthetic private briefs. */
  async read(posting) {
    return (corpus.documents[posting.source] ?? []).map((document) => ({
      ...document,
      checkedAt: new Date().toISOString(),
    }));
  }
}
const researcher = new OpenAIEmployerResearchProvider(
  client,
  model,
  new CorpusEvidenceRepository(),
  "frozen-text-replay-v2",
);
const maxUsd = Number(process.env.SCOUT_EVAL_MAX_USD ?? "2");
const maxRequests = Number(process.env.SCOUT_EVAL_MAX_REQUESTS ?? "24");
assert.ok(
  maxUsd > 0 &&
    maxUsd <= 20 &&
    Number.isSafeInteger(maxRequests) &&
    maxRequests > 0 &&
    maxRequests <= 250,
);
const results = [];
const usage = [];
let requests = 0;
const started = performance.now();
const corpusFile =
  corpusPath instanceof URL ? fileURLToPath(corpusPath) : resolve(corpusPath);
const reportUrl =
  process.argv[3] ?? join(dirname(corpusFile), "latest-report.json");
// Never replace a prior paid run. Use a fresh output filename for each rerun.
await writeFile(reportUrl, "{}\n", { flag: "wx" });

/** Reserves worst-case standard-tier cost before each attempt, including failed calls; there are no automatic retries. */
async function paid(action) {
  if (requests >= maxRequests || (requests + 1) * 0.075 > maxUsd)
    throw new Error("evaluation_budget_exhausted");
  requests++;
  await save();
  const result = await action();
  usage.push({
    ...result.usage,
    kind: result.kind,
    cost: estimateIntelligenceCost(result.usage),
  });
  await save();
  return result;
}

/** Persists partial results as well as completed runs; unreviewed labels cannot produce a release claim. */
async function save() {
  const metrics = qualityMetrics(corpus.cases, results);
  const report = {
    schema: 2,
    corpusHash: corpus.contentHash,
    measuredAt: new Date().toISOString(),
    model,
    configuration: provider.configuration,
    researchConfiguration: researcher.configuration,
    scope:
      "Frozen public jobs and client requests with synthetic briefs/prior feedback; corpus-level retrieval, not production recall or load",
    complete:
      results.length === corpus.cases.length &&
      results.every((item) => !item.error),
    elapsedMs: Math.round(performance.now() - started),
    requests,
    reservedUsd: requests * 0.075,
    estimatedUsd:
      usage.reduce(
        (sum, item) => sum + (item.cost?.estimatedMicrousd ?? 0),
        0,
      ) / 1_000_000,
    unmeasuredAttempts: requests - usage.length,
    unpricedProviderCalls: usage.filter(
      (item) => item.model !== "no-provider-call" && !item.cost,
    ).length,
    costScope:
      "Estimated standard-tier cost of measured priced calls; failed or unpriced calls remain covered by reservations, not counted as free.",
    providerCalls: usage.filter((item) => item.model !== "no-provider-call")
      .length,
    usage,
    evidenceClock:
      "Frozen source text is replayed with fresh timestamps in an isolated test schema; no live availability or current policy freshness is claimed. Original capture dates remain in corpus.json.",
    metrics,
    ranking: rankingMetrics(corpus, results),
    cohorts: Object.fromEntries(
      corpus.briefs.map((brief) => [
        brief.cohort,
        qualityMetrics(
          corpus.cases.filter((item) => item.briefId === brief.id),
          results,
        ),
      ]),
    ),
    providerP50Ms: percentile(
      usage.map((item) => item.durationMs),
      0.5,
    ),
    providerP95Ms: percentile(
      usage.map((item) => item.durationMs),
      0.95,
    ),
    releaseEvidenceReady: false,
    reviewRequirement:
      "Independent human labels and representative source/user coverage are required before interpreting these measurements as a release benchmark.",
    results,
  };
  await writeFile(`${reportUrl}.tmp`, JSON.stringify(report, null, 2) + "\n");
  await rename(`${reportUrl}.tmp`, reportUrl);
  return report;
}

/** Shares public extraction/research once per posting; marketplace requests never receive employer-policy research. */
async function analyze(posting, analyses) {
  const cached = analyses.get(posting.id);
  if (cached) return cached;
  let analysis = (await paid(() => provider.extract(posting))).analysis;
  assert.ok(validAnalysis(posting, analysis), "Invalid extraction evidence");
  if (posting.kind !== "client_request" && needsEmployerResearch(analysis))
    analysis = (await paid(() => researcher.investigate(posting, analysis)))
      .analysis;
  assert.ok(validAnalysis(posting, analysis), "Invalid researched evidence");
  analyses.set(posting.id, analysis);
  return analysis;
}

await withEvaluationDatabase(async (db) => {
  const sources = new PostgresSourceRepository(db);
  for (const source of new Set(
    corpus.postings.map((posting) => posting.source),
  )) {
    const lease = await sources.claim(source, new Date());
    await sources.publish(
      {
        source,
        kind:
          corpus.postings.find((posting) => posting.source === source).kind ??
          "job",
        scope: source === "freelancer" ? "window" : "complete",
        checkedAt: new Date().toISOString(),
        postings: corpus.postings.filter(
          (posting) => posting.source === source,
        ),
      },
      lease,
    );
  }
  const retrieved = new Map();
  const records = new PostgresScoutingRepository(db);
  for (const brief of corpus.briefs) {
    const began = performance.now();
    const candidates = await records.candidates({
      search: brief.search,
      request: {
        ownerId: randomUUID(),
        scoutId: randomUUID(),
        version: 1,
        runId: randomUUID(),
      },
    });
    assert.ok(candidates, "Captured category has no published source");
    retrieved.set(brief.id, {
      feedbackIds: prioritizeWithFeedback(
        candidates,
        brief.feedbackHistory ?? [],
      ).map((posting) => posting.id),
      ids: candidates.map((posting) => posting.id),
      durationMs: performance.now() - began,
    });
  }
  const analyses = new Map();
  for (const entry of corpus.cases) {
    const posting = corpus.postings.find((item) => item.id === entry.postingId);
    const brief = corpus.briefs.find((item) => item.id === entry.briefId);
    assert.ok(
      posting && brief,
      "Every evaluation pair must reference a captured posting and explicit brief",
    );
    try {
      const analysis = await analyze(posting, analyses);
      const fit = await paid(() =>
        provider.assess(posting, brief.search, analysis),
      );
      assert.ok(
        validFit(posting, brief.search, fit.fit, analysis),
        "Invalid personal evidence",
      );
      const assessment = assessPersonalFit(brief.search, analysis, fit.fit);
      const now = new Date();
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
      results.push({
        id: entry.id,
        accepted: assessment !== null,
        retrieved: retrieved.get(brief.id).ids.includes(posting.id),
        retrievalMs: retrieved.get(brief.id).durationMs,
        prompt: !!assessment && isPromptMatch(opportunity, brief.search, now),
        promptAssumption:
          "Posting availability held fresh for this isolated decision test; no email sent",
        candidateOrder: retrieved.get(brief.id).ids.indexOf(posting.id),
        feedbackOrder: retrieved.get(brief.id).feedbackIds.indexOf(posting.id),
        ranking: {
          baseline: assessment?.rank ?? 0,
          feedback: assessment
            ? rankWithFeedback(posting, assessment, brief.feedbackHistory ?? [])
                .rank
            : 0,
        },
        assessment,
        analysis,
      });
    } catch (error) {
      results.push({
        id: entry.id,
        error:
          error instanceof Error && /budget/.test(error.message)
            ? "budget_exhausted"
            : "assessment_failed",
      });
      await save();
      if (error instanceof Error && /budget/.test(error.message)) break;
    }
    await save();
    console.log(
      `${entry.id}: assessed (${results.length}/${corpus.cases.length})`,
    );
  }
});
const report = await save();
console.log(
  JSON.stringify({
    complete: report.complete,
    requests,
    estimatedUsd: report.estimatedUsd,
    metrics: report.metrics,
    releaseEvidenceReady: false,
  }),
);
if (!report.complete) process.exitCode = 1;
