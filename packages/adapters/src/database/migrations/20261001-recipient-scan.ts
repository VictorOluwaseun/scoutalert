import { sql, type Kysely } from "kysely";

/** Adds a durable fair recipient scan cursor so large or not-yet-due accounts cannot starve later accounts. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE delivery_scan_cursor (id smallint PRIMARY KEY CHECK (id=1), after_owner uuid);
    INSERT INTO delivery_scan_cursor (id) VALUES (1);`.execute(db);
}
