import { ReviewSearchDraft } from "../../onboarding/application/review-search-draft.js";
import { validateScoutAlerts } from "../../onboarding/domain/validate-scout-alerts.js";
import type {
  ActivatedScout,
  ScoutAlerts,
} from "../../onboarding/domain/scout-activation.js";
import type {
  SearchDraft,
  SearchIssue,
} from "../../onboarding/domain/search-draft.js";

/** Current owner-approved state; version fences all edits, execution and recommendation publication. */
export interface ManagedScout extends ActivatedScout {
  version: number;
}

/** A confirmed command carries the revision actually reviewed by the person and a retry identity. */
export type ScoutChange = { key: string; version: number } & (
  | { action: "update"; search: SearchDraft; alerts: ScoutAlerts }
  | { action: "pause" | "resume" }
);

/** Expected lifecycle failures contain only public codes and field validation guidance. */
export class ScoutManagementError extends Error {
  /** Identifies safe missing-record, concurrent-edit or validation failures without personal data. */
  constructor(
    public readonly code:
      | "scout_not_found"
      | "scout_changed"
      | "request_conflict"
      | "search_needs_changes",
    public readonly issues?: SearchIssue[],
  ) {
    super(code);
    this.name = "ScoutManagementError";
  }
}

/** Transaction-scoped records serialize owner effects and commit revised state with discovery intent. */
export interface ScoutManagementRecords {
  /** Serializes lifecycle, feedback and delivery reservations for this owner. */
  lockOwner(ownerId: string): Promise<void>;
  /** Reads a prior command receipt after acquiring the owner lock. */
  receipt(
    ownerId: string,
    key: string,
  ): Promise<{ fingerprint: string; scout: ManagedScout } | null>;
  /** Locks the current scout and its preferences within this owner's scope. */
  find(ownerId: string, scoutId: string): Promise<ManagedScout | null>;
  /** Writes revised state, preference revision and cancellation of superseded work atomically. */
  save(ownerId: string, scout: ManagedScout, at: Date): Promise<void>;
  /** Records the explicit alert choice confirmed by an edit, independently of pause/resume. */
  recordConsent(ownerId: string, scout: ManagedScout, at: Date): Promise<void>;
  /** Creates a unique durable refresh intent for the new active revision. */
  requestDiscovery(
    ownerId: string,
    scout: ManagedScout,
    at: Date,
  ): Promise<void>;
  /** Retains the immutable result so a lost-response retry has no duplicate effects. */
  saveReceipt(
    ownerId: string,
    key: string,
    fingerprint: string,
    scout: ManagedScout,
    at: Date,
  ): Promise<void>;
}

/** Native transaction participation remains behind the inward repository boundary. */
export abstract class ScoutManagementRepository {
  /** Returns current state for one verified owner only. */
  abstract find(ownerId: string, scoutId: string): Promise<ManagedScout | null>;
  /** Rolls back every participating write on validation, concurrency or persistence failure. */
  abstract transaction<T>(
    work: (records: ScoutManagementRecords) => Promise<T>,
  ): Promise<T>;
  /** Canonical digest of target and confirmed command, independent of object key ordering. */
  abstract fingerprint(scoutId: string, input: ScoutChange): string;
}

/** Applies explicit user changes without altering reusable personal facts or calling external providers. */
export class ManageScout {
  /** Receives repository, shared search rules and clock through composition. */
  constructor(
    private readonly records: ScoutManagementRepository,
    private readonly review: ReviewSearchDraft,
    private readonly now: () => Date,
  ) {}

  /** Rejects stale edits and queues reassessment only for active revisions; retries return the original receipt. */
  async execute(
    ownerId: string,
    scoutId: string,
    input: ScoutChange,
  ): Promise<ManagedScout> {
    this.validate(input);
    const fingerprint = this.records.fingerprint(scoutId, input);
    return this.records.transaction(async (records) => {
      await records.lockOwner(ownerId);
      const receipt = await records.receipt(ownerId, input.key);
      if (receipt && receipt.fingerprint !== fingerprint)
        throw new ScoutManagementError("request_conflict");
      if (receipt) return receipt.scout;
      const current = await records.find(ownerId, scoutId);
      if (!current) throw new ScoutManagementError("scout_not_found");
      if (current.version !== input.version)
        throw new ScoutManagementError("scout_changed");
      const search = input.action === "update" ? input.search : current.search;
      const scout: ManagedScout = {
        ...current,
        search,
        name: search.name.trim() || `${search.target.trim()} scout`,
        alerts: input.action === "update" ? input.alerts : current.alerts,
        status:
          input.action === "pause"
            ? "paused"
            : input.action === "resume"
              ? "active"
              : current.status,
        version: current.version + 1,
        discovery: "pending",
      };
      const at = this.now();
      await records.save(ownerId, scout, at);
      if (input.action === "update")
        await records.recordConsent(ownerId, scout, at);
      if (scout.status === "active")
        await records.requestDiscovery(ownerId, scout, at);
      await records.saveReceipt(ownerId, input.key, fingerprint, scout, at);
      return scout;
    });
  }

  /** Reuses authoritative onboarding rules for a fully confirmed replacement brief and preferences. */
  private validate(input: ScoutChange): void {
    if (input.action !== "update") return;
    const review = this.review.execute(input.search);
    if (!review.ready)
      throw new ScoutManagementError("search_needs_changes", review.issues);
    validateScoutAlerts(input.alerts);
  }
}
