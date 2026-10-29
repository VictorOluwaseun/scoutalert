import { sql, type Kysely } from "kysely";

/** Adds atomic UTC-day token reservations; historical attempt telemetry remains unchanged. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE intelligence_token_days (
      day date PRIMARY KEY,
      input_tokens bigint NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
      output_tokens bigint NOT NULL DEFAULT 0 CHECK(output_tokens >= 0),
      cached_input_tokens bigint NOT NULL DEFAULT 0 CHECK(cached_input_tokens >= 0 AND cached_input_tokens <= input_tokens),
      reserved_tokens bigint NOT NULL DEFAULT 0 CHECK(reserved_tokens >= 0)
    );
    CREATE TABLE intelligence_token_reservations (
      id uuid PRIMARY KEY,
      day date NOT NULL REFERENCES intelligence_token_days(day),
      model text NOT NULL,
      reserved_tokens bigint NOT NULL CHECK(reserved_tokens > 0),
      state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','completed','unknown')),
      input_tokens bigint CHECK(input_tokens >= 0),
      output_tokens bigint CHECK(output_tokens >= 0),
      cached_input_tokens bigint CHECK(cached_input_tokens >= 0 AND cached_input_tokens <= input_tokens),
      created_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      CHECK((state = 'completed') = (input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND cached_input_tokens IS NOT NULL))
    );
    CREATE INDEX intelligence_token_reservations_day ON intelligence_token_reservations(day,state);
  `.execute(db);
}
