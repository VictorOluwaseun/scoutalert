import type { LeadReview } from "./lead-review.js";

const relativeClosingCounter =
  /\b(?:ends?|closes?|expires?)\s+in\s+\d+\s+(?:minutes?|hours?|days?|weeks?)\b/iu;
const calendarDate =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}\b|\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/iu;

/** Keeps cited relative counters as unknown absolute dates. Before full review validation, evidenceText is required and every deadline quotation must match it. Without text, call only after citation validation. Calendar evidence, conflicts and fabricated quotations remain unchanged for normal rejection. */
export function normalizeReviewDeadline(
  review: LeadReview,
  evidenceText?: string,
): LeadReview {
  const deadline = review.deadline;
  if (
    (deadline.status !== "stated" &&
      !(deadline.status === "unknown" && evidenceText !== undefined)) ||
    (evidenceText !== undefined &&
      !deadline.quotes.every(
        (quote) => quote.trim().length >= 3 && evidenceText.includes(quote),
      )) ||
    !deadline.quotes.some((quote) => relativeClosingCounter.test(quote)) ||
    deadline.quotes.some((quote) => calendarDate.test(quote))
  ) {
    return review;
  }

  return {
    ...review,
    deadline: { status: "unknown", value: "", quotes: [] },
  };
}
