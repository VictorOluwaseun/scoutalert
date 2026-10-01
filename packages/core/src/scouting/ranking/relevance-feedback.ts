import { roleTerms } from "../domain/assess-posting.js";
import type { Assessment, Posting } from "../domain/discovery.js";

/** An explicit positive example, private to its owner; hiding is not a negative training label. */
export interface RelevantExample {
  title: string;
  kind: "job" | "client_request";
}

/** Supplies bounded, current explicit feedback without exposing another person's preferences. */
export abstract class RelevanceFeedbackRepository {
  /** Returns up to 100 relevant examples from the past 90 days; undo immediately removes a signal. */
  abstract examples(ownerId: string): Promise<RelevantExample[]>;
}

/** Uses title terms only; never reads private residence, authorization declarations or biographical fields. */
export function feedbackAffinity(
  posting: Posting,
  examples: RelevantExample[],
): string[] {
  const terms = roleTerms(posting.title);
  const matches = examples
    .filter((example) => example.kind === (posting.kind ?? "job"))
    .map((example) =>
      roleTerms(example.title).filter((term) => terms.includes(term)),
    );

  // Two shared role/task terms are required; repeated clicks cannot amplify the score.
  return (
    matches
      .filter((overlap) => overlap.length >= 2)
      .sort((left, right) => right.length - left.length)[0]
      ?.slice(0, 4) ?? []
  );
}

/** Reorders only the already retrieved candidate set, retaining its baseline order on ties. */
export function prioritizeWithFeedback(
  postings: Posting[],
  examples: RelevantExample[],
): Posting[] {
  return postings
    .map((posting, index) => ({
      posting,
      index,
      boost: feedbackAffinity(posting, examples).length >= 2 ? 1 : 0,
    }))
    .sort((left, right) => right.boost - left.boost || left.index - right.index)
    .map(({ posting }) => posting);
}

/** Applies a capped one-point preference after all acceptance rules; evidence and alert eligibility stay unchanged. */
export function rankWithFeedback(
  posting: Posting,
  assessment: Assessment,
  examples: RelevantExample[],
): Assessment {
  const terms = feedbackAffinity(posting, examples);
  const boost = terms.length >= 2 ? 1 : 0;

  return {
    ...assessment,
    rank: assessment.rank + boost,
    ranking: { policy: "relevance-feedback-v1", boost, terms },
  };
}
