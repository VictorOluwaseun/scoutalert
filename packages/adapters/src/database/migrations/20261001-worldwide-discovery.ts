import { sql, type Kysely } from "kysely";

/** Adds revision-bound cases, reusable public operations, conservative budgets and incomplete opportunity leads. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE web_discovery_cases (
      id uuid PRIMARY KEY, scout_id uuid NOT NULL, owner_id uuid NOT NULL, scout_version integer NOT NULL,
      plan jsonb NOT NULL, capability jsonb, provider text, status text NOT NULL
        CHECK(status IN ('searching','completed','partial','deferred','unavailable','cancelled')),
      reason text, started_at timestamptz NOT NULL DEFAULT now(), deadline timestamptz NOT NULL,
      finished_at timestamptz,
      FOREIGN KEY(scout_id,owner_id) REFERENCES scouts(id,owner_id) ON DELETE CASCADE
    );
    CREATE INDEX web_case_owner_idx ON web_discovery_cases(owner_id,scout_id,started_at DESC);
    CREATE TABLE web_discovery_operations (
      key text PRIMARY KEY, provider text NOT NULL, kind text NOT NULL CHECK(kind IN ('search','document')),
      input jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','succeeded','failed')),
      result jsonb, lease_token uuid, lease_until timestamptz, failure text,
      created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
    );
    CREATE INDEX web_operation_running_idx ON web_discovery_operations(provider,lease_until) WHERE state='running';
    CREATE TABLE web_discovery_steps (
      case_id uuid NOT NULL REFERENCES web_discovery_cases(id) ON DELETE CASCADE,
      position integer NOT NULL, operation_key text NOT NULL REFERENCES web_discovery_operations(key),
      applied boolean NOT NULL DEFAULT false, PRIMARY KEY(case_id,operation_key), UNIQUE(case_id,position)
    );
    CREATE TABLE web_discovery_usage (
      provider text NOT NULL, day date NOT NULL, requests integer NOT NULL DEFAULT 0,
      reserved_micros bigint NOT NULL DEFAULT 0, PRIMARY KEY(provider,day),
      CHECK(requests>=0 AND reserved_micros>=0)
    );
    CREATE TABLE web_discovery_hosts (
      hostname text PRIMARY KEY, lease_token uuid, lease_until timestamptz,
      next_allowed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE web_discovery_leads (
      id text PRIMARY KEY, url text NOT NULL UNIQUE CHECK(url LIKE 'https://%'), source text NOT NULL,
      title text, snippet text, first_seen_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL,
      checked_at timestamptz, content_status text NOT NULL DEFAULT 'unfetched', document jsonb,
      posting_id text REFERENCES opportunity_postings(id)
    );
    CREATE TABLE web_discovery_observations (
      operation_key text NOT NULL REFERENCES web_discovery_operations(key),
      lead_id text NOT NULL REFERENCES web_discovery_leads(id), rank integer NOT NULL,
      title text, snippet text, observed_at timestamptz NOT NULL,
      PRIMARY KEY(operation_key,lead_id)
    );
    CREATE TABLE web_discovery_case_leads (
      case_id uuid NOT NULL REFERENCES web_discovery_cases(id) ON DELETE CASCADE,
      lead_id text NOT NULL REFERENCES web_discovery_leads(id), PRIMARY KEY(case_id,lead_id)
    );
    CREATE TABLE web_source_candidates (
      hostname text PRIMARY KEY, example_url text NOT NULL, first_seen_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'candidate'
        CHECK(status IN ('candidate','enabled','rejected','deferred'))
    );
  `.execute(db);
}
