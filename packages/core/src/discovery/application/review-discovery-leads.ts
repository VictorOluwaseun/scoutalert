import type { ScoutRunRequest } from "../../scouting/public.js";
import {
  LeadReviewProvider,
  LeadReviewRepository,
} from "../domain/lead-review.js";
import { validLeadReview } from "../domain/review-policy.js";

/** Classifies shared public demand before private assessment, advancing at most one admitted model call per activity. */
export class ReviewDiscoveryLeads {
  /** Receives inward ports; disabled AI leaves leads explicitly unreviewed. */
  constructor(
    private readonly records: LeadReviewRepository,
    private readonly provider: LeadReviewProvider | null,
  ) {}

  /** Validates an exact one-to-one output batch before accepting any evidence; failures retain their reservation. */
  async execute(
    request: ScoutRunRequest,
  ): Promise<"done" | "waiting" | "progress"> {
    if (!this.provider) {
      return "done";
    }
    const claim = await this.records.claim(
      request,
      this.provider.configuration,
    );
    if (claim.status !== "claimed") {
      return claim.status;
    }
    try {
      const result = await this.provider.review(claim.inputs);
      const outputs = new Map(
        result.reviews.map((item) => [item.id, item.review]),
      );
      const valid =
        outputs.size === claim.inputs.length &&
        result.reviews.length === claim.inputs.length &&
        claim.inputs.every((input) => {
          const review = outputs.get(input.id);
          return !!review && validLeadReview(input, review);
        });
      if (!valid) {
        await this.records.fail(claim.token, "invalid_evidence");
        return "progress";
      }
      await this.records.complete(claim.token, result);
    } catch {
      await this.records.fail(claim.token, "provider_unavailable");
    }
    return "progress";
  }
}
