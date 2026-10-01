import { sql, type Kysely } from "kysely";

/** Frozen initial migration: relational constraints enforce identity and activation invariants. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE users (
      id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK (email = lower(email)),
      verified_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE email_verification_challenges (
      id uuid PRIMARY KEY, browser_hash text NOT NULL, email text NOT NULL,
      code_digest text NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
      failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
      delivery text NOT NULL CHECK (delivery IN ('pending','accepted','unknown','failed')),
      consumed_at timestamptz, CHECK (expires_at > created_at)
    );
    CREATE INDEX verification_expiry_idx ON email_verification_challenges (expires_at);
    CREATE TABLE verification_flows (
      browser_hash text PRIMARY KEY, current_id uuid REFERENCES email_verification_challenges(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE INDEX verification_flow_expiry_idx ON verification_flows (updated_at);
    CREATE TABLE auth_sessions (
      challenge_id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX session_owner_idx ON auth_sessions (owner_id);
    CREATE INDEX session_expiry_idx ON auth_sessions (expires_at);
    CREATE TABLE onboarding_drafts (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      browser_hash text NOT NULL, search jsonb NOT NULL, revision integer NOT NULL CHECK (revision > 0),
      approved_revision integer NOT NULL CHECK (approved_revision = revision), created_at timestamptz NOT NULL,
      UNIQUE (id, owner_id)
    );
    CREATE INDEX draft_owner_idx ON onboarding_drafts (owner_id);
    CREATE TABLE scouts (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      draft_id uuid NOT NULL UNIQUE, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 207),
      search jsonb NOT NULL, version integer NOT NULL CHECK (version > 0),
      status text NOT NULL CHECK (status = 'active'), discovery_status text NOT NULL CHECK (discovery_status = 'pending'),
      activated_at timestamptz NOT NULL, UNIQUE (id, owner_id),
      FOREIGN KEY (draft_id, owner_id) REFERENCES onboarding_drafts(id, owner_id)
    );
    CREATE INDEX scout_owner_idx ON scouts (owner_id, activated_at DESC);
    CREATE TABLE notification_preferences (
      scout_id uuid PRIMARY KEY, owner_id uuid NOT NULL, preferences jsonb NOT NULL,
      email_enabled boolean NOT NULL, version integer NOT NULL CHECK (version > 0),
      FOREIGN KEY (scout_id, owner_id) REFERENCES scouts(id, owner_id) ON DELETE CASCADE,
      CHECK (email_enabled = (preferences->>'consent')::boolean),
      CHECK ((preferences->>'frequency' <> 'dashboard') OR (NOT email_enabled AND NOT (preferences->>'promptAlerts')::boolean))
    );
    CREATE TABLE consent_events (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL, scout_id uuid NOT NULL,
      purpose text NOT NULL CHECK (purpose = 'opportunity_alerts'), granted boolean NOT NULL,
      wording_version text NOT NULL, created_at timestamptz NOT NULL,
      FOREIGN KEY (scout_id, owner_id) REFERENCES scouts(id, owner_id) ON DELETE CASCADE
    );
    CREATE INDEX consent_scout_idx ON consent_events (scout_id, created_at DESC);
    CREATE TABLE activation_requests (
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_key uuid NOT NULL,
      fingerprint text NOT NULL, scout_id uuid NOT NULL, receipt jsonb NOT NULL,
      created_at timestamptz NOT NULL, PRIMARY KEY (owner_id, request_key),
      FOREIGN KEY (scout_id, owner_id) REFERENCES scouts(id, owner_id)
    );
    CREATE TABLE outbox_events (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      aggregate_id uuid NOT NULL, aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
      event_type text NOT NULL CHECK (event_type = 'scout.initial_discovery_requested'),
      deduplication_key text NOT NULL UNIQUE, payload jsonb NOT NULL,
      created_at timestamptz NOT NULL, published_at timestamptz,
      FOREIGN KEY (aggregate_id, owner_id) REFERENCES scouts(id, owner_id)
    );
    CREATE INDEX outbox_pending_idx ON outbox_events (created_at) WHERE published_at IS NULL;
  `.execute(db);
}
