import { IdentityError, type AccountSession } from "../domain/identity.js";
import { IdentityCredentials } from "./ports/identity-credentials.js";
import {
  IdentityRateLimits,
  IdentityUnitOfWork,
} from "./ports/identity-repositories.js";

/** Consumes inbox proof and creates a recoverable account/session in the same transaction. */
export class VerifyEmailCode {
  /** Receives transaction-scoped identity records, abuse controls, cryptography and clock. */
  constructor(
    private readonly transactions: IdentityUnitOfWork,
    private readonly limits: IdentityRateLimits,
    private readonly credentials: IdentityCredentials,
    private readonly now: () => Date,
  ) {}

  /** A retry with the same valid proof returns the original session; no second session is minted. */
  async execute(input: {
    id: string;
    code: string;
    browser: string;
    network: string;
    previousSession: string | null;
  }): Promise<AccountSession & { token: string }> {
    if (!/^\d{6}$/.test(input.code)) {
      throw new IdentityError("invalid_code");
    }

    const retryAfter = await this.limits.reserve([
      {
        key: this.credentials.digest(`verify:network:${input.network}`),
        maximum: 100,
        windowSeconds: 600,
      },
    ]);

    if (retryAfter !== null) {
      throw new IdentityError("rate_limited", retryAfter);
    }

    const browserHash = this.credentials.digest(`browser:${input.browser}`);
    const at = this.now();
    const token = this.credentials.sessionToken(input.id);
    const result = await this.transactions.run(
      async (records): Promise<AccountSession | IdentityError> => {
        const current = await records.lockFlow(browserHash);

        if (!current || current.id !== input.id) {
          return new IdentityError("challenge_changed");
        }

        const challenge = await records.lockChallenge(input.id, browserHash);

        if (!challenge) {
          return new IdentityError("invalid_code");
        }

        if (challenge.expiresAt <= at) {
          return new IdentityError("code_expired");
        }

        if (challenge.failedAttempts >= 5) {
          return new IdentityError("code_locked");
        }

        const digest = this.credentials.codeDigest(
          challenge.id,
          browserHash,
          challenge.email,
          input.code,
        );

        if (!this.credentials.equal(digest, challenge.codeDigest)) {
          await records.saveChallenge({
            ...challenge,
            failedAttempts: challenge.failedAttempts + 1,
          });

          return new IdentityError(
            challenge.failedAttempts + 1 >= 5 ? "code_locked" : "invalid_code",
          );
        }

        if (challenge.consumedAt) {
          return (
            (await records.sessionForChallenge(challenge.id, at)) ??
            new IdentityError("code_expired")
          );
        }

        if (
          challenge.delivery === "failed" ||
          challenge.delivery === "pending"
        ) {
          return new IdentityError("email_unavailable");
        }

        const account = await records.verifyAccount(
          this.credentials.id(),
          challenge.email,
          at,
        );
        const expiresAt = new Date(at.getTime() + 7 * 86400_000);
        await records.createSession(
          challenge.id,
          account.id,
          this.credentials.digest(token),
          expiresAt,
          input.previousSession
            ? this.credentials.digest(input.previousSession)
            : null,
        );
        await records.saveChallenge({ ...challenge, consumedAt: at });

        return { account, expiresAt };
      },
    );

    if (result instanceof IdentityError) {
      throw result;
    }

    return { ...result, token };
  }
}
