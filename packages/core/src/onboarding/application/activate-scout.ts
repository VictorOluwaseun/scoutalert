import { validateScoutAlerts } from "../domain/validate-scout-alerts.js";
import { ReviewSearchDraft } from "./review-search-draft.js";
import {
  ActivationError,
  type ActivatedScout,
  type ScoutActivation,
} from "../domain/scout-activation.js";
import {
  ScoutActivationIdentity,
  ScoutActivationUnitOfWork,
} from "./ports/scout-activation-repositories.js";

/** Validates confirmed intent and atomically claims and activates a scout for a verified owner. */
export class ActivateScout {
  /** Receives inward transaction/identity capabilities and an explicit clock; no datasource access. */
  constructor(
    private readonly review: ReviewSearchDraft,
    private readonly transactions: ScoutActivationUnitOfWork,
    private readonly identity: ScoutActivationIdentity,
    private readonly now: () => Date,
  ) {}

  /** Retries return the original receipt; changed inputs under the same key are rejected. */
  async execute(
    ownerId: string,
    browser: string,
    input: ScoutActivation,
  ): Promise<ActivatedScout> {
    const reviewed = this.review.execute(input.search);

    if (!reviewed.ready) {
      throw new ActivationError(
        "search_needs_changes",
        reviewed.issues[0]?.message,
      );
    }

    validateScoutAlerts(input.alerts);
    const fingerprint = this.identity.fingerprint(input);

    return this.transactions.run(async (records) => {
      await records.lockOwner(ownerId);
      const existing = await records.findRequest(ownerId, input.key);

      if (existing && existing.fingerprint !== fingerprint) {
        throw new ActivationError("activation_conflict");
      }

      if (existing) {
        return existing.receipt;
      }

      const at = this.now();
      const draftId = this.identity.id();
      const scout: ActivatedScout = {
        id: this.identity.id(),
        name: input.search.name.trim() || `${input.search.target.trim()} scout`,
        status: "active",
        discovery: "pending",
        activatedAt: at.toISOString(),
        search: input.search,
        alerts: input.alerts,
      };
      await records.claimDraft(
        draftId,
        ownerId,
        this.identity.browserHash(browser),
        input,
        at,
      );
      await records.createScout(ownerId, draftId, scout);
      await records.recordConsent(this.identity.id(), ownerId, scout);
      await records.requestDiscovery(this.identity.id(), ownerId, scout);
      await records.saveRequest(ownerId, input.key, fingerprint, scout);

      return scout;
    });
  }
}
