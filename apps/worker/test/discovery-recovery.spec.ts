import { describe, expect, it } from "vitest";
import {
  PlanScoutSearch,
  planDiscovery,
  type DiscoveryExploration,
  type DiscoveryReasoningInput,
} from "@repo/core/discovery";
import { search } from "./fixtures/intelligence.js";
import { demandReview } from "./fixtures/lead-review.js";

/** Supplies actual searches and source reviews so missing provider work cannot masquerade as a stalled search. */
function stalled(): DiscoveryExploration {
  const plan = planDiscovery(
    { ...search, category: "services", target: "Website redesign" },
    1,
    6,
    undefined,
    true,
  );
  plan.policy = "public-intent-v3";
  plan.exploration!.candidatePolicy = "contextual-v1";
  return {
    plan,
    round: 2,
    operations: [0, 1].map((index) => ({
      key: `search-${index}`,
      depth: 0,
      input: { kind: "search", query: plan.queries[index]! },
      result: {
        kind: "search",
        checkedAt: new Date().toISOString(),
        observations: [
          {
            url: `https://example.org/brief/${index}`,
            title: "Website redesign request",
            snippet: "Need a new website; proposals open.",
            rank: 1,
          },
        ],
      },
    })),
    reviews: [0, 1].map((index) => ({
      url: `https://example.org/reviewed/${index}`,
      scope: "source",
      review: {
        ...demandReview({
          id: `review-${index}`,
          url: `https://example.org/reviewed/${index}`,
          fingerprint: `review-${index}`,
          scope: "source",
          truncated: false,
          text: "We offer website design services.",
          observedAt: new Date().toISOString(),
          documentFingerprint: `review-${index}`,
        }),
        label: "service_offer",
      },
    })),
  };
}

describe("selective discovery recovery", () => {
  it.each(["stalled", "missing_reviews", "useful_source", "disabled"])(
    "uses the expert phase only for a verified stall: %s",
    async (mode) => {
      const snapshot = stalled();
      if (mode === "missing_reviews") {
        snapshot.reviews = [];
      }
      if (mode === "useful_source") {
        snapshot.reviews![0]!.review.label = "client_request";
      }
      const claims: { phase: string; input: DiscoveryReasoningInput }[] = [];
      const planner = new PlanScoutSearch(
        {
          /** Terminal expert failure must permit the bounded ordinary fallback without a paid retry. */
          async claim(_request, phase, _configuration, input) {
            claims.push({ phase, input });
            return { status: "unavailable" as const };
          },
          /** No generation occurs in this fallback fixture. */ async complete() {},
          /** No generation occurs in this fallback fixture. */ async fail() {},
        },
        {
          configuration: "recovery-fixture",
          /** All records are unavailable in this fixture. */ async reason(): Promise<never> {
            throw new Error("unexpected_provider");
          },
        },
        mode !== "disabled",
      );
      await planner.next(
        { ownerId: "owner", scoutId: "scout", runId: "run", version: 1 },
        snapshot,
      );
      expect(claims.map((claim) => claim.phase)).toEqual(
        mode === "stalled" ? ["expert-recovery", "choice:2"] : ["choice:2"],
      );
      expect(
        claims.some(
          ({ input }) =>
            input.kind === "choice" &&
            input.expertReview === "stalled_discovery",
        ),
      ).toBe(mode === "stalled");
    },
  );
});
