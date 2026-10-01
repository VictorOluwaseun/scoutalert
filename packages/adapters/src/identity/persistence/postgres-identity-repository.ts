import type { Kysely } from "kysely";
import {
  IdentityRepository,
  IdentityUnitOfWork,
  type IdentityTransaction,
  type VerificationChallenge,
} from "@repo/core/identity";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { PostgresIdentityTransaction } from "./postgres-identity-transaction.js";

/** PostgreSQL identity reads and outcome updates; never exposes raw queries to services. */
export class PostgresIdentityRepository extends IdentityRepository {
  /** Receives the bounded shared database client from API composition. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Joins the current browser generation and excludes expired proof records. */
  async currentChallenge(
    browserHash: string,
    at: Date,
  ): Promise<VerificationChallenge | null> {
    const row = await this.db
      .selectFrom("verification_flows")
      .innerJoin(
        "email_verification_challenges",
        "email_verification_challenges.id",
        "verification_flows.current_id",
      )
      .selectAll("email_verification_challenges")
      .where("verification_flows.browser_hash", "=", browserHash)
      .where("expires_at", ">", at)
      .executeTakeFirst();

    return row
      ? {
          id: row.id,
          browserHash: row.browser_hash,
          email: row.email,
          codeDigest: row.code_digest,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          failedAttempts: row.failed_attempts,
          delivery: row.delivery,
          consumedAt: row.consumed_at,
        }
      : null;
  }

  /** Records submission independently of proof usage; never retries an uncertain email. */
  async recordDelivery(
    id: string,
    delivery: VerificationChallenge["delivery"],
  ): Promise<void> {
    await this.db
      .updateTable("email_verification_challenges")
      .set({ delivery })
      .where("id", "=", id)
      .execute();
  }

  /** Reads only live sessions by keyed token digest. */
  async findSession(tokenHash: string, at: Date) {
    const row = await this.db
      .selectFrom("auth_sessions")
      .innerJoin("users", "users.id", "auth_sessions.owner_id")
      .select(["users.id", "users.email", "auth_sessions.expires_at"])
      .where("token_hash", "=", tokenHash)
      .where("expires_at", ">", at)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    return row
      ? { account: { id: row.id, email: row.email }, expiresAt: row.expires_at }
      : null;
  }

  /** Revokes only the supplied token, preserving all other browser sessions. */
  async revokeSession(tokenHash: string, at: Date): Promise<void> {
    await this.db
      .updateTable("auth_sessions")
      .set({ revoked_at: at })
      .where("token_hash", "=", tokenHash)
      .where("revoked_at", "is", null)
      .execute();
  }
}

/** Establishes one native Kysely transaction for all participating identity repositories. */
export class PostgresIdentityUnitOfWork extends IdentityUnitOfWork {
  /** Receives the composed client; transaction participation is explicit, never ambient. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Commits returned decisions and rolls back exceptions, including process/connection failures. */
  run<T>(operation: (records: IdentityTransaction) => Promise<T>): Promise<T> {
    return this.db
      .transaction()
      .execute((transaction) =>
        operation(new PostgresIdentityTransaction(transaction)),
      );
  }
}
