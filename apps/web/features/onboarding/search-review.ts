import type { ScoutDraft } from "./types";

type ReviewOutcome = { ready: true } | { ready: false; message: string };

/** Sends only explicit search answers for server review; contact and alert consent stay local. */
export async function reviewSearch(draft: ScoutDraft): Promise<ReviewOutcome> {
  const search = {
    goal: draft.goal,
    category: draft.category,
    target: draft.target,
    name: draft.name,
    arrangement: draft.arrangement,
    arrangementRequired: draft.arrangementRequired,
    residence: draft.residence,
    workLocations: draft.workLocations,
    background: draft.background,
    authorizationLocations: draft.authorizationLocations,
    sponsorshipNeed: draft.sponsorshipNeed,
    authorizationConfirmed: draft.authorizationConfirmed,
    minimumPay: draft.minimumPay,
    currency: draft.currency,
    payPeriod: draft.payPeriod,
    unknownEligibility: draft.unknownEligibility,
    undisclosedPay: draft.undisclosedPay,
  };

  try {
    const response = await fetch("/api/onboarding/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ search }),
    });
    const result: unknown = await response.json();

    if (response.ok && isReviewReady(result)) {
      return { ready: true };
    }

    if (response.status === 422) {
      return { ready: false, message: firstIssueMessage(result) };
    }
  } catch {
    return {
      ready: false,
      message: "We couldn’t check your scout right now. Please try again.",
    };
  }

  return {
    ready: false,
    message: "We couldn’t check your scout right now. Please try again.",
  };
}

/** Checks the server's success marker before allowing the review transition. */
function isReviewReady(value: unknown): value is { status: "review_ready" } {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "review_ready"
  );
}

/** Extracts a safe first validation message from the API's issue list. */
function firstIssueMessage(value: unknown): string {
  if (typeof value !== "object" || value === null || !("issues" in value)) {
    return "Check your search details and try again.";
  }

  const issues = value.issues;

  if (!Array.isArray(issues)) {
    return "Check your search details and try again.";
  }

  const message: unknown = issues[0]?.message;

  if (typeof message !== "string") {
    return "Check your search details and try again.";
  }

  return message;
}
