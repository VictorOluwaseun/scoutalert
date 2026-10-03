import { sql, type Kysely } from "kysely";

/** Adds public-only route measurements and native repeat counters without resetting provider usage or cursors. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE discovery_routes (
      id text PRIMARY KEY, provider text NOT NULL, kind text NOT NULL CHECK(kind IN ('query','source')),
      target jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE discovery_route_attempts (
      operation_key text PRIMARY KEY REFERENCES web_discovery_operations(key) ON DELETE CASCADE,
      route_id text NOT NULL REFERENCES discovery_routes(id) ON DELETE CASCADE,
      reserved_micros bigint NOT NULL CHECK(reserved_micros>=0), selection text NOT NULL,
      observations integer NOT NULL DEFAULT 0 CHECK(observations>=0), novel integer NOT NULL DEFAULT 0 CHECK(novel>=0),
      settled boolean NOT NULL DEFAULT false, successful boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX discovery_route_attempt_recent_idx ON discovery_route_attempts(route_id,created_at DESC);
    CREATE TABLE discovery_route_leads (
      route_id text NOT NULL REFERENCES discovery_routes(id) ON DELETE CASCADE,
      lead_id text NOT NULL, first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(route_id,lead_id)
    );
    CREATE INDEX discovery_route_lead_recent_idx ON discovery_route_leads(route_id,last_seen_at DESC);
    ALTER TABLE x_posts ADD COLUMN unchanged integer NOT NULL DEFAULT 0 CHECK(unchanged>=0);
    CREATE INDEX x_operation_recent_idx ON web_discovery_operations(created_at DESC) WHERE provider='x-api';
  `.execute(db);
}
