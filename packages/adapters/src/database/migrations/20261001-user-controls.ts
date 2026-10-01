import { sql, type Kysely } from "kysely";

/** Adds user controls without rewriting earlier activation receipts or migration history. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE scouts DROP CONSTRAINT scouts_status_check;
    ALTER TABLE scouts ADD CONSTRAINT scouts_status_check CHECK (status IN ('active','paused'));
    CREATE TABLE scout_change_requests (
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key uuid NOT NULL, fingerprint text NOT NULL, scout_id uuid NOT NULL,
      receipt jsonb NOT NULL, created_at timestamptz NOT NULL,
      PRIMARY KEY(owner_id,request_key),
      FOREIGN KEY(scout_id,owner_id) REFERENCES scouts(id,owner_id) ON DELETE CASCADE
    );
    CREATE TABLE opportunity_feedback (
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      posting_id text NOT NULL REFERENCES opportunity_postings(id),
      value text NOT NULL CHECK(value IN ('relevant','hidden','none')),
      version integer NOT NULL CHECK(version>0), snapshot jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,posting_id)
    );
    CREATE INDEX feedback_hidden_idx ON opportunity_feedback(owner_id,updated_at DESC,posting_id) WHERE value='hidden';
    CREATE TABLE opportunity_feedback_events (
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key uuid NOT NULL, posting_id text NOT NULL REFERENCES opportunity_postings(id),
      fingerprint text NOT NULL, receipt jsonb NOT NULL, context jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,request_key)
    );
  `.execute(db);
}
