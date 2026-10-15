import assert from "node:assert/strict";
import test from "node:test";
import { summarizeLiveQuality } from "./live-quality-summary.mjs";

/** Supplies measured but unjudged output, including one unknown-cost attempt. */
function report() {
  return {
    scenario: "services",
    durationMs: 1000,
    operations: [],
    leads: [{ review: { scope: "source", label: "client_request" } }],
    reasoning: [{ cost: { estimatedMicrousd: 1000 } }],
    reviewAttempts: [{ cost: null }],
    intelligence: [],
    usage: [{ provider: "serper", requests: 1, reserved_micros: "10000" }],
    aiBudget: [{ reserved_microusd: "150000" }],
    case: { leadCount: 55 },
    opportunities: [],
    emailsSent: 0,
  };
}

test("zero recommendations never implies free useful results or measured recall", () => {
  const summary = summarizeLiveQuality(report());
  assert.equal(summary.uniqueLeads, 55);
  assert.equal(summary.sourceReviewCountsAreComplete, false);
  assert.equal(summary.aiEstimatedUsd, 0.001);
  assert.equal(summary.searchReservedUsd, 0.01);
  assert.equal(summary.attemptsWithoutCostEstimate, 1);
  assert.equal(summary.costPerIndependentlyUsefulResultUsd, null);
  assert.equal(
    summary.estimatedAiPlusSearchReservationPerRecommendationUsd,
    null,
  );
  assert.equal(summary.precision, null);
  assert.equal(summary.recall, null);
});

test("a delivered model recommendation does not become human ground truth", () => {
  const summary = summarizeLiveQuality({
    ...report(),
    dashboardLeadSampleSize: 1,
    opportunities: [{}],
    emailsSent: 1,
  });
  assert.equal(summary.sourceReviewCountsAreComplete, true);
  assert.equal(summary.acceptedEmails, 1);
  assert.equal(
    summary.estimatedAiPlusSearchReservationPerRecommendationUsd,
    0.011,
  );
  assert.equal(summary.independentlyUsefulResults, null);
});

test("provider failures are not reported as successful searches with no demand", () => {
  const summary = summarizeLiveQuality({
    ...report(),
    operations: [{ kind: "search", state: "failed" }],
    intelligence: [
      { posting_id: "p1", kind: "fit", outcome: "ready", cost: null },
      { posting_id: "p1", kind: "fit", outcome: "ready", cost: null },
    ],
  });
  assert.equal(summary.executionStatus, "search_provider_unavailable");
  assert.equal(summary.successfulSearches, 0);
  assert.equal(summary.failedSearches, 1);
  assert.equal(summary.completedFitAssessments, 1);
});
