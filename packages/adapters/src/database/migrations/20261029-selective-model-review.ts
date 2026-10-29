import { sql, type Kysely } from "kysely";

/** Labels new audit reservations while preserving all prior usage as standard model work. No counters are reset. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE intelligence_token_reservations ADD COLUMN purpose text NOT NULL DEFAULT 'standard' CHECK(purpose IN ('standard','audit'))`.execute(
    db,
  );
  await sql`ALTER TABLE intelligence_tasks ADD COLUMN review_of text REFERENCES intelligence_tasks(id);
    CREATE INDEX intelligence_tasks_review_of ON intelligence_tasks(review_of) WHERE review_of IS NOT NULL`.execute(
    db,
  );
}
