import { describe, it, expect } from "vitest";
import {
  mayPublishLead,
  validLeadReview,
  type LeadReviewInput,
} from "@repo/core/discovery";
import { assessPosting, normalizeArrangement } from "@repo/core/scouting";
import { hasUnavailablePosting } from "@repo/core/notifications";
import { demandReview } from "./fixtures/lead-review.js";
import { posting, search } from "./fixtures/intelligence.js";

const input: LeadReviewInput = {
  id: "fixture",
  url: "https://example.org/design",
  text: "Product designer wanted. Permanent remote employment. Apply through this page.",
  fingerprint: "fixture-v1",
  scope: "source",
  truncated: false,
  observedAt: new Date().toISOString(),
  documentFingerprint: "document-v1",
};

describe("public lead evidence admission", () => {
  it("admits complete cited demand while preserving missing company, location and compensation", () => {
    const review = demandReview(input);
    expect(validLeadReview(input, review)).toBe(true);
    expect(mayPublishLead(input, review, new Date())).toBe(true);
    expect(review.company.status).toBe("unknown");
    expect(review.analysis.facts.location.status).toBe("unknown");
    expect(review.analysis.pay.minimum).toBeNull();
  });
  it.each([
    "service_offer",
    "discussion",
    "directory",
    "closed",
    "unclear",
  ] as const)("withholds %s even if it contains a role title", (label) => {
    expect(
      mayPublishLead(input, { ...demandReview(input), label }, new Date()),
    ).toBe(false);
  });
  it("keeps snippets and truncated pages out of matching, and rejects snippet-derived facts", () => {
    const excerpt = { ...input, scope: "search_excerpt" as const };
    expect(validLeadReview(excerpt, demandReview(excerpt))).toBe(true);
    expect(mayPublishLead(excerpt, demandReview(excerpt), new Date())).toBe(
      false,
    );
    expect(validLeadReview(excerpt, demandReview(input))).toBe(false);
    expect(
      mayPublishLead(
        { ...input, truncated: true },
        demandReview(input),
        new Date(),
      ),
    ).toBe(false);
  });
  it("rejects fabricated citations and an invented role title", () => {
    const review = demandReview(input);
    review.analysis.facts.location = {
      status: "stated",
      value: "Worldwide",
      quotes: ["Anyone worldwide can apply"],
    };
    expect(validLeadReview(input, review)).toBe(false);
    const invented = demandReview(input);
    invented.analysis.facts.role.value = "Chief financial officer";
    expect(mayPublishLead(input, invented, new Date())).toBe(false);
  });
  it("withholds elapsed, ambiguous and conflicting deadlines", () => {
    for (const value of ["2020-01-01", "soon"]) {
      const review = demandReview(input);
      review.deadline = { status: "stated", value, quotes: [input.text] };
      expect(mayPublishLead(input, review, new Date())).toBe(false);
    }
    const review = demandReview(input);
    review.deadline = {
      status: "conflicting",
      value: "unclear date",
      quotes: [input.text],
    };
    expect(mayPublishLead(input, review, new Date())).toBe(false);
  });
  it("does not store contract or payment terms as a work arrangement", () => {
    const review = demandReview(input);
    review.analysis.facts.arrangement = {
      status: "stated",
      value: "Permanent contract; Full-time",
      quotes: ["Permanent contract; Full-time"],
    };
    expect(normalizeArrangement(review.analysis).facts.arrangement).toEqual({
      status: "unknown",
      value: "",
      quotes: [],
    });
    review.analysis.facts.arrangement = {
      status: "stated",
      value: "remote",
      quotes: ["Fixed price project"],
    };
    expect(normalizeArrangement(review.analysis).facts.arrangement.status).toBe(
      "unknown",
    );
    expect(
      normalizeArrangement(demandReview(input).analysis).facts.arrangement
        .status,
    ).toBe("stated");
  });

  it("cannot fall back to title matching when AI is unavailable for a web candidate", () => {
    expect(
      assessPosting(search, { ...posting, source: "web-discovery" }),
    ).toBeNull();
    expect(
      assessPosting(search, {
        ...posting,
        kind: "client_request",
        source: "web-client-requests",
      }),
    ).toBeNull();
  });
  it("withholds web alerts without fresh source evidence", () => {
    const opportunity = {
      ...posting,
      checkedAt: new Date().toISOString(),
      scouts: [],
      reasons: [],
      uncertainties: [],
      requiresFreshSource: true,
    };
    expect(hasUnavailablePosting(opportunity, new Date())).toBe(true);
    expect(
      hasUnavailablePosting(
        {
          ...opportunity,
          availability: {
            status: "available",
            checkedAt: new Date(Date.now() - 16 * 60_000).toISOString(),
            sourceUrl: posting.url,
            fingerprint: posting.fingerprint,
          },
        },
        new Date(),
      ),
    ).toBe(true);
  });
});
