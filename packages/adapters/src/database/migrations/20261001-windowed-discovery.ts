import { sql, type Kysely } from "kysely";

/** Separates buyer requests from job postings and preserves rolling-feed absence semantics. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE opportunity_sources ADD COLUMN kind text NOT NULL DEFAULT 'job' CHECK(kind IN ('job','client_request'));
    ALTER TABLE opportunity_sources ADD COLUMN scope text NOT NULL DEFAULT 'complete' CHECK(scope IN ('complete','window'));
    ALTER TABLE opportunity_postings ADD COLUMN kind text NOT NULL DEFAULT 'job' CHECK(kind IN ('job','client_request'));
    CREATE INDEX posting_kind_freshness_idx ON opportunity_postings(kind,checked_at DESC) WHERE open;
    CREATE INDEX feedback_relevance_idx ON opportunity_feedback(owner_id,updated_at DESC,posting_id) WHERE value='relevant';
  `.execute(db);
}
