import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import {
  PostgresDiscoveryPerformanceRepository,
  sourceRoute,
} from "./postgres-discovery-performance.js";

/** A shared admission outcome retains ambiguous attempts and distinguishes budget exhaustion from temporary contention. */
export type DocumentAdmission =
  | { status: "claimed"; token: string }
  | { status: "waiting" }
  | { status: "budget" };

/** Serializes document admission across ordinary discovery and monitoring using the same host and daily ledgers. */
export class PostgresDocumentAdmissionRepository {
  /** Joins the caller's source-first transaction; the operation must already be locked and pending. */
  constructor(private readonly tx: Kysely<ScoutAlertDatabase>) {}

  /** Reserves one non-refundable document attempt only when host spacing, global concurrency and daily limits permit. */
  async reserve(
    key: string,
    url: string,
    dailyLimit: number,
    concurrency: number,
    selection = "source_check",
  ): Promise<DocumentAdmission> {
    const hostname = new URL(url).hostname;
    await sql`INSERT INTO web_discovery_hosts(hostname) VALUES(${hostname}) ON CONFLICT DO NOTHING`.execute(
      this.tx,
    );
    const host =
      await sql`SELECT hostname FROM web_discovery_hosts WHERE hostname=${hostname} AND next_allowed_at<=now() AND (lease_until IS NULL OR lease_until<=now()) FOR UPDATE`.execute(
        this.tx,
      );
    if (!host.rows.length) {
      return { status: "waiting" };
    }
    await sql`INSERT INTO web_discovery_usage(provider,day) VALUES('public-documents',(now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`.execute(
      this.tx,
    );
    await sql`SELECT provider FROM web_discovery_usage WHERE provider='public-documents' AND day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE`.execute(
      this.tx,
    );
    const active = await sql<{
      count: number;
    }>`SELECT count(*)::int AS count FROM web_discovery_operations WHERE provider='public-documents' AND state='running' AND lease_until>now()`.execute(
      this.tx,
    );
    if (active.rows[0]!.count >= concurrency) {
      return { status: "waiting" };
    }
    const reserved =
      await sql`UPDATE web_discovery_usage SET requests=requests+1 WHERE provider='public-documents' AND day=(now() AT TIME ZONE 'UTC')::date AND requests<${dailyLimit} RETURNING provider`.execute(
        this.tx,
      );
    if (!reserved.rows.length) {
      return { status: "budget" };
    }
    const token = randomUUID();
    await sql`UPDATE web_discovery_operations SET state='running',lease_token=${token}::uuid,lease_until=now()+interval '45 seconds' WHERE key=${key}`.execute(
      this.tx,
    );
    await sql`UPDATE web_discovery_hosts SET lease_token=${token}::uuid,lease_until=now()+interval '45 seconds' WHERE hostname=${hostname}`.execute(
      this.tx,
    );
    await new PostgresDiscoveryPerformanceRepository(this.tx).admit(
      key,
      sourceRoute("public-documents", url),
      0,
      selection,
    );
    return { status: "claimed", token };
  }
}
