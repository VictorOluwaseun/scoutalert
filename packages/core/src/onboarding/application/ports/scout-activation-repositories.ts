import type {
  ActivatedScout,
  ScoutActivation,
} from "../../domain/scout-activation.js";

/** Scoped repositories sharing a transaction and owner lock for one activation. */
export interface ScoutActivationTransaction {
  /** Locks a verified owner before reading idempotency state or creating an owned scout. */
  lockOwner(ownerId: string): Promise<void>;
  /** Returns only this owner's prior receipt and immutable request fingerprint. */
  findRequest(
    ownerId: string,
    key: string,
  ): Promise<{ fingerprint: string; receipt: ActivatedScout } | null>;
  /** Claims the confirmed browser brief as an owned approved draft in this transaction. */
  claimDraft(
    id: string,
    ownerId: string,
    browserHash: string,
    input: ScoutActivation,
    at: Date,
  ): Promise<void>;
  /** Creates the active scout and its notification preferences from the approved draft. */
  createScout(
    ownerId: string,
    draftId: string,
    scout: ActivatedScout,
  ): Promise<void>;
  /** Records explicit granted or disabled alert consent with the exact wording version. */
  recordConsent(
    id: string,
    ownerId: string,
    scout: ActivatedScout,
  ): Promise<void>;
  /** Stores a unique initial discovery intent; no external work occurs inside the transaction. */
  requestDiscovery(
    id: string,
    ownerId: string,
    scout: ActivatedScout,
  ): Promise<void>;
  /** Persists a receipt keyed by owner and request key for safe lost-response retries. */
  saveRequest(
    ownerId: string,
    key: string,
    fingerprint: string,
    scout: ActivatedScout,
  ): Promise<void>;
}

/** Guarantees draft, scout, preferences, consent, receipt and outbox atomicity. */
export abstract class ScoutActivationUnitOfWork {
  /** Executes exclusively through transaction-bound repositories; exceptions roll back every write. */
  abstract run<T>(
    operation: (records: ScoutActivationTransaction) => Promise<T>,
  ): Promise<T>;
}

/** Cryptographic IDs and immutable request fingerprints supplied outside the pure business core. */
export abstract class ScoutActivationIdentity {
  /** Generates an opaque UUID for persisted records. */
  abstract id(): string;
  /** Fingerprints normalized, confirmed inputs to detect key reuse with changed payloads. */
  abstract fingerprint(input: ScoutActivation): string;
  /** Hashes the originating browser handle; raw browser secrets are never persisted. */
  abstract browserHash(browser: string): string;
}

/** Owner-scoped activated scout reads, used to recover a saved receipt after reload. */
export abstract class ActivatedScoutRepository {
  /** Returns a scout only when it belongs to the authenticated owner. */
  abstract find(ownerId: string, id: string): Promise<ActivatedScout | null>;
}
