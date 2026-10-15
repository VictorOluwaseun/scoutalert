/** Separates observed throughput and estimated spending from usefulness, which requires independent judgments. */
export function summarizeLiveQuality(report) {
  const searches = report.operations.filter((item) => item.kind === "search");
  const documents = report.operations.filter(
    (item) => item.kind === "document",
  );
  const sourceReviews = report.leads.filter(
    (item) => item.review?.scope === "source",
  );
  const attempts = [
    ...report.reasoning,
    ...report.reviewAttempts,
    ...report.intelligence,
  ];
  const costed = attempts.filter((item) =>
    Number.isFinite(item.cost?.estimatedMicrousd),
  );
  const aiEstimatedUsd =
    costed.reduce((sum, item) => sum + item.cost.estimatedMicrousd, 0) /
    1_000_000;
  const searchReservedUsd =
    report.usage.reduce((sum, item) => sum + Number(item.reserved_micros), 0) /
    1_000_000;
  const aiReservedUsd =
    report.aiBudget.reduce(
      (sum, item) => sum + Number(item.reserved_microusd),
      0,
    ) / 1_000_000;
  const destinations = documents.map(
    (item) => item.retrieved_url ?? item.input.url,
  );
  const completeLeadSet = report.dashboardLeadSampleSize !== undefined;
  return {
    scenario: report.scenario,
    executionStatus:
      searches.length > 0 && searches.every((item) => item.state === "failed")
        ? "search_provider_unavailable"
        : (report.status ?? "not_recorded"),
    successfulSearches: searches.filter((item) => item.state === "succeeded")
      .length,
    failedSearches: searches.filter((item) => item.state === "failed").length,
    renderingEnabled: report.renderingEnabled ?? null,
    durationSeconds: report.durationMs / 1000,
    uniqueLeads: report.case.leadCount,
    recordedLeads: report.leads.length,
    completeLeadSet,
    searchRequests: report.usage
      .filter((item) => item.provider === "serper")
      .reduce((sum, item) => sum + item.requests, 0),
    documentRequests: documents.length,
    capturedDocuments: documents.filter(
      (item) => item.source_status === "fetched",
    ).length,
    completeCaptures: documents.filter(
      (item) => item.source_status === "fetched" && item.capture?.complete,
    ).length,
    inaccessibleDocuments: documents.filter(
      (item) => item.source_status !== "fetched",
    ).length,
    repeatedDestinations: destinations.length - new Set(destinations).size,
    sourceReviewLabels: Object.fromEntries(
      [...new Set(sourceReviews.map((item) => item.review.label))].map(
        (label) => [
          label,
          sourceReviews.filter((item) => item.review.label === label).length,
        ],
      ),
    ),
    sourceReviewCountsAreComplete: completeLeadSet,
    promotedPostings: report.eligiblePostings?.length ?? null,
    matching: report.matchingState?.status ?? "not_recorded",
    completedFitAssessments: new Set(
      report.intelligence
        .filter((item) => item.kind === "fit" && item.outcome === "ready")
        .map((item) => item.posting_id),
    ).size,
    dashboardRecommendations: report.opportunities.length,
    acceptedEmails: report.emailsSent,
    aiEstimatedUsd,
    attemptsWithoutCostEstimate: attempts.length - costed.length,
    searchReservedUsd,
    aiReservedUsd,
    estimatedAiPlusSearchReservationPerRecommendationUsd: report.opportunities
      .length
      ? (aiEstimatedUsd + searchReservedUsd) / report.opportunities.length
      : null,
    independentlyUsefulResults: null,
    costPerIndependentlyUsefulResultUsd: null,
    precision: null,
    recall: null,
    limitations:
      "AI estimates exclude unpriced/failed attempts, infrastructure and billing adjustments. Search reservations are configured upper allowances, not invoices. Source labels and dashboard acceptance are not independent usefulness judgments. Distinct URLs may still describe the same opportunity; repeatedDestinations detects only observed redirect identity. Initial reports recorded a dashboard sample, not every source review.",
  };
}
