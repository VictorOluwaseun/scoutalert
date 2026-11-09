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
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly beta?: {
      refreshMinutes: number;
      dispatchIntervalMinutes: number;
    },
  ) {
    super();
  }

  /** SKIP LOCKED supports concurrent relays; lost acknowledgements become recoverable after one minute. */
  async claim() {
    const lease = randomUUID();
    if (this.beta) {
      return this.claimBeta(lease);
    }
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

  /** Spaces fresh deep searches before workflows start, preserving their finite execution time for useful work. */
  private async claimBeta(lease: string) {
    return this.db.transaction().execute(async (tx) => {
      await sql`INSERT INTO beta_discovery_dispatch(id) VALUES(1) ON CONFLICT DO NOTHING`.execute(
        tx,
      );
      const gate = await sql<{
        ready: boolean;
      }>`SELECT next_at<=now() AS ready FROM beta_discovery_dispatch WHERE id=1 FOR UPDATE`.execute(
        tx,
      );
      await sql`UPDATE outbox_events e SET published_at=now(),lease_token=NULL,lease_until=NULL
        WHERE published_at IS NULL AND (lease_until IS NULL OR lease_until<now())
          AND NOT EXISTS(SELECT 1 FROM scouts s WHERE s.id=e.aggregate_id AND s.owner_id=e.owner_id AND s.version=e.aggregate_version AND s.status='active')`.execute(
        tx,
      );
      const updates = await this.claimBetaBatch(tx, lease, false);
      const fresh = gate.rows[0]!.ready
        ? await this.claimBetaBatch(tx, lease, true)
        : [];
      if (fresh.length) {
        await sql`UPDATE beta_discovery_dispatch SET next_at=now()+make_interval(mins=>${this.beta!.dispatchIntervalMinutes}) WHERE id=1`.execute(
          tx,
        );
      }
      return [...updates, ...fresh].map((row) => ({
        id: row.id,
        lease,
        request: { ...row.payload, runId: row.id },
      }));
    });
  }

  /** Source updates, matching-only edits and lost acknowledgements never wait behind fresh broad searches. */
  private async claimBetaBatch(
    db: Kysely<ScoutAlertDatabase>,
    lease: string,
    fresh: boolean,
  ) {
    const needsSearch = sql`e.attempts=0 AND e.deduplication_key NOT LIKE 'source-monitor:%' AND e.deduplication_key NOT LIKE 'native-x:%'
      AND NOT EXISTS(SELECT 1 FROM beta_discovery_windows w WHERE w.owner_id=e.owner_id AND w.started_at>now()-make_interval(mins=>${this.beta!.refreshMinutes}))`;
    const result = await sql<{
      id: string;
      payload: Omit<ScoutRunRequest, "runId">;
    }>`WITH pending AS (
      SELECT e.id FROM outbox_events e WHERE e.published_at IS NULL AND (e.lease_until IS NULL OR e.lease_until<now())
        AND ${fresh ? needsSearch : sql`NOT(${needsSearch})`} ORDER BY e.created_at,e.id FOR UPDATE SKIP LOCKED LIMIT ${fresh ? 1 : 25})
      UPDATE outbox_events e SET lease_token=${lease}::uuid,lease_until=now()+interval '1 minute',attempts=attempts+1 FROM pending p WHERE e.id=p.id RETURNING e.id,e.payload`.execute(
      db,
    );
    return result.rows;
  }

  /** Completes dispatch only for the current claim; database failure leaves the admitted workflow safe to redispatch. */
  async acknowledge(id: string, lease: string): Promise<void> {
    await sql`UPDATE outbox_events SET published_at=now(),lease_token=NULL,lease_until=NULL WHERE id=${id}::uuid AND lease_token=${lease}::uuid`.execute(
      this.db,
    );
  }
}
