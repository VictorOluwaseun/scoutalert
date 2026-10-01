/** Explicit recipient-level feedback applies to a posting across their scouts, never to other people. */
export interface OpportunityFeedback {
  value: "relevant" | "hidden" | "none";
  version: number;
}

/** Public conflict codes protect feedback from stale browser tabs without exposing another owner's records. */
export class FeedbackError extends Error {
  /** Carries a safe failure that transport can map to a missing-record or conflict response. */
  constructor(
    public readonly code:
      "opportunity_not_found" | "feedback_changed" | "request_conflict",
  ) {
    super(code);
    this.name = "FeedbackError";
  }
}

/** Persists feedback and its evidence context under the recipient lock shared with alert preparation. */
export abstract class OpportunityFeedbackRepository {
  /** Checks current ownership/revision and records idempotent feedback without modifying confirmed personal facts. */
  abstract record(
    ownerId: string,
    postingId: string,
    input: OpportunityFeedback & { key: string },
  ): Promise<OpportunityFeedback>;
}

/** Records explicit relevance signals; hidden postings must be suppressed by retrieval, reads and delivery gates. */
export class RecordOpportunityFeedback {
  /** Receives an inward repository; ranking learning remains a separate evaluated policy. */
  constructor(private readonly records: OpportunityFeedbackRepository) {}
  /** Applies the person's choice across their scout contributions to this exact source posting. */
  execute(
    ownerId: string,
    postingId: string,
    input: OpportunityFeedback & { key: string },
  ): Promise<OpportunityFeedback> {
    return this.records.record(ownerId, postingId, input);
  }
}
