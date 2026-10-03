import { sql, type Kysely } from "kysely";

/** Adds shared URL monitors, private revision interests, immutable check receipts and recoverable fan-out. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE scouts ADD COLUMN monitoring_requested_at timestamptz NOT NULL DEFAULT '-infinity';
    CREATE TABLE web_source_monitors (
      id text PRIMARY KEY REFERENCES web_discovery_leads(id), url text NOT NULL UNIQUE,
      kind text NOT NULL CHECK(kind IN ('directory','posting','probe')),
      status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','deferred','pending_review','retired')),
      reason text NOT NULL DEFAULT 'reviewed_source', depth integer NOT NULL DEFAULT 0 CHECK(depth BETWEEN 0 AND 2),
      parent_id text REFERENCES web_source_monitors(id), review_key text REFERENCES web_lead_reviews(key),
      fingerprint text, unchanged integer NOT NULL DEFAULT 0, failures integer NOT NULL DEFAULT 0,
      next_check_at timestamptz NOT NULL, checked_at timestamptz, pending_key text REFERENCES web_discovery_operations(key),
      checks integer NOT NULL DEFAULT 0, changes integer NOT NULL DEFAULT 0, discovered_links integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX web_monitor_due_idx ON web_source_monitors(next_check_at,id) WHERE status IN ('active','deferred','pending_review');
    CREATE TABLE web_source_interests (
      monitor_id text NOT NULL REFERENCES web_source_monitors(id), scout_id uuid NOT NULL, owner_id uuid NOT NULL,
      scout_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(monitor_id,scout_id),
      FOREIGN KEY(scout_id,owner_id) REFERENCES scouts(id,owner_id) ON DELETE CASCADE
    );
    CREATE INDEX web_source_interest_scout_idx ON web_source_interests(scout_id,scout_version);
    CREATE TABLE web_source_monitor_links (
      parent_id text NOT NULL REFERENCES web_source_monitors(id), url text NOT NULL, title text NOT NULL,
      child_id text REFERENCES web_source_monitors(id), first_seen_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL,
      PRIMARY KEY(parent_id,url)
    );
    CREATE TABLE web_source_checks (
      operation_key text PRIMARY KEY REFERENCES web_discovery_operations(key), monitor_id text NOT NULL REFERENCES web_source_monitors(id),
      status text NOT NULL, reason text NOT NULL, changed boolean NOT NULL, new_links integer NOT NULL DEFAULT 0,
      checked_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE web_source_updates (
      operation_key text NOT NULL REFERENCES web_source_checks(operation_key), monitor_id text NOT NULL REFERENCES web_source_monitors(id),
      scout_id uuid NOT NULL, owner_id uuid NOT NULL, scout_version integer NOT NULL,
      case_id uuid REFERENCES web_discovery_cases(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(operation_key,scout_id),
      FOREIGN KEY(scout_id,owner_id) REFERENCES scouts(id,owner_id) ON DELETE CASCADE
    );
    CREATE INDEX web_source_updates_pending_idx ON web_source_updates(scout_id,created_at) WHERE case_id IS NULL;
  `.execute(db);
}
