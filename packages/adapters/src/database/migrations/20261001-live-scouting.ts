import { sql, type Kysely } from "kysely";

/** Adds shared source evidence, bounded discovery runs, leased dispatch, and a recipient delivery ledger. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE scouts DROP CONSTRAINT scouts_discovery_status_check;
    ALTER TABLE scouts ADD CHECK (discovery_status IN ('pending','searching','completed','failed','coverage_unavailable'));
    ALTER TABLE scouts ADD COLUMN discovery_requested_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE outbox_events DROP CONSTRAINT outbox_events_event_type_check;
    ALTER TABLE outbox_events ADD CHECK (event_type IN ('scout.initial_discovery_requested','scout.refresh_requested'));
    ALTER TABLE outbox_events ADD COLUMN lease_token uuid;
    ALTER TABLE outbox_events ADD COLUMN lease_until timestamptz;
    ALTER TABLE outbox_events ADD COLUMN attempts integer NOT NULL DEFAULT 0;
    CREATE INDEX scout_reconciliation_idx ON scouts (discovery_requested_at, id) WHERE status='active';
    CREATE TABLE opportunity_sources (
      id text PRIMARY KEY, checked_at timestamptz, last_error_at timestamptz,
      lease_token uuid, lease_until timestamptz, posting_count integer NOT NULL DEFAULT 0
    );
    CREATE TABLE opportunity_postings (
      id text PRIMARY KEY, source_id text NOT NULL REFERENCES opportunity_sources(id), external_id text NOT NULL,
      family_id text NOT NULL, company text NOT NULL, title text NOT NULL, location text NOT NULL,
      url text NOT NULL CHECK (url LIKE 'https://%'), content text NOT NULL,
      fingerprint text NOT NULL, version integer NOT NULL CHECK (version>0),
      source_updated_at timestamptz NOT NULL, checked_at timestamptz NOT NULL, open boolean NOT NULL,
      search_document tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', content), 'B')
      ) STORED,
      UNIQUE (source_id, external_id)
    );
    CREATE INDEX posting_search_idx ON opportunity_postings USING gin(search_document) WHERE open;
    CREATE INDEX posting_source_idx ON opportunity_postings (source_id, open);
    CREATE TABLE opportunity_evidence (
      posting_id text NOT NULL REFERENCES opportunity_postings(id), version integer NOT NULL,
      snapshot jsonb NOT NULL, recorded_at timestamptz NOT NULL,
      PRIMARY KEY (posting_id, version)
    );
    CREATE TABLE discovery_runs (
      id uuid PRIMARY KEY, scout_id uuid NOT NULL, owner_id uuid NOT NULL, scout_version integer NOT NULL,
      status text NOT NULL CHECK (status IN ('searching','completed','failed','cancelled','coverage_unavailable')),
      started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, match_count integer NOT NULL DEFAULT 0,
      FOREIGN KEY (scout_id, owner_id) REFERENCES scouts(id, owner_id) ON DELETE CASCADE
    );
    CREATE INDEX discovery_run_scout_idx ON discovery_runs (scout_id, started_at DESC);
    CREATE TABLE scout_recommendations (
      scout_id uuid NOT NULL, owner_id uuid NOT NULL, scout_version integer NOT NULL,
      posting_id text NOT NULL REFERENCES opportunity_postings(id), posting_version integer NOT NULL,
      assessment jsonb NOT NULL, rank integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (scout_id, posting_id),
      FOREIGN KEY (scout_id, owner_id) REFERENCES scouts(id, owner_id) ON DELETE CASCADE
    );
    CREATE INDEX recommendation_owner_idx ON scout_recommendations (owner_id, rank DESC, created_at DESC);
    CREATE TABLE opportunity_deliveries (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), window_key text NOT NULL,
      recipient text NOT NULL, contents jsonb NOT NULL,
      status text NOT NULL CHECK (status IN ('submitting','accepted','rejected','unknown')),
      provider_message_id text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
      UNIQUE (owner_id, window_key)
    );
    CREATE TABLE opportunity_delivery_items (
      owner_id uuid NOT NULL REFERENCES users(id), posting_id text NOT NULL REFERENCES opportunity_postings(id),
      delivery_id uuid NOT NULL REFERENCES opportunity_deliveries(id),
      PRIMARY KEY (owner_id, posting_id)
    );
    CREATE INDEX delivery_uncertain_idx ON opportunity_deliveries (created_at) WHERE status='submitting';
  `.execute(db);
}
