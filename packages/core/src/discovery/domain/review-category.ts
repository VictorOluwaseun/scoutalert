import type { LeadReview, LeadReviewInput } from "./lead-review.js";

/** Preserves the engagement kind of a complete parser-confirmed buyer brief after citation validation. Only positive demand labels are normalized; closed, ambiguous and seller verdicts remain authoritative. */
export function normalizeBuyerReview(
  input: LeadReviewInput,
  review: LeadReview,
): LeadReview {
  if (
    input.scope !== "source" ||
    input.truncated ||
    input.collection ||
    input.sourceKind !== "buyer_brief" ||
    !["job_opening", "client_request"].includes(review.label)
  ) {
    return review;
  }
  const category = review.analysis.facts.category;
  return {
    ...review,
    label: "client_request",
    analysis: {
      ...review.analysis,
      facts: {
        ...review.analysis.facts,
        category:
          category.status === "stated"
            ? { ...category, value: "client_request" }
            : category,
      },
    },
  };
}
