import { sql, type Kysely } from "kysely";

/** Widens structural ceilings for configured exploration; immutable case plans still impose their original smaller limits. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE web_discovery_steps
      DROP CONSTRAINT web_discovery_steps_depth_check,
      ADD CONSTRAINT web_discovery_steps_depth_check CHECK(depth BETWEEN 0 AND 8);
    ALTER TABLE web_discovery_decisions
      DROP CONSTRAINT web_discovery_decisions_depth_check,
      DROP CONSTRAINT web_discovery_decisions_round_check,
      ADD CONSTRAINT web_discovery_decisions_depth_check CHECK(depth BETWEEN 0 AND 8),
      ADD CONSTRAINT web_discovery_decisions_round_check CHECK(round BETWEEN 0 AND 16);
  `.execute(db);
}
