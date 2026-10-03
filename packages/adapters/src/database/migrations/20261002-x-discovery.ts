import { sql, type Kysely } from "kysely";

/** Adds shared native queries and cursors, current scout interests, post identities and transactional delivery to existing review. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE x_search_queries (
      id text PRIMARY KEY, query text NOT NULL, policy text NOT NULL,
      covered_until timestamptz, window_start timestamptz, window_end timestamptz, next_token text,
      next_check_at timestamptz NOT NULL DEFAULT now(), last_checked_at timestamptz,
      pending_key text REFERENCES web_discovery_operations(key), reason text, gaps integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX x_query_due_idx ON x_search_queries(next_check_at,id);
    CREATE TABLE x_scout_plans (
      scout_id uuid PRIMARY KEY, owner_id uuid NOT NULL, scout_version integer NOT NULL, policy text NOT NULL, reason text,
      FOREIGN KEY(scout_id,owner_id) REFERENCES scouts(id,owner_id) ON DELETE CASCADE
    );
    CREATE TABLE x_search_interests (
      query_id text NOT NULL REFERENCES x_search_queries(id), scout_id uuid NOT NULL, owner_id uuid NOT NULL,
      scout_version integer NOT NULL, PRIMARY KEY(query_id,scout_id),
      FOREIGN KEY(scout_id,owner_id) REFERENCES scouts(id,owner_id) ON DELETE CASCADE
    );
    CREATE INDEX x_interest_scout_idx ON x_search_interests(scout_id,scout_version);
    CREATE TABLE x_posts (
      lead_id text PRIMARY KEY REFERENCES web_discovery_leads(id), post_id text NOT NULL,
      edit_ids text[] NOT NULL, expires_at timestamptz NOT NULL, next_check_at timestamptz NOT NULL,
      unavailable boolean NOT NULL DEFAULT false
    );
    CREATE INDEX x_post_due_idx ON x_posts(next_check_at) WHERE NOT unavailable;
    CREATE INDEX x_post_expiry_idx ON x_posts(expires_at) WHERE NOT unavailable;
    CREATE INDEX x_post_edits_idx ON x_posts USING gin(edit_ids);
    CREATE TABLE x_query_posts (
      query_id text NOT NULL REFERENCES x_search_queries(id), lead_id text NOT NULL REFERENCES x_posts(lead_id),
      PRIMARY KEY(query_id,lead_id)
    );
    CREATE TABLE x_search_attempts (
      key text PRIMARY KEY REFERENCES web_discovery_operations(key), query_id text REFERENCES x_search_queries(id),
      returned_posts integer NOT NULL DEFAULT 0, new_posts integer NOT NULL DEFAULT 0, overlap_posts integer NOT NULL DEFAULT 0,
      latency_ms integer, partial boolean NOT NULL DEFAULT false
    );
    CREATE TABLE x_source_updates (
      lead_id text NOT NULL REFERENCES x_posts(lead_id), scout_id uuid NOT NULL, owner_id uuid NOT NULL,
      scout_version integer NOT NULL, case_id uuid REFERENCES web_discovery_cases(id) ON DELETE SET NULL,
      observed_at timestamptz NOT NULL, PRIMARY KEY(lead_id,scout_id,scout_version),
      FOREIGN KEY(scout_id,owner_id) REFERENCES scouts(id,owner_id) ON DELETE CASCADE
    );
    CREATE INDEX x_updates_pending_idx ON x_source_updates(observed_at,scout_id) WHERE case_id IS NULL;
    CREATE TABLE x_access_state (id integer PRIMARY KEY CHECK(id=1), next_allowed_at timestamptz NOT NULL DEFAULT now(), reason text);
    INSERT INTO x_access_state(id) VALUES(1);
  `.execute(db);
}
