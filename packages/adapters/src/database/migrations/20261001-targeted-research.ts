import { sql, type Kysely } from "kysely";

/** Adds shared availability leases and immutable observations without changing existing assessment or consent records. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE posting_availability (
      posting_id text NOT NULL REFERENCES opportunity_postings(id) ON DELETE CASCADE,
      posting_version integer NOT NULL CHECK (posting_version > 0),
      lease_token uuid,
      lease_until timestamptz,
      next_check_at timestamptz NOT NULL DEFAULT now(),
      evidence jsonb,
      PRIMARY KEY (posting_id,posting_version),
      CHECK (evidence IS NULL OR evidence->>'status' IN ('available','closed','changed','unresolved'))
    );
    CREATE INDEX recommendation_research_idx ON scout_recommendations(posting_id,posting_version,scout_id) WHERE assessment->>'policy'='personal-fit-v1';
    CREATE INDEX posting_availability_due ON posting_availability(next_check_at);
    CREATE TABLE posting_availability_observations (
      id uuid PRIMARY KEY,
      posting_id text NOT NULL REFERENCES opportunity_postings(id) ON DELETE CASCADE,
      posting_version integer NOT NULL,
      evidence jsonb NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX posting_availability_history ON posting_availability_observations(posting_id,recorded_at DESC);
    CREATE INDEX opportunity_prompt_volume ON opportunity_deliveries(owner_id,created_at DESC) WHERE window_key LIKE 'prompt:%';
  `.execute(db);
}
