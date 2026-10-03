import { sql, type Kysely } from "kysely";

/** Makes each captured directory's expansion allowance shared across subscribers and activity retries. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE web_source_monitors ADD COLUMN expansion_checked_at timestamptz, ADD COLUMN expansion_count integer NOT NULL DEFAULT 0 CHECK(expansion_count BETWEEN 0 AND 4)`.execute(
    db,
  );
}
