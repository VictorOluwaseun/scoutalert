import { sql, type Kysely } from "kysely";

/** Indexes immutable source versions for review recovery; the latest matching review can be found without scanning unrelated source text. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE INDEX web_lead_reviews_source_version_idx ON web_lead_reviews (lead_id,(input->>'documentFingerprint'),created_at DESC,key)`.execute(
    db,
  );
}
