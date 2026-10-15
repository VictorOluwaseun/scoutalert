import { describe, it, expect } from "vitest";
import {
  mayPublishLead,
  validLeadReview,
  normalizeReviewDeadline,
  normalizeBuyerReview,
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
  it("keeps relative closing counters unknown instead of blocking an open brief or inventing its closing date", () => {
    const source = { ...input, text: `${input.text} Ends in 6 days` };
    for (const value of ["Ends in 6 days", "2099-10-18"]) {
      const review = demandReview(source);
      review.deadline = { status: "stated", value, quotes: ["Ends in 6 days"] };
      const normalized = normalizeReviewDeadline(review);
      expect(normalized.deadline).toEqual({
        status: "unknown",
        value: "",
        quotes: [],
      });
      expect(mayPublishLead(source, normalized, new Date())).toBe(true);
      expect(review.deadline.status).toBe("stated");
    }
  });
  it("canonicalizes a source-supported unknown countdown before shape validation without accepting fabricated or calendar evidence", () => {
    const source = { ...input, text: `${input.text}\nEnds in 28 days` };
    const review = demandReview(source);
    review.deadline = {
      status: "unknown",
      value: "",
      quotes: ["Ends in 28 days"],
    };
    expect(validLeadReview(source, review)).toBe(false);
    expect(
      mayPublishLead(
        source,
        normalizeReviewDeadline(review, source.text),
        new Date(),
      ),
    ).toBe(true);
    expect(normalizeReviewDeadline(review)).toBe(review);
    review.deadline.quotes.push("Invented deadline evidence");
    expect(normalizeReviewDeadline(review, source.text)).toBe(review);
    review.deadline.quotes = ["Ends in 28 days", "Deadline January 1, 2020"];
    const dated = `${source.text}\nDeadline January 1, 2020`;
    expect(normalizeReviewDeadline(review, dated)).toBe(review);
    review.deadline = {
      status: "conflicting",
      value: "unclear",
      quotes: ["Ends in 28 days"],
    };
    expect(normalizeReviewDeadline(review, source.text)).toBe(review);
  });

  it.each(["2020-01-01", "1 January 2020", "January 1, 2020", "01/01/2020"])(
    "preserves calendar evidence %s even beside a stale relative counter",
    (date) => {
      const review = demandReview(input);
      review.deadline = {
        status: "stated",
        value: "2020-01-01",
        quotes: [`Closes in 6 days. Deadline ${date}.`],
      };
      expect(normalizeReviewDeadline(review)).toBe(review);
      review.deadline.status = "conflicting";
      expect(normalizeReviewDeadline(review)).toBe(review);
    },
  );
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

  it("keeps parser-confirmed buyer demand in the service category without promoting negative or incomplete evidence", () => {
    const source = { ...input, sourceKind: "buyer_brief" as const };
    const review = demandReview(source);
    review.analysis.facts.category.value = "contract";
    const normalized = normalizeBuyerReview(source, review);
    expect(normalized.label).toBe("client_request");
    expect(normalized.analysis.facts.category.value).toBe("client_request");
    expect(normalized.analysis.facts.category.quotes).toEqual(
      review.analysis.facts.category.quotes,
    );
    expect(validLeadReview(source, normalized)).toBe(true);
    expect(normalizeBuyerReview(input, review)).toBe(review);
    expect(normalizeBuyerReview({ ...source, truncated: true }, review)).toBe(
      review,
    );
    expect(
      normalizeBuyerReview({ ...source, scope: "search_excerpt" }, review),
    ).toBe(review);
    for (const label of [
      "closed",
      "unclear",
      "directory",
      "service_offer",
    ] as const) {
      const negative = { ...review, label };
      expect(normalizeBuyerReview(source, negative)).toBe(negative);
      expect(mayPublishLead(source, negative, new Date())).toBe(false);
    }
    review.analysis.facts.category.status = "unknown";
    expect(
      normalizeBuyerReview(source, review).analysis.facts.category.status,
    ).toBe("unknown");
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
