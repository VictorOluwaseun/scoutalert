import { test } from "node:test";
import assert from "node:assert/strict";
import {
  corpusHash,
  validateCorpus,
  applyReviews,
  isHumanReview,
} from "./corpus.mjs";

/** Creates explicitly synthetic test metadata; these labels are never written to a public-source corpus. */
function fixture() {
  const corpus = {
    schema: 2,
    postings: [{ id: "p" }],
    documents: {},
    briefs: [
      {
        id: "b",
        feedbackHistory: [],
        search: {
          goal: "Find remote design roles",
          category: "employment",
          name: "Design scout",
          target: "Product Designer",
          arrangement: "remote",
          arrangementRequired: true,
          residence: "Lagos, Nigeria",
          workLocations: "Nigeria",
          background: "Five years of design experience",
          minimumPay: "",
          currency: "USD",
          payPeriod: "year",
          unknownEligibility: "review",
          undisclosedPay: "include",
        },
      },
    ],
    cases: [
      {
        id: "b:p",
        briefId: "b",
        postingId: "p",
        review: { status: "pending" },
      },
    ],
  };

  return { ...corpus, contentHash: corpusHash(corpus) };
}

/** Exercises the attestation contract without claiming that these unit fixtures are independent judgments. */
function packet(corpus) {
  return {
    schema: 1,
    corpusHash: corpus.contentHash,
    reviews: [
      {
        id: "b:p",
        review: {
          status: "approved",
          reviewerType: "human",
          reviewer: "Fixture reviewer",
          independent: true,
          blind: true,
          reviewedAt: new Date().toISOString(),
          recommended: true,
          prompt: false,
          rationale: "Synthetic test data only, never a quality label.",
        },
      },
    ],
  };
}

test("review imports preserve evidence and reject conflicting, forged-scope and incomplete packets", () => {
  const corpus = fixture();
  const reviews = packet(corpus);
  const updated = applyReviews(corpus, reviews);
  assert.equal(updated.contentHash, corpus.contentHash);
  assert.equal(corpus.cases[0].review.status, "pending");
  assert.equal(updated.cases[0].review.status, "approved");
  assert.throws(
    () => applyReviews(corpus, { ...reviews, corpusHash: "different" }),
    /another corpus/,
  );
  assert.throws(
    () =>
      applyReviews(corpus, {
        ...reviews,
        reviews: [...reviews.reviews, ...reviews.reviews],
      }),
    /Duplicate/,
  );
  reviews.reviews[0].review.recommended = false;
  assert.throws(() => applyReviews(updated, reviews), /Conflicting/);
  reviews.reviews[0].review.prompt = true;
  assert.equal(isHumanReview(reviews.reviews[0].review), false);
});
test("duplicate pairs and prior-feedback leakage cannot enter an evaluation", () => {
  const corpus = fixture();
  corpus.cases.push({ ...corpus.cases[0], id: "duplicate-pair" });
  assert.throws(() => validateCorpus(corpus), /Duplicate evaluation pair/);
  corpus.cases.pop();
  corpus.briefs[0].feedbackHistory = [
    {
      title: "Example",
      kind: "job",
      postingId: "p",
      provenance: "synthetic-prior-feedback",
    },
  ];
  corpus.contentHash = corpusHash(corpus);
  assert.throws(() => validateCorpus(corpus), /leaks/);
});

test("brief readiness and case identity are checked before any evaluation side effects", () => {
  const invalid = fixture();
  invalid.briefs[0].search.authorizationConfirmed = true;
  invalid.contentHash = corpusHash(invalid);
  assert.throws(() => validateCorpus(invalid), /Invalid synthetic brief/);
  const wrong = fixture();
  wrong.cases[0].id = "another-case";
  assert.throws(() => validateCorpus(wrong), /Pair ID/);
});
