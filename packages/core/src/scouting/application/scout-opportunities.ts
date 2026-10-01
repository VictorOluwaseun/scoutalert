import {
  RelevanceFeedbackRepository,
  prioritizeWithFeedback,
  rankWithFeedback,
} from "../ranking/relevance-feedback.js";
import { CandidateEvaluator } from "../intelligence/contracts.js";
import { assessPosting } from "../domain/assess-posting.js";
import type { ScoutRunRequest } from "../domain/discovery.js";
import {
  ScoutingRepository,
  SourceConnector,
  SourceRepository,
} from "./ports.js";

/** Shares public evidence collection across all scouts; source outages do not erase earlier complete evidence. */
export class RefreshSource {
  /** Receives inward persistence and connector ports; neither client is accessed directly. */
  constructor(
    private readonly sources: SourceRepository,
    private readonly connector: SourceConnector,
  ) {}

  /** Reuses a fresh snapshot or commits a complete refresh; failures leave the prior snapshot intact. */
  async execute(source: string, now: Date): Promise<void> {
    const lease = await this.sources.claim(source, now);

    if (!lease) {
      return;
    }

    try {
      await this.sources.publish(await this.connector.read(source, now), lease);
    } catch (error) {
      await this.sources.fail(source, lease);
      throw error;
    }
  }
}

/** Executes a bounded evidence-based matching pass with authoritative checks at both ends. */
export class ScoutOpportunities {
  /** Receives the transaction-owning discovery repository. */
  constructor(
    private readonly records: ScoutingRepository,
    private readonly evaluator?: CandidateEvaluator,
    private readonly feedback?: RelevanceFeedbackRepository,
  ) {}

  /** Returns waiting for unavailable evidence or leases, and progress after a durable analysis step; retries retain the logical run identity. */
  async execute(
    request: ScoutRunRequest,
  ): Promise<"done" | "waiting" | "progress"> {
    const context = await this.records.begin(request);

    if (!context) {
      return "done";
    }

    const retrieved = await this.records.candidates(context);

    if (!retrieved) {
      return "waiting";
    }

    const examples = (await this.feedback?.examples(request.ownerId)) ?? [];
    const candidates = prioritizeWithFeedback(retrieved, examples);
    const matches = this.evaluator
      ? await this.evaluator.evaluate(context, candidates)
      : candidates.flatMap((posting) => {
          const assessment = assessPosting(context.search, posting);

          return assessment ? [{ posting, assessment }] : [];
        });

    if (typeof matches === "string") {
      return matches;
    }

    await this.records.complete(
      context,
      matches.map(({ posting, assessment }) => ({
        posting,
        assessment: rankWithFeedback(posting, assessment, examples),
      })),
    );

    return "done";
  }
}
