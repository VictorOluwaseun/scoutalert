import {
  factNames,
  type PostingAnalysis,
  type PostingFact,
} from "../../scouting/public.js";
import type { LeadReview, LeadReviewInput } from "./lead-review.js";

/** Classifies parser-confirmed feed structure without buying model inference or asserting facts about its entries. */
export function feedDirectoryReview(input: LeadReviewInput): LeadReview | null {
  if (
    input.collection !== "feed" ||
    input.scope !== "source" ||
    input.truncated ||
    !input.text.startsWith("Feed directory:")
  ) {
    return null;
  }
  return {
    label: "directory",
    explanation:
      "A public feed lists links to separate items. Each item needs its own source review before matching.",
    quotes: ["Feed directory:"],
    company: unknown(),
    deadline: unknown(),
    application: unknown(),
    analysis: {
      facts: Object.fromEntries(
        factNames.map((name) => [name, unknown()]),
      ) as PostingAnalysis["facts"],
      pay: { minimum: null, maximum: null, currency: null, period: null },
    },
  };
}

/** Keeps every entry-level claim unconfirmed; the feed's wording cannot establish a listing's eligibility. */
function unknown(): PostingFact {
  return { status: "unknown", value: "", quotes: [] };
}
