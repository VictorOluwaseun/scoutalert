import { sql, type Kysely } from "kysely";

/** Adds shared, versioned demand reviews before private matching; missing public fields remain null. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE opportunity_postings ALTER COLUMN company DROP NOT NULL, ALTER COLUMN location DROP NOT NULL, ALTER COLUMN source_updated_at DROP NOT NULL;
    INSERT INTO opportunity_sources(id,kind,scope) VALUES('web-client-requests','client_request','window'),('web-discovery','job','window') ON CONFLICT DO NOTHING;
    CREATE TABLE web_lead_reviews (
      key text PRIMARY KEY, lead_id text NOT NULL REFERENCES web_discovery_leads(id), configuration text NOT NULL,
      input jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','ready','failed')),
      lease_token uuid, lease_until timestamptz, result jsonb, failure text,
      attempts integer NOT NULL DEFAULT 0, retry_at timestamptz,
      posting_id text REFERENCES opportunity_postings(id), posting_version integer, reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX web_lead_reviews_lease_idx ON web_lead_reviews(lease_until) WHERE state='running';
    CREATE INDEX web_lead_reviews_posting_idx ON web_lead_reviews(posting_id,posting_version) WHERE state='ready';
    ALTER TABLE web_discovery_leads ADD COLUMN review_key text REFERENCES web_lead_reviews(key);
    CREATE TABLE web_lead_review_cases (
      case_id uuid PRIMARY KEY REFERENCES web_discovery_cases(id) ON DELETE CASCADE,
      configuration text NOT NULL, keys text[] NOT NULL, deadline timestamptz NOT NULL DEFAULT now()+interval '3 minutes'
    );
    CREATE TABLE web_lead_review_attempts (
      id uuid PRIMARY KEY, state text NOT NULL CHECK(state IN ('running','ready','failed','superseded')),
      lease_until timestamptz NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
      usage jsonb, cost jsonb, failure text
    );
    CREATE INDEX web_lead_attempts_active_idx ON web_lead_review_attempts(lease_until) WHERE state='running';
  `.execute(db);
}
