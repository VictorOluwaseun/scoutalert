/** A browser-bound, single-use proof of inbox access; no plaintext code is persisted. */
export interface VerificationChallenge {
  id: string;
  browserHash: string;
  email: string;
  codeDigest: string;
  createdAt: Date;
  expiresAt: Date;
  failedAttempts: number;
  delivery: "pending" | "accepted" | "unknown" | "failed";
  consumedAt: Date | null;
}

/** Verified account identity shared by onboarding and future signed-in experiences. */
export interface Account {
  id: string;
  email: string;
}

/** Durable opaque session metadata; repositories store only the token digest. */
export interface AccountSession {
  account: Account;
  expiresAt: Date;
}

/** Expected identity failures carry safe transport codes without private request data. */
export class IdentityError extends Error {
  /** Creates a safe failure; retryAfter is seconds and never reveals account existence. */
  constructor(
    public readonly code:
      | "invalid_email"
      | "rate_limited"
      | "invalid_code"
      | "code_expired"
      | "code_locked"
      | "challenge_changed"
      | "email_unavailable"
      | "unauthenticated",
    public readonly retryAfter?: number,
  ) {
    super(code);
    this.name = "IdentityError";
  }
}
