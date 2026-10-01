import type { Kysely } from "kysely";
import type {
  IdentityTransaction,
  VerificationChallenge,
  AccountSession,
} from "@repo/core/identity";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Identity repositories bound exclusively to the Kysely transaction supplied by the unit of work. */
export class PostgresIdentityTransaction implements IdentityTransaction {
  /** Receives a transaction client; this class never opens an independent connection or transaction. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {}

  /** Establishes and locks the flow row to serialize code requests and generation changes. */
  async lockFlow(browserHash: string): Promise<VerificationChallenge | null> {
    await this.db
      .insertInto("verification_flows")
      .values({
        browser_hash: browserHash,
        current_id: null,
        updated_at: new Date(),
      })
      .onConflict((conflict) => conflict.column("browser_hash").doNothing())
      .execute();
    const flow = await this.db
      .selectFrom("verification_flows")
      .select("current_id")
      .where("browser_hash", "=", browserHash)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (!flow.current_id) return null;
    return this.lockChallenge(flow.current_id, browserHash);
  }

  /** Locks a matching browser-owned challenge so attempt counts and consumption are atomic. */
  async lockChallenge(
    id: string,
    browserHash: string,
  ): Promise<VerificationChallenge | null> {
    const row = await this.db
      .selectFrom("email_verification_challenges")
      .selectAll()
      .where("id", "=", id)
      .where("browser_hash", "=", browserHash)
      .forUpdate()
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      browserHash: row.browser_hash,
      email: row.email,
      codeDigest: row.code_digest,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      failedAttempts: row.failed_attempts,
      delivery: row.delivery,
      consumedAt: row.consumed_at,
    };
  }

  /** Inserts a new proof then points the locked browser flow to that generation. */
  async replaceChallenge(challenge: VerificationChallenge): Promise<void> {
    await this.db
      .insertInto("email_verification_challenges")
      .values({
        id: challenge.id,
        browser_hash: challenge.browserHash,
        email: challenge.email,
        code_digest: challenge.codeDigest,
        created_at: challenge.createdAt,
        expires_at: challenge.expiresAt,
        failed_attempts: challenge.failedAttempts,
        delivery: challenge.delivery,
        consumed_at: challenge.consumedAt,
      })
      .execute();
    await this.db
      .updateTable("verification_flows")
      .set({ current_id: challenge.id, updated_at: challenge.createdAt })
      .where("browser_hash", "=", challenge.browserHash)
      .executeTakeFirstOrThrow();
  }

  /** Updates proof usage only; a concurrent SMTP outcome cannot be overwritten by this mapping. */
  async saveChallenge(challenge: VerificationChallenge): Promise<void> {
    await this.db
      .updateTable("email_verification_challenges")
      .set({
        failed_attempts: challenge.failedAttempts,
        consumed_at: challenge.consumedAt,
      })
      .where("id", "=", challenge.id)
      .where("browser_hash", "=", challenge.browserHash)
      .executeTakeFirstOrThrow();
  }

  /** Reuses an existing email owner without disclosing whether this was registration or sign-in. */
  async verifyAccount(id: string, email: string, at: Date) {
    return this.db
      .insertInto("users")
      .values({ id, email, verified_at: at })
      .onConflict((conflict) =>
        conflict.column("email").doUpdateSet({ verified_at: at }),
      )
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();
  }

  /** Stores a hashed session and revokes the prior token in this same identity transaction. */
  async createSession(
    challengeId: string,
    accountId: string,
    tokenHash: string,
    expiresAt: Date,
    previousTokenHash: string | null,
  ): Promise<void> {
    await this.db
      .insertInto("auth_sessions")
      .values({
        challenge_id: challengeId,
        owner_id: accountId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        revoked_at: null,
      })
      .execute();
    if (!previousTokenHash) return;
    await this.db
      .updateTable("auth_sessions")
      .set({ revoked_at: new Date() })
      .where("token_hash", "=", previousTokenHash)
      .execute();
  }

  /** Recovers only a live original session; replay never restores a revoked session. */
  async sessionForChallenge(
    challengeId: string,
    at: Date,
  ): Promise<AccountSession | null> {
    const row = await this.db
      .selectFrom("auth_sessions")
      .innerJoin("users", "users.id", "auth_sessions.owner_id")
      .select(["users.id", "users.email", "auth_sessions.expires_at"])
      .where("challenge_id", "=", challengeId)
      .where("expires_at", ">", at)
      .where("revoked_at", "is", null)
      .executeTakeFirst();
    return row
      ? { account: { id: row.id, email: row.email }, expiresAt: row.expires_at }
      : null;
  }
}
