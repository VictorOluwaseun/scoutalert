import { sql, type Kysely } from "kysely";

/** Adds durable account admission and paid-call accounting without resetting base usage or altering existing scouts. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE beta_accounts(owner_id uuid PRIMARY KEY REFERENCES users(id), admitted_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO beta_accounts(owner_id) SELECT DISTINCT owner_id FROM scouts;
    CREATE TABLE beta_discovery_windows(owner_id uuid PRIMARY KEY REFERENCES users(id), run_id uuid NOT NULL, started_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE beta_discovery_dispatch(id integer PRIMARY KEY CHECK(id=1), next_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO beta_discovery_windows(owner_id,run_id,started_at)
      SELECT DISTINCT ON(owner_id) owner_id,id,started_at FROM web_discovery_cases
      WHERE coalesce(plan->>'origin','') NOT IN ('source_monitor','native_social') ORDER BY owner_id,started_at DESC;
    ALTER TABLE intelligence_token_reservations ADD COLUMN owner_id uuid,
      ADD COLUMN funding text NOT NULL DEFAULT 'base' CHECK(funding IN ('base','paid'));
    UPDATE intelligence_token_reservations r SET owner_id=s.owner_id FROM scouts s WHERE s.id=r.scout_id;
    CREATE INDEX intelligence_token_owner_day ON intelligence_token_reservations(day,model,owner_id);
    ALTER TABLE intelligence_token_demand ADD COLUMN owner_id uuid;
    ALTER TABLE intelligence_token_demand DROP CONSTRAINT intelligence_token_demand_check;
    ALTER TABLE intelligence_token_demand ADD CHECK(
      (scout_id IS NULL AND scout_version IS NULL AND owner_id IS NULL AND participant='shared') OR
      (scout_id IS NOT NULL AND scout_version>0 AND (participant=scout_id::text OR participant=owner_id::text)));
    CREATE TABLE intelligence_paid_budgets(
      family text PRIMARY KEY, period_anchor date NOT NULL, period_days integer NOT NULL CHECK(period_days BETWEEN 1 AND 366),
      credit numeric NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE intelligence_paid_reservations(
      id uuid PRIMARY KEY REFERENCES intelligence_token_reservations(id), family text NOT NULL,
      period_start date NOT NULL, day date NOT NULL, reserved_microusd bigint NOT NULL CHECK(reserved_microusd>0),
      actual_microusd bigint CHECK(actual_microusd>=0), input_rate numeric NOT NULL CHECK(input_rate>0),
      cached_rate numeric NOT NULL CHECK(cached_rate>=0), output_rate numeric NOT NULL CHECK(output_rate>0));
    CREATE INDEX intelligence_paid_period ON intelligence_paid_reservations(family,period_start,day);
  `.execute(db);
}
