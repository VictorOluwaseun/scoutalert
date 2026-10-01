import { createHash, randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { ScoutCatalogRepository, ScoutCursor } from "@repo/core/scouts";
import {
  ActivatedScoutRepository,
  ScoutActivationIdentity,
  ScoutActivationUnitOfWork,
  type ScoutActivation,
  type ScoutActivationTransaction,
} from "@repo/core/onboarding";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { PostgresScoutActivationTransaction } from "./postgres-scout-activation-transaction.js";

/** Uses the native transaction client for every repository participating in activation. */
export class PostgresScoutActivationUnitOfWork extends ScoutActivationUnitOfWork {
  /** Receives the shared pool-backed client through composition. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Rollback includes the approved draft, consent and outbox if any repository fails. */
  run<T>(
    operation: (records: ScoutActivationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute((transaction) =>
        operation(new PostgresScoutActivationTransaction(transaction)),
      );
  }
}

/** Produces IDs and deterministic fingerprints for confirmed activation payloads. */
export class NodeScoutActivationIdentity extends ScoutActivationIdentity {
  /** Generates a fresh UUID for a persisted record. */
  id(): string {
    return randomUUID();
  }

  /** Hashes the schema-ordered request snapshot; persisted fingerprints carry no raw brief. */
  fingerprint(input: ScoutActivation): string {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
  }

  /** Stores a digest of the high-entropy browser handle used to claim this draft. */
  browserHash(browser: string): string {
    return createHash("sha256").update(browser).digest("hex");
  }
}

/** Retrieves activated scouts through an explicit owner-scoped query boundary. */
export class PostgresActivatedScoutRepository
  extends ActivatedScoutRepository
  implements ScoutCatalogRepository
{
  /** Receives the shared typed client from composition. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Ownership is checked in SQL before any personal search details are returned. */
  async find(ownerId: string, id: string) {
    const row = await this.ownedQuery(ownerId)
      .where("scouts.id", "=", id)
      .executeTakeFirst();

    return row ? this.toScout(row) : null;
  }

  /** Uses bounded keyset pagination, with ownership enforced before any personal fields are returned. */
  async list(ownerId: string, after: ScoutCursor | null, limit: number) {
    let query = this.ownedQuery(ownerId);

    if (after) {
      query = query.where((eb) =>
        eb.or([
          eb("scouts.activated_at", "<", new Date(after.activatedAt)),
          eb.and([
            eb("scouts.activated_at", "=", new Date(after.activatedAt)),
            eb("scouts.id", "<", after.id),
          ]),
        ]),
      );
    }

    const rows = await query
      .orderBy("scouts.activated_at", "desc")
      .orderBy("scouts.id", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => this.toScout(row));
  }

  /** Shares the same authoritative preference join and owner predicate across receipt and catalog reads. */
  private ownedQuery(ownerId: string) {
    return this.db
      .selectFrom("scouts")
      .innerJoin(
        "notification_preferences",
        "notification_preferences.scout_id",
        "scouts.id",
      )
      .select([
        "scouts.id",
        "scouts.name",
        "scouts.status",
        "scouts.version",
        "scouts.discovery_status",
        "scouts.activated_at",
        "scouts.search",
        "notification_preferences.preferences",
      ])
      .where("scouts.owner_id", "=", ownerId);
  }

  /** Maps database columns to the public saved-scout shape; internal owner and draft IDs stay private. */
  private toScout(row: {
    id: string;
    name: string;
    status: "active" | "paused";
    version: number;
    discovery_status: import("@repo/core/scouting").DiscoveryStatus;
    activated_at: Date;
    search: ScoutActivation["search"];
    preferences: ScoutActivation["alerts"];
  }) {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      version: row.version,
      discovery: row.discovery_status,
      activatedAt: row.activated_at.toISOString(),
      search: row.search,
      alerts: row.preferences,
    };
  }
}
