import { sql, type Kysely } from "kysely";

/** Adds durable refill balances and attributed waiting demand; existing token usage and uncertain reservations are untouched. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE intelligence_token_reservations ADD COLUMN scout_id uuid, ADD COLUMN pacing_debited boolean NOT NULL DEFAULT false;
    CREATE INDEX intelligence_token_scout_day ON intelligence_token_reservations(day,model,purpose,scout_id);
    CREATE TABLE intelligence_token_pacing (
      family text NOT NULL, purpose text NOT NULL CHECK(purpose IN ('all','standard','audit')),
      credit numeric NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(family,purpose)
    );
    CREATE TABLE intelligence_token_demand (
      family text NOT NULL, purpose text NOT NULL CHECK(purpose IN ('standard','audit')),
      participant text NOT NULL, scout_id uuid, scout_version integer,
      work_class text NOT NULL CHECK(work_class IN ('discovery','maintenance')),
      requested_tokens bigint NOT NULL CHECK(requested_tokens>0),
      requested_at timestamptz NOT NULL DEFAULT now(), seen_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(family,purpose,participant),
      CHECK((scout_id IS NULL AND scout_version IS NULL AND participant='shared') OR (scout_id IS NOT NULL AND scout_version>0 AND participant=scout_id::text))
    );
    CREATE INDEX intelligence_token_demand_time ON intelligence_token_demand(family,purpose,seen_at);
  `.execute(db);
}
