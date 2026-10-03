import { sql, type Kysely } from "kysely";

/** Retains revision-scoped adaptive decisions and exact parent operations without changing historical case plans. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE web_discovery_steps ADD COLUMN depth integer NOT NULL DEFAULT 0 CHECK(depth BETWEEN 0 AND 2);
    CREATE TABLE web_discovery_decisions (
      case_id uuid NOT NULL REFERENCES web_discovery_cases(id) ON DELETE CASCADE,
      round integer NOT NULL CHECK(round BETWEEN 0 AND 4),
      reason text NOT NULL, action jsonb, parent_key text REFERENCES web_discovery_operations(key),
      depth integer NOT NULL CHECK(depth BETWEEN 0 AND 2),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(case_id,round)
    );
  `.execute(db);
}
