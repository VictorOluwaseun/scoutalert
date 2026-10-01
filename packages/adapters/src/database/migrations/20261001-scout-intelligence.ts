import { sql, type Kysely } from "kysely";

/** Adds versioned public/private analysis, fenced attempts and atomic UTC daily request budgets. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE intelligence_tasks (
      id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('extraction','fit')),
      configuration text NOT NULL, posting_id text NOT NULL REFERENCES opportunity_postings(id), posting_version integer NOT NULL,
      owner_id uuid REFERENCES users(id) ON DELETE CASCADE, scout_id uuid, scout_version integer,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','ready','failed')),
      result jsonb, lease_token uuid, lease_until timestamptz, retry_at timestamptz,
      attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(scout_id,owner_id) REFERENCES scouts(id,owner_id) ON DELETE CASCADE,
      CHECK((kind='extraction' AND owner_id IS NULL AND scout_id IS NULL AND scout_version IS NULL) OR (kind='fit' AND owner_id IS NOT NULL AND scout_id IS NOT NULL AND scout_version IS NOT NULL)),
      CHECK((status='ready')=(result IS NOT NULL))
    );
    CREATE TABLE intelligence_run_batches (
      run_id uuid PRIMARY KEY REFERENCES discovery_runs(id) ON DELETE CASCADE,
      configuration text NOT NULL, selected text[] NOT NULL CHECK(cardinality(selected)<=8)
    );
    CREATE INDEX intelligence_public_idx ON intelligence_tasks(posting_id,posting_version,configuration) WHERE kind='extraction' AND status='ready';
    CREATE INDEX intelligence_private_idx ON intelligence_tasks(owner_id,scout_id,scout_version,configuration,posting_id,posting_version) WHERE kind='fit';
    CREATE INDEX intelligence_pending_idx ON intelligence_tasks(lease_until) WHERE status='running';
    CREATE TABLE intelligence_daily_budget (day date PRIMARY KEY, requests integer NOT NULL CHECK(requests>=0));
    CREATE TABLE intelligence_attempts (
      id uuid PRIMARY KEY, task_id text NOT NULL REFERENCES intelligence_tasks(id) ON DELETE CASCADE,
      started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
      outcome text CHECK(outcome IN ('ready','provider_unavailable','invalid_evidence','superseded')),
      usage jsonb
    );
    CREATE INDEX intelligence_attempt_time_idx ON intelligence_attempts(started_at);
  `.execute(db);
}
