import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ReviewSearchDraft } from "../../packages/core/dist/onboarding/public.js";

/** Hashes frozen evidence and synthetic inputs; labels are independently versioned and never alter source identity. */
export function corpusHash(corpus) {
  const { postings, documents, briefs } = corpus;
  return createHash("sha256")
    .update(JSON.stringify({ postings, documents, briefs }))
    .digest("hex");
}

/** Rejects duplicate or dangling evaluation pairs before they can bias coverage or quality measurements. */
export function validateCorpus(corpus) {
  assert.ok([1, 2].includes(corpus.schema), "Unsupported corpus schema");
  assert.equal(
    corpus.contentHash,
    corpusHash(corpus),
    "Frozen corpus content changed",
  );
  for (const key of ["postings", "briefs", "cases"]) {
    assert.ok(corpus[key].length > 0, `Empty ${key}`);
    assert.equal(
      new Set(corpus[key].map((item) => item.id)).size,
      corpus[key].length,
      `Duplicate ${key}`,
    );
  }
  assert.ok(
    corpus.cases.length <= 1000,
    "Maximum 1,000 explicit evaluation pairs",
  );
  const pairs = new Set();
  for (const entry of corpus.cases) {
    assert.ok(
      corpus.briefs.some((item) => item.id === entry.briefId),
      "Missing brief",
    );
    assert.ok(
      corpus.postings.some((item) => item.id === entry.postingId),
      "Missing posting",
    );
    const pair = `${entry.briefId}:${entry.postingId}`;
    assert.ok(!pairs.has(pair), "Duplicate evaluation pair");
    assert.equal(
      entry.id,
      pair,
      "Pair ID does not match its frozen brief and posting",
    );
    pairs.add(pair);
  }
  // Prior feedback is an explicit synthetic input, never a label derived from the evaluation answers.
  for (const brief of corpus.briefs) {
    const checked = new ReviewSearchDraft().execute(brief.search);
    assert.ok(
      checked.ready,
      `Invalid synthetic brief ${brief.id}: ${JSON.stringify(checked.issues ?? [])}`,
    );
    for (const example of brief.feedbackHistory ?? []) {
      assert.equal(example.provenance, "synthetic-prior-feedback");
      assert.ok(
        !corpus.postings.some((posting) => posting.id === example.postingId),
        "Feedback leaks a held-out posting",
      );
    }
  }
  return corpus;
}

/** Accepts explicit human attestations, not generated fixtures; identity cannot be independently verified by this local tool. */
export function isHumanReview(review) {
  return (
    review?.status === "approved" &&
    review.reviewerType === "human" &&
    review.independent === true &&
    review.blind === true &&
    typeof review.reviewer === "string" &&
    review.reviewer.trim().length >= 2 &&
    !/^(codex|chatgpt|openai|assistant|ai)$/i.test(review.reviewer.trim()) &&
    Number.isFinite(Date.parse(review.reviewedAt)) &&
    typeof review.recommended === "boolean" &&
    typeof review.prompt === "boolean" &&
    (!review.prompt || review.recommended) &&
    typeof review.rationale === "string" &&
    review.rationale.trim().length >= 12
  );
}

/** Validates the complete import first; partial imports cannot overwrite an earlier independent judgment. */
export function applyReviews(corpus, packet) {
  validateCorpus(corpus);
  assert.equal(packet.schema, 1, "Unsupported review format");
  assert.equal(
    packet.corpusHash,
    corpus.contentHash,
    "Review belongs to another corpus",
  );
  assert.ok(
    Array.isArray(packet.reviews) && packet.reviews.length > 0,
    "No completed reviews",
  );
  assert.equal(
    new Set(packet.reviews.map((entry) => entry.id)).size,
    packet.reviews.length,
    "Duplicate review IDs",
  );
  const updates = new Map();
  for (const entry of packet.reviews) {
    const previous = corpus.cases.find((item) => item.id === entry.id);
    assert.ok(previous, "Review references an unknown pair");
    assert.ok(
      isHumanReview(entry.review),
      `Incomplete human attestation: ${entry.id}`,
    );
    assert.ok(
      Date.parse(entry.review.reviewedAt) <= Date.now() + 60_000,
      "Review date is in the future",
    );
    assert.ok(
      !isHumanReview(previous.review) ||
        JSON.stringify(previous.review) === JSON.stringify(entry.review),
      "Conflicting review: use a new corpus label version for adjudication",
    );
    updates.set(entry.id, structuredClone(entry.review));
  }
  return {
    ...corpus,
    cases: corpus.cases.map((entry) => ({
      ...entry,
      review: updates.get(entry.id) ?? entry.review,
    })),
  };
}
