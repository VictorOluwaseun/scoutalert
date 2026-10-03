import { sql, type Kysely } from "kysely";

/** Makes bounded review deferrals visible without exposing account usage, provider failures or infrastructure details. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE web_lead_review_cases ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','complete','deferred')), ADD COLUMN reason text`.execute(
    db,
  );
}
