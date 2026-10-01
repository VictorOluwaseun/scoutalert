import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Constructs a bounded native pg pool and typed Kysely client at the composition boundary. */
export function createPostgresClient(
  connectionString: string,
  applicationName = "scoutalert-api",
): Kysely<ScoutAlertDatabase> {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    lock_timeout: 5000,
    application_name: applicationName,
  });
  // pg emits idle connection errors outside request promises; report no credentials or query bodies.
  pool.on("error", () => {
    console.error("ScoutAlert PostgreSQL idle connection failed.");
  });

  return new Kysely<ScoutAlertDatabase>({
    dialect: new PostgresDialect({ pool }),
  });
}
