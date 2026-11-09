import { sql, type Kysely } from "kysely";
import type { BetaAdmissionRecords, BetaCapacity } from "@repo/core/onboarding";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Serializes beta seat allocation inside the caller's owner-locked transaction. */
export class PostgresBetaAdmissionRecords implements BetaAdmissionRecords {
  /** Receives only the transaction client; no pool or external calls escape the transaction. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {}

  /** A global admission lock prevents two different owners from claiming the last seat. */
  async capacity(
    ownerId: string,
    excludingScoutId?: string,
  ): Promise<BetaCapacity> {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended('scoutalert-beta-admission',0))`.execute(
      this.db,
    );
    const result = await sql<BetaCapacity>`SELECT
      EXISTS(SELECT 1 FROM beta_accounts WHERE owner_id=${ownerId}::uuid) AS admitted,
      (SELECT count(*)::integer FROM beta_accounts) AS accounts,
      (SELECT count(*)::integer FROM scouts WHERE owner_id=${ownerId}::uuid AND status='active' AND id IS DISTINCT FROM ${excludingScoutId ?? null}::uuid) AS "activeScouts"`.execute(
      this.db,
    );
    return result.rows[0]!;
  }

  /** Seats persist independently of scout revisions and pauses. */
  async admit(ownerId: string): Promise<void> {
    await sql`INSERT INTO beta_accounts(owner_id) VALUES(${ownerId}::uuid) ON CONFLICT DO NOTHING`.execute(
      this.db,
    );
  }
}
