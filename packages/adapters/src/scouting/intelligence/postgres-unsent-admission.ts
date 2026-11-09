import { sql, type Kysely } from "kysely";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Releases request/USD admission only after the owning repository fenced a known unsent deferral; token reservations are never touched. */
export async function refundUnsentAdmission(
  db: Kysely<ScoutAlertDatabase>,
  admittedAt: Date,
  reserveMicrousd: number,
): Promise<void> {
  await sql`UPDATE intelligence_daily_budget SET requests=greatest(0,requests-1),reserved_microusd=greatest(0,reserved_microusd-${reserveMicrousd})
    WHERE day=(${admittedAt}::timestamptz AT TIME ZONE 'UTC')::date`.execute(
    db,
  );
}
