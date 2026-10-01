import assert from "node:assert/strict";
import { isHumanReview } from "./corpus.mjs";

/** Requires explicit outcomes; a failed or malformed measurement must never be counted as a negative prediction. */
function isMeasured(result) {
  return (
    result &&
    !result.error &&
    [result.accepted, result.retrieved, result.prompt].every(
      (value) => typeof value === "boolean",
    )
  );
}

/** Computes quality only on measured human reviews, exposing coverage so missing cases cannot quietly improve recall. */
export function qualityMetrics(cases, results) {
  assert.equal(
    new Set(results.map((item) => item.id)).size,
    results.length,
    "Duplicate measurements",
  );
  const reviewed = cases.filter((item) => isHumanReview(item.review));
  const byId = new Map(results.map((item) => [item.id, item]));
  const measured = reviewed.flatMap((item) =>
    isMeasured(byId.get(item.id))
      ? [{ ...byId.get(item.id), expected: item.review }]
      : [],
  );
  const count = (predicate) => measured.filter(predicate).length;
  const tp = count((item) => item.accepted && item.expected.recommended);
  const fp = count((item) => item.accepted && !item.expected.recommended);
  const fn = count((item) => !item.accepted && item.expected.recommended);
  const relevant = count((item) => item.expected.recommended);
  const retrievalMisses = count(
    (item) => item.expected.recommended && !item.retrieved,
  );
  const pipelineTp = count(
    (item) => item.expected.recommended && item.retrieved && item.accepted,
  );
  const pipelineFp = count(
    (item) => !item.expected.recommended && item.retrieved && item.accepted,
  );
  const promptTp = count((item) => item.prompt && item.expected.prompt);
  const falsePrompts = count((item) => item.prompt && !item.expected.prompt);
  const missedPrompts = count((item) => !item.prompt && item.expected.prompt);

  return {
    reviewedCases: reviewed.length,
    measuredReviewedCases: measured.length,
    unmeasuredReviewedCases: reviewed.length - measured.length,
    pendingCases: cases.length - reviewed.length,
    reviewCoverage: cases.length ? reviewed.length / cases.length : 0,
    measurementCoverage: reviewed.length
      ? measured.length / reviewed.length
      : null,
    fullyReviewedAndMeasured:
      cases.length > 0 && measured.length === cases.length,
    precision: tp + fp ? tp / (tp + fp) : null,
    assessmentRecall: relevant ? tp / relevant : null,
    retrievalRecall: relevant ? (relevant - retrievalMisses) / relevant : null,
    pipelinePrecision:
      pipelineTp + pipelineFp ? pipelineTp / (pipelineTp + pipelineFp) : null,
    pipelineRecall: relevant ? pipelineTp / relevant : null,
    promptPrecision:
      promptTp + falsePrompts ? promptTp / (promptTp + falsePrompts) : null,
    falseInclusions: fp,
    falseExclusions: fn,
    retrievalMisses,
    falsePrompts,
    missedPrompts,
    errors: measured
      .filter(
        (item) =>
          item.accepted !== item.expected.recommended ||
          (item.expected.recommended && !item.retrieved) ||
          item.prompt !== item.expected.prompt,
      )
      .map((item) => ({
        id: item.id,
        retrievalMiss: item.expected.recommended && !item.retrieved,
        falseInclusion: item.accepted && !item.expected.recommended,
        falseExclusion: !item.accepted && item.expected.recommended,
        falsePrompt: item.prompt && !item.expected.prompt,
        missedPrompt: !item.prompt && item.expected.prompt,
      })),
  };
}

/** Evaluates binary relevance in the first k slots, counting unfilled slots as zero gain and misses against all labeled positives. */
export function rankingAtK(ids, relevant, k) {
  const top = ids.slice(0, k);
  const gains = top.map((id) => Number(relevant.has(id)));
  const found = gains.reduce((sum, gain) => sum + gain, 0);
  const ideal = Array.from(
    { length: Math.min(k, relevant.size) },
    (_, index) => 1 / Math.log2(index + 2),
  ).reduce((sum, gain) => sum + gain, 0);
  const dcg = gains.reduce(
    (sum, gain, index) => sum + gain / Math.log2(index + 2),
    0,
  );
  const first = ids.findIndex((id) => relevant.has(id));

  return {
    precisionAtK: found / k,
    recallAtK: relevant.size ? found / relevant.size : null,
    ndcgAtK: ideal ? dcg / ideal : null,
    reciprocalRank: first < 0 ? 0 : 1 / (first + 1),
  };
}

/** Compares held-out ranking only for fully reviewed briefs; history remains a separate synthetic input, not ground truth. */
export function rankingMetrics(corpus, results, k = 3) {
  assert.ok(Number.isSafeInteger(k) && k > 0);
  const measured = new Map(
    results.filter(isMeasured).map((item) => [item.id, item]),
  );
  const briefs = [];

  for (const brief of corpus.briefs) {
    const pairs = corpus.cases.filter((item) => item.briefId === brief.id);
    const complete =
      pairs.length === corpus.postings.length &&
      pairs.every(
        (item) => isHumanReview(item.review) && measured.get(item.id)?.ranking,
      );

    if (!complete) {
      continue;
    }

    const relevant = new Set(
      pairs.filter((item) => item.review.recommended).map((item) => item.id),
    );
    const eligible = pairs
      .map((item) => measured.get(item.id))
      .filter((item) => item.retrieved && item.accepted);
    const ordered = (key) =>
      [...eligible]
        .sort(
          (a, b) =>
            b.ranking[key] - a.ranking[key] ||
            a.candidateOrder - b.candidateOrder,
        )
        .map((item) => item.id);
    const baseline = rankingAtK(ordered("baseline"), relevant, k);
    const feedback = rankingAtK(ordered("feedback"), relevant, k);
    const candidates = pairs
      .map((item) => measured.get(item.id))
      .filter((item) => item.retrieved);
    const admitted = (key) =>
      [...candidates]
        .sort((a, b) => a[key] - b[key])
        .slice(0, 8)
        .filter((item) => relevant.has(item.id)).length;
    briefs.push({
      briefId: brief.id,
      historyExamples: (brief.feedbackHistory ?? []).length,
      baseline,
      feedback,
      ndcgDelta:
        baseline.ndcgAtK === null ? null : feedback.ndcgAtK - baseline.ndcgAtK,
      relevantInFirstEight: {
        baseline: admitted("candidateOrder"),
        feedback: admitted("feedbackOrder"),
      },
    });
  }

  const comparable = briefs.filter(
    (item) => item.historyExamples && item.ndcgDelta !== null,
  );

  return {
    k,
    fullyReviewedBriefs: briefs.length,
    pendingBriefs: corpus.briefs.length - briefs.length,
    feedbackComparableBriefs: comparable.length,
    meanNdcgDelta: comparable.length
      ? comparable.reduce((sum, item) => sum + item.ndcgDelta, 0) /
        comparable.length
      : null,
    briefs,
  };
}

/** Reports empirical latency without inventing values for unmeasured stages. */
export function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);

  return ordered.length
    ? ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)]
    : null;
}
