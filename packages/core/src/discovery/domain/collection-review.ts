import {
  factNames,
  type PostingAnalysis,
  type PostingFact,
} from "../../scouting/public.js";
import type { LeadReview, LeadReviewInput } from "./lead-review.js";

/** Classifies parser-confirmed collection structure without buying model inference or asserting facts about its entries. */
export function collectionDirectoryReview(
  input: LeadReviewInput,
): LeadReview | null {
  if (
    !input.collection ||
    input.scope !== "source" ||
    input.truncated ||
    !input.text.startsWith(
      input.collection === "feed" ? "Feed directory:" : "Sitemap directory:",
    )
  ) {
    return null;
  }
  return {
    label: "directory",
    explanation:
      "A public collection lists links to separate items. Each item needs its own source review before matching.",
    quotes: [
      input.collection === "feed" ? "Feed directory:" : "Sitemap directory:",
    ],
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

/** Keeps every entry-level claim unconfirmed; the collection's wording cannot establish a listing's eligibility. */
function unknown(): PostingFact {
  return { status: "unknown", value: "", quotes: [] };
}
