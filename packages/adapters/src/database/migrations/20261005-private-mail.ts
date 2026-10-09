import { sql, type Kysely } from "kysely";

/** Adds owner-isolated mail grants and evidence, with no foreign keys into shared public discovery. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE mail_connections (
      owner_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','reconnect')),
      revision integer NOT NULL DEFAULT 0,
      oauth_revision integer NOT NULL DEFAULT 0,
      email text,
      grant_ciphertext text,
      label_id text,
      label_name text,
      requested boolean NOT NULL DEFAULT false,
      checkpoint bigint,
      scan_after bigint,
      scan_before bigint,
      cursor text,
      lease_token uuid,
      lease_until timestamptz,
      next_attempt timestamptz NOT NULL DEFAULT now(),
      last_imported_at timestamptz,
      error text,
      failures integer NOT NULL DEFAULT 0,
      budget_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
      pages_today integer NOT NULL DEFAULT 0 CHECK (pages_today BETWEEN 0 AND 100),
      CHECK ((label_id IS NULL) = (label_name IS NULL)),
      CHECK (status = 'disconnected' OR grant_ciphertext IS NOT NULL)
    );
    CREATE INDEX mail_connections_due ON mail_connections(next_attempt, owner_id)
      WHERE requested AND status = 'connected';
    CREATE TABLE mail_oauth_states (
      state_hash text PRIMARY KEY,
      owner_id uuid NOT NULL UNIQUE REFERENCES mail_connections(owner_id) ON DELETE CASCADE,
      browser_hash text NOT NULL,
      revision integer NOT NULL,
      verifier_ciphertext text NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX mail_oauth_expiry ON mail_oauth_states(expires_at);
    CREATE TABLE private_mail_items (
      owner_id uuid NOT NULL REFERENCES mail_connections(owner_id) ON DELETE CASCADE,
      external_id text NOT NULL,
      content_ciphertext text NOT NULL,
      received_at timestamptz NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
      PRIMARY KEY(owner_id, external_id)
    );
    CREATE INDEX private_mail_recent ON private_mail_items(owner_id, received_at DESC, external_id);
    CREATE INDEX private_mail_expiry ON private_mail_items(expires_at);
  `.execute(db);
}
