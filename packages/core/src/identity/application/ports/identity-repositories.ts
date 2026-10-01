import type {
  Account,
  AccountSession,
  VerificationChallenge,
} from "../../domain/identity.js";

/** Transaction-bound identity records; flow and challenge locks serialize resend/verification. */
export interface IdentityTransaction {
  /** Locks a browser's flow before returning its current challenge, including expired records. */
  lockFlow(browserHash: string): Promise<VerificationChallenge | null>;
  /** Locks a challenge only when it belongs to the supplied initiating browser. */
  lockChallenge(
    id: string,
    browserHash: string,
  ): Promise<VerificationChallenge | null>;
  /** Replaces the current generation under the flow lock; old generations become unusable. */
  replaceChallenge(challenge: VerificationChallenge): Promise<void>;
  /** Persists an attempt increment or consumption in the current transaction. */
  saveChallenge(challenge: VerificationChallenge): Promise<void>;
  /** Creates or reuses a verified account under its normalized email uniqueness constraint. */
  verifyAccount(id: string, email: string, at: Date): Promise<Account>;
  /** Inserts one session for a consumed challenge and atomically revokes a prior session. */
  createSession(
    challengeId: string,
    accountId: string,
    tokenHash: string,
    expiresAt: Date,
    previousTokenHash: string | null,
  ): Promise<void>;
  /** Finds an existing session for retry after a lost successful verification response. */
  sessionForChallenge(
    challengeId: string,
    at: Date,
  ): Promise<AccountSession | null>;
}

/** Binds every identity repository operation in a callback to one database transaction. */
export abstract class IdentityUnitOfWork {
  /** Commits returned decisions (including failed attempt increments); throws roll back all writes. */
  abstract run<T>(
    operation: (records: IdentityTransaction) => Promise<T>,
  ): Promise<T>;
}

/** Non-transactional identity reads and delivery/session updates behind a persistence boundary. */
export abstract class IdentityRepository {
  /** Returns an unexpired challenge for browser recovery, never its code or digest to transport. */
  abstract currentChallenge(
    browserHash: string,
    at: Date,
  ): Promise<VerificationChallenge | null>;
  /** Records SMTP submission outcome without claiming inbox delivery or retrying a submission. */
  abstract recordDelivery(
    id: string,
    delivery: VerificationChallenge["delivery"],
  ): Promise<void>;
  /** Authorizes only an unexpired, unrevoked session digest. */
  abstract findSession(
    tokenHash: string,
    at: Date,
  ): Promise<AccountSession | null>;
  /** Revokes a session idempotently, including already expired or absent sessions. */
  abstract revokeSession(tokenHash: string, at: Date): Promise<void>;
}

/** Temporary atomic abuse controls; identifiers are keyed digests, never email addresses. */
export abstract class IdentityRateLimits {
  /** Reserves all requested limits together; denial consumes no quota and returns remaining seconds. */
  abstract reserve(
    limits: readonly { key: string; maximum: number; windowSeconds: number }[],
  ): Promise<number | null>;
}
