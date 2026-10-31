import {
  factNames,
  validAnalysis,
  type Posting,
  type PostingFact,
} from "../../scouting/public.js";
import {
  leadLabels,
  type LeadReview,
  type LeadReviewInput,
} from "./lead-review.js";

/** Validates quotations against this exact input; a model cannot supply its own supporting evidence. */
function supported(fact: PostingFact, text: string): boolean {
  return (
    fact.quotes.every(
      (quote) => quote.trim().length >= 3 && text.includes(quote),
    ) &&
    (fact.status === "unknown"
      ? fact.quotes.length === 0 && !fact.value.trim()
      : fact.quotes.length > 0)
  );
}

/** Citation checks constrain acceptance; semantic classification quality still needs independent evaluation. */
export function validLeadReview(
  input: LeadReviewInput,
  review: LeadReview,
): boolean {
  const facts = [
    ...factNames.map((name) => review.analysis.facts[name]),
    review.company,
    review.deadline,
    review.application,
  ];
  const posting: Posting = {
    id: input.id,
    source: "review",
    externalId: input.url,
    familyId: input.id,
    company: null,
    location: null,
    sourceUpdatedAt: null,
    title: "",
    text: input.text,
    url: input.url,
    fingerprint: input.fingerprint,
    version: 1,
  };
  return (
    (!input.collection ||
      (review.label === "directory" &&
        facts.every((fact) => fact.status === "unknown") &&
        Object.values(review.analysis.pay).every((value) => value === null))) &&
    leadLabels.includes(review.label) &&
    review.explanation.length > 0 &&
    review.explanation.length <= 600 &&
    (review.label === "unclear" || review.quotes.length > 0) &&
    review.quotes.every(
      (quote) => quote.trim().length >= 3 && input.text.includes(quote),
    ) &&
    facts.every((fact) => supported(fact, input.text)) &&
    validAnalysis(posting, review.analysis) &&
    !review.analysis.research &&
    (input.scope === "source" ||
      (facts.every((fact) => fact.status === "unknown") &&
        Object.values(review.analysis.pay).every((value) => value === null)))
  );
}

/** Permits a single grounded demand item only; unknown optional identity fields stay null. */
export function mayPublishLead(
  input: LeadReviewInput,
  review: LeadReview,
  now: Date,
): boolean {
  const role = review.analysis.facts.role;
  const expired =
    review.deadline.status === "stated" &&
    (!Number.isFinite(Date.parse(review.deadline.value)) ||
      Date.parse(review.deadline.value) <= now.getTime());
  return (
    validLeadReview(input, review) &&
    input.scope === "source" &&
    input.availability !== "closed" &&
    !input.collection &&
    !input.truncated &&
    ["job_opening", "client_request"].includes(review.label) &&
    role.status === "stated" &&
    role.value.trim().length >= 3 &&
    role.value.length <= 500 &&
    role.quotes.some((quote) =>
      quote.toLowerCase().includes(role.value.toLowerCase()),
    ) &&
    review.deadline.status !== "conflicting" &&
    !expired
  );
}
