import { sql, type Kysely } from "kysely";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Locks the two web source aggregates before scouts, cases, reviews and leads, matching delivery's source-first order. */
export async function lockWebSources(
  tx: Kysely<ScoutAlertDatabase>,
): Promise<void> {
  await sql`SELECT id FROM opportunity_sources WHERE id IN ('web-client-requests','web-discovery') ORDER BY id FOR UPDATE`.execute(
    tx,
  );
}
