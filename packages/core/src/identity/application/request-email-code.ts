import {
  EmailProvider,
  EmailSubmissionError,
} from "../../notifications/public.js";
import {
  IdentityError,
  type VerificationChallenge,
} from "../domain/identity.js";
import { IdentityCredentials } from "./ports/identity-credentials.js";
import {
  IdentityRateLimits,
  IdentityRepository,
  IdentityUnitOfWork,
} from "./ports/identity-repositories.js";

/** Public challenge receipt contains timing and generation, never account-existence information. */
export interface CodeReceipt {
  id: string;
  email: string;
  expiresAt: string;
  resendAt: string;
}

/** Presents timing from durable state without exposing proof material. */
export function presentChallenge(
  challenge: VerificationChallenge,
): CodeReceipt {
  return {
    id: challenge.id,
    email: challenge.email,
    expiresAt: challenge.expiresAt.toISOString(),
    resendAt: new Date(challenge.createdAt.getTime() + 60_000).toISOString(),
  };
}

/** Requests a browser-bound sign-in code with atomic cooldowns and bounded abuse controls. */
export class RequestEmailCode {
  /** Receives inward persistence, cryptography, email and clock capabilities through composition. */
  constructor(
    private readonly transactions: IdentityUnitOfWork,
    private readonly records: IdentityRepository,
    private readonly limits: IdentityRateLimits,
    private readonly credentials: IdentityCredentials,
    private readonly email: EmailProvider,
    private readonly now: () => Date,
  ) {}

  /** Sends after committing the challenge; provider uncertainty remains distinguishable from rejection. */
  async execute(input: {
    email: string;
    browser: string;
    network: string;
  }): Promise<CodeReceipt> {
    const address = input.email.trim().toLowerCase();

    if (
      address.length > 254 ||
      !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address)
    ) {
      throw new IdentityError("invalid_email");
    }

    const browserHash = this.credentials.digest(`browser:${input.browser}`);
    const at = this.now();
    const current = await this.records.currentChallenge(browserHash, at);
    const cooldown = current
      ? Math.ceil((current.createdAt.getTime() + 60_000 - at.getTime()) / 1000)
      : 0;

    if (cooldown > 0) {
      throw new IdentityError("rate_limited", cooldown);
    }

    const retryAfter = await this.limits.reserve([
      {
        key: this.credentials.digest(`send:email:${address}`),
        maximum: 5,
        windowSeconds: 3600,
      },
      {
        key: this.credentials.digest(`send:browser:${input.browser}`),
        maximum: 10,
        windowSeconds: 3600,
      },
      {
        key: this.credentials.digest(`send:network:${input.network}`),
        maximum: 50,
        windowSeconds: 3600,
      },
    ]);

    if (retryAfter !== null) {
      throw new IdentityError("rate_limited", retryAfter);
    }

    const code = this.credentials.code();
    const id = this.credentials.id();
    const result = await this.transactions.run(async (records) => {
      const previous = await records.lockFlow(browserHash);
      const cooldown = previous
        ? Math.ceil(
            (previous.createdAt.getTime() + 60_000 - at.getTime()) / 1000,
          )
        : 0;

      if (cooldown > 0) {
        return { retryAfter: cooldown };
      }

      const challenge: VerificationChallenge = {
        id,
        browserHash,
        email: address,
        codeDigest: this.credentials.codeDigest(id, browserHash, address, code),
        createdAt: at,
        expiresAt: new Date(at.getTime() + 600_000),
        failedAttempts: 0,
        delivery: "pending",
        consumedAt: null,
      };
      await records.replaceChallenge(challenge);

      return { challenge };
    });

    if ("retryAfter" in result) {
      throw new IdentityError("rate_limited", result.retryAfter);
    }

    try {
      await this.email.send({
        id,
        recipient: address,
        subject: "Your ScoutAlert sign-in code",
        text: `Your ScoutAlert code is ${code}.\n\nIt expires in 10 minutes and can only be used in the browser that requested it. Use the latest code if you requested another.\n\nThis verifies your account. It does not subscribe you to opportunity alerts. If you did not request it, ignore this email.`,
      });
    } catch (error) {
      const delivery =
        error instanceof EmailSubmissionError && error.outcome === "rejected"
          ? "failed"
          : "unknown";
      await this.records.recordDelivery(id, delivery);
      throw new IdentityError("email_unavailable");
    }

    await this.records.recordDelivery(id, "accepted");

    return presentChallenge(result.challenge);
  }
}
