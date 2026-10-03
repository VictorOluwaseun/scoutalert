import {
  LeadReviewProvider,
  type LeadReview,
  type LeadReviewInput,
  type LeadReviewResult,
} from "@repo/core/discovery";
import {
  factNames,
  criterionNames,
  IntelligenceProvider,
  type IntelligenceResult,
  type Posting,
  type PostingAnalysis,
  type PostingFact,
} from "@repo/core/scouting";
import type { SearchDraft } from "@repo/core/onboarding";

export const reviewUsage = {
  model: "fixture",
  inputTokens: 100,
  outputTokens: 100,
  durationMs: 1,
  responseId: "fixture-review",
};

/** Supplies explicit unknowns so a synthetic result cannot accidentally imply confirmed source facts. */
function unknown(): PostingFact {
  return { status: "unknown", value: "", quotes: [] };
}

/** Creates cited deterministic demand for persistence tests; this does not measure model classification quality. */
export function demandReview(input: LeadReviewInput): LeadReview {
  const analysis: PostingAnalysis = {
    facts: Object.fromEntries(
      factNames.map((name) => [name, unknown()]),
    ) as PostingAnalysis["facts"],
    pay: { minimum: null, maximum: null, currency: null, period: null },
  };
  const review: LeadReview = {
    label: "job_opening",
    explanation: "A specific opening is requested.",
    quotes: [input.text],
    company: unknown(),
    deadline: unknown(),
    application: unknown(),
    analysis,
  };
  if (input.scope === "search_excerpt") {
    return review;
  }
  analysis.facts.role = {
    status: "stated",
    value: input.text.includes("UX researcher")
      ? "UX researcher"
      : "Product designer",
    quotes: [input.text],
  };
  analysis.facts.arrangement = {
    status: "stated",
    value: "remote",
    quotes: [input.text],
  };
  analysis.facts.category = {
    status: "stated",
    value: "employment",
    quotes: [input.text],
  };
  review.application = {
    status: "stated",
    value: "Apply through this page",
    quotes: [input.text],
  };
  return review;
}

/** Fixed evidence provider tests batching, reuse and fencing without external calls. */
export class FixtureLeadProvider extends LeadReviewProvider {
  readonly configuration = "fixture-leads-v1";
  calls = 0;
  /** Returns a separate cited verdict for each immutable input. */
  async review(inputs: LeadReviewInput[]): Promise<LeadReviewResult> {
    this.calls++;
    return {
      reviews: inputs.map((input) => ({
        id: input.id,
        review: demandReview(input),
      })),
      usage: reviewUsage,
    };
  }
}

/** Fixed personal assessment verifies that source review reuse still requires a separate private fit. */
export class FixtureWebFitProvider extends IntelligenceProvider {
  readonly configuration = "fixture-web-fit-v1";
  calls = 0;
  /** Extraction must be reused from public source review, so an extra call fails the test. */
  async extract(): Promise<IntelligenceResult & { kind: "extraction" }> {
    throw new Error("duplicate_extraction");
  }
  /** Makes only role, category and arrangement claims; other requirements remain unknown. */
  async assess(
    posting: Posting,
    search: SearchDraft,
  ): Promise<IntelligenceResult & { kind: "fit" }> {
    this.calls++;
    return {
      kind: "fit",
      usage: reviewUsage,
      fit: {
        criteria: criterionNames.map((criterion) => ({
          criterion,
          status: ["role", "category", "arrangement"].includes(criterion)
            ? "meets"
            : "unknown",
          explanation: `${criterion} comparison`,
          quotes: [posting.text],
          briefQuotes: [search.target],
        })),
      },
    };
  }
}
