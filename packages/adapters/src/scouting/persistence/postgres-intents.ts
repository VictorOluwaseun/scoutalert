import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  DiscoveryIntentRepository,
  type ScoutRunRequest,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Delivers PostgreSQL outbox intents without coupling business transactions to Temporal availability. */
export class PostgresDiscoveryIntentRepository extends DiscoveryIntentRepository {
  /** Receives the shared pool at composition. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }
  /** SKIP LOCKED supports concurrent relays; lost acknowledgements become recoverable after one minute. */
  async claim() {
    const lease = randomUUID();
    const result = await sql<{
      id: string;
      payload: Omit<ScoutRunRequest, "runId">;
    }>`
      WITH pending AS (SELECT id FROM outbox_events WHERE published_at IS NULL AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 25)
      UPDATE outbox_events e SET lease_token=${lease}::uuid,lease_until=now()+interval '1 minute',attempts=attempts+1 FROM pending p WHERE e.id=p.id RETURNING e.id,e.payload
    `.execute(this.db);
    return result.rows.map((row) => ({
      id: row.id,
      lease,
      request: { ...row.payload, runId: row.id },
    }));
  }
  /** Completes dispatch only for the current claim; database failure leaves the admitted workflow safe to redispatch. */
  async acknowledge(id: string, lease: string): Promise<void> {
    await sql`UPDATE outbox_events SET published_at=now(),lease_token=NULL,lease_until=NULL WHERE id=${id}::uuid AND lease_token=${lease}::uuid`.execute(
      this.db,
    );
  }
}
