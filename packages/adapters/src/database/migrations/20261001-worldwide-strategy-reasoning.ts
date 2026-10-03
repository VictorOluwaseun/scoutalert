import { sql, type Kysely } from "kysely";

/** Shares immutable public reasoning and binds each current run phase to a single reserved attempt window. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE web_reasoning_tasks (
      key text PRIMARY KEY, configuration text NOT NULL, input jsonb NOT NULL,
      state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','ready','failed')),
      output jsonb, rejected_output jsonb, failure text, usage jsonb, cost jsonb,
      lease_token uuid UNIQUE, lease_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
    );
    CREATE INDEX web_reasoning_active ON web_reasoning_tasks(lease_until) WHERE state='running';
    CREATE TABLE web_reasoning_phases (
      run_id uuid NOT NULL, phase text NOT NULL,
      scout_id uuid NOT NULL REFERENCES scouts(id) ON DELETE CASCADE, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scout_version integer NOT NULL,
      task_key text NOT NULL REFERENCES web_reasoning_tasks(key),
      deadline timestamptz NOT NULL DEFAULT now()+interval '60 seconds',
      PRIMARY KEY(run_id,phase)
    );
    ALTER TABLE web_lead_review_cases ADD COLUMN round integer NOT NULL DEFAULT -1;
    ALTER TABLE web_lead_review_cases ADD COLUMN source_only boolean NOT NULL DEFAULT false;
  `.execute(db);
}
