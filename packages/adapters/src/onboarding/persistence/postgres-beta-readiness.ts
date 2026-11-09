import { sql, type Kysely } from "kysely";
import {
  BetaReadinessRepository,
  type BetaAccessPolicy,
  type BetaReadiness,
} from "@repo/core/onboarding";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Reports migration-era capacity without modifying existing account or scout selections. */
export class PostgresBetaReadinessRepository extends BetaReadinessRepository {
  /** Receives the shared read-capable client from composition. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Counts retained seats plus any legacy owners; no account identities leave this aggregate report. */
  async read(policy: BetaAccessPolicy): Promise<BetaReadiness> {
    const result = await sql<BetaReadiness>`SELECT
      (SELECT count(*)::integer FROM (SELECT owner_id FROM beta_accounts UNION SELECT owner_id FROM scouts) owners) AS accounts,
      (SELECT count(*)::integer FROM scouts WHERE status='active') AS "activeScouts",
      (SELECT count(*)::integer FROM (SELECT owner_id FROM scouts WHERE status='active' GROUP BY owner_id HAVING count(*)>${policy.activeScoutsPerAccount}) excess) AS "accountsOverScoutLimit"`.execute(
      this.db,
    );
    return result.rows[0]!;
  }
}
