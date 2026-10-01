import { IdentityError, type AccountSession } from "../domain/identity.js";
import { IdentityCredentials } from "./ports/identity-credentials.js";
import { IdentityRepository } from "./ports/identity-repositories.js";
import { presentChallenge } from "./request-email-code.js";

/** Resolves and revokes shared identity sessions without exposing persistence to presentation. */
export class AccountAccess {
  /** Receives read/update records, token digesting and an explicit clock. */
  constructor(
    private readonly records: IdentityRepository,
    private readonly credentials: IdentityCredentials,
    private readonly now: () => Date,
  ) {}
  /** Requires live verified identity for every durable owner operation. */
  async require(token: string | null): Promise<AccountSession> {
    if (!token) throw new IdentityError("unauthenticated");
    const session = await this.records.findSession(
      this.credentials.digest(token),
      this.now(),
    );
    if (!session) throw new IdentityError("unauthenticated");
    return session;
  }
  /** Restores only current server-authorized contact/session state for the initiating browser. */
  async context(browser: string, token: string | null) {
    const session = token
      ? await this.records.findSession(
          this.credentials.digest(token),
          this.now(),
        )
      : null;
    const challenge = await this.records.currentChallenge(
      this.credentials.digest(`browser:${browser}`),
      this.now(),
    );
    return {
      account: session?.account ?? null,
      challenge:
        challenge && !challenge.consumedAt ? presentChallenge(challenge) : null,
    };
  }
  /** Revokes the current token idempotently; cookie removal remains a transport responsibility. */
  async logout(token: string | null): Promise<void> {
    if (!token) return;
    await this.records.revokeSession(
      this.credentials.digest(token),
      this.now(),
    );
  }
}
