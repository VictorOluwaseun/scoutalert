import { test } from "node:test";
import assert from "node:assert/strict";
import {
  qualityMetrics,
  rankingMetrics,
  rankingAtK,
} from "./quality-metrics.mjs";

/** A human review is explicit metadata, never inferred from an implementation-authored fixture. */
function reviewed(id, recommended, prompt) {
  return {
    id,
    review: {
      status: "approved",
      reviewerType: "human",
      independent: true,
      blind: true,
      reviewer: "Independent reviewer",
      reviewedAt: "2026-10-01T00:00:00Z",
      recommended,
      prompt,
      rationale: "Reviewed against the exact source and brief.",
    },
  };
}

test("pending and implementation-authored labels never yield accuracy claims", () => {
  const cases = [
    { id: "pending", review: { status: "pending" } },
    {
      ...reviewed("ai", true, true),
      review: { ...reviewed("ai", true, true).review, reviewer: "Codex" },
    },
  ];
  assert.equal(
    qualityMetrics(cases, [{ id: "pending", accepted: true }]).precision,
    null,
  );
  assert.equal(qualityMetrics(cases, []).pendingCases, 2);
});
test("retrieval misses and private assessment exclusions are measured separately", () => {
  const cases = [
    reviewed("a", true, false),
    reviewed("b", true, false),
    reviewed("c", false, false),
  ];
  const results = [
    { id: "a", accepted: true, retrieved: false, prompt: false },
    { id: "b", accepted: false, retrieved: true, prompt: false },
    { id: "c", accepted: true, retrieved: true, prompt: true },
  ];
  const metrics = qualityMetrics(cases, results);
  assert.equal(metrics.precision, 0.5);
  assert.equal(metrics.assessmentRecall, 0.5);
  assert.equal(metrics.retrievalRecall, 0.5);
  assert.equal(metrics.pipelineRecall, 0);
  assert.equal(metrics.falsePrompts, 1);
});

test("missing and malformed measurements stay out of recall with visible coverage", () => {
  const cases = [
    reviewed("a", true, false),
    reviewed("b", true, false),
    reviewed("c", true, false),
  ];
  const metrics = qualityMetrics(cases, [
    { id: "a", accepted: true, retrieved: true, prompt: false },
    { id: "b", error: "timeout" },
    { id: "c", retrieved: true },
  ]);
  assert.equal(metrics.measurementCoverage, 1 / 3);
  assert.equal(metrics.unmeasuredReviewedCases, 2);
  assert.equal(metrics.fullyReviewedAndMeasured, false);
  assert.equal(metrics.falseExclusions, 0);
  assert.throws(
    () => qualityMetrics(cases, [{ id: "a" }, { id: "a" }]),
    /Duplicate/,
  );
});
test("ranking has known discounted gain and does not report partial review uplift", () => {
  const score = rankingAtK(["wrong", "right"], new Set(["right", "missed"]), 2);
  assert.equal(score.precisionAtK, 0.5);
  assert.equal(score.recallAtK, 0.5);
  assert.equal(score.reciprocalRank, 0.5);
  assert.ok(Math.abs(score.ndcgAtK - 0.38685280723454163) < 1e-10);
  const corpus = {
    postings: [{ id: "p1" }, { id: "p2" }],
    briefs: [{ id: "brief", feedbackHistory: [{}] }],
    cases: [reviewed("a", false, false), reviewed("b", true, false)].map(
      (item) => ({ ...item, briefId: "brief" }),
    ),
  };
  const results = [
    {
      id: "a",
      accepted: true,
      retrieved: true,
      prompt: false,
      candidateOrder: 0,
      feedbackOrder: 1,
      ranking: { baseline: 2, feedback: 2 },
    },
    {
      id: "b",
      accepted: true,
      retrieved: true,
      prompt: false,
      candidateOrder: 1,
      feedbackOrder: 0,
      ranking: { baseline: 2, feedback: 3 },
    },
  ];
  assert.ok(rankingMetrics(corpus, results).meanNdcgDelta > 0);
  corpus.cases[1].review = { status: "pending" };
  assert.equal(rankingMetrics(corpus, results).meanNdcgDelta, null);
});
