import { createHash, randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  ScoutManagementRepository,
  type ScoutManagementRecords,
  type ManagedScout,
  type ScoutChange,
} from "@repo/core/scouts";
import type { ScoutAlertDatabase } from "../database/types/database.js";
import { PostgresActivatedScoutRepository } from "../onboarding/persistence/postgres-scout-activation.js";

/** Canonicalizes nested JSON for retry fingerprints without retaining raw user input in the digest. */
export function commandFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

/** Sorts object keys while retaining array order and scalar values. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

/** Binds every lifecycle write to one native transaction; public reads reuse the authoritative scout mapping. */
export class PostgresScoutManagementRepository extends ScoutManagementRepository {
  /** Receives the shared pool-backed Kysely client from Nest composition. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }
  /** Returns a revision-bearing snapshot only for the verified owner. */
  find(ownerId: string, scoutId: string): Promise<ManagedScout | null> {
    return new PostgresActivatedScoutRepository(this.db).find(ownerId, scoutId);
  }
  /** Uses transaction-bound records exclusively, rolling back state and intents together. */
  transaction<T>(
    work: (records: ScoutManagementRecords) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute((tx) => work(new PostgresScoutManagementRecords(tx)));
  }
  /** Includes target, action, expected revision and complete confirmed inputs in retry identity. */
  fingerprint(scoutId: string, input: ScoutChange): string {
    return commandFingerprint({ scoutId, input });
  }
}

/** Owns query details for one lifecycle transaction with owner-before-scout lock ordering. */
class PostgresScoutManagementRecords implements ScoutManagementRecords {
  /** Receives the native transaction client; never escapes to a shared pool. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {}
  /** Serializes with alert reservation and feedback for the same recipient. */
  async lockOwner(ownerId: string): Promise<void> {
    await this.db
      .selectFrom("users")
      .select("id")
      .where("id", "=", ownerId)
      .forUpdate()
      .executeTakeFirstOrThrow();
  }
  /** Reads the immutable command receipt scoped to its authenticated owner. */
  async receipt(ownerId: string, key: string) {
    const found = await this.db
      .selectFrom("scout_change_requests")
      .select(["fingerprint", "receipt"])
      .where("owner_id", "=", ownerId)
      .where("request_key", "=", key)
      .executeTakeFirst();
    return found
      ? { fingerprint: found.fingerprint, scout: found.receipt }
      : null;
  }
  /** Locks current input revisions before the use case compares the reviewed version. */
  async find(ownerId: string, scoutId: string): Promise<ManagedScout | null> {
    await this.db
      .selectFrom("scouts")
      .select("id")
      .where("owner_id", "=", ownerId)
      .where("id", "=", scoutId)
      .forUpdate()
      .execute();
    await this.db
      .selectFrom("notification_preferences")
      .select("scout_id")
      .where("owner_id", "=", ownerId)
      .where("scout_id", "=", scoutId)
      .forUpdate()
      .execute();
    return new PostgresActivatedScoutRepository(this.db).find(ownerId, scoutId);
  }
  /** Invalidates old recommendation/worker revisions while preserving immutable onboarding approval history. */
  async save(ownerId: string, scout: ManagedScout, at: Date): Promise<void> {
    await this.db
      .updateTable("scouts")
      .set({
        name: scout.name,
        search: scout.search,
        version: scout.version,
        status: scout.status,
        discovery_status: scout.discovery,
        discovery_requested_at: at,
      })
      .where("id", "=", scout.id)
      .where("owner_id", "=", ownerId)
      .execute();
    await this.db
      .updateTable("notification_preferences")
      .set({
        preferences: scout.alerts,
        email_enabled: scout.alerts.consent,
        version: sql`version+1`,
      })
      .where("scout_id", "=", scout.id)
      .where("owner_id", "=", ownerId)
      .execute();
    await this.db
      .updateTable("discovery_runs")
      .set({ status: "cancelled", finished_at: at })
      .where("owner_id", "=", ownerId)
      .where("scout_id", "=", scout.id)
      .where("status", "=", "searching")
      .execute();
    await this.db
      .deleteFrom("scout_recommendations")
      .where("owner_id", "=", ownerId)
      .where("scout_id", "=", scout.id)
      .execute();
  }
  /** Records only an explicitly edited alert choice; monotonic timestamps disambiguate rapid consent changes. */
  async recordConsent(
    ownerId: string,
    scout: ManagedScout,
    at: Date,
  ): Promise<void> {
    await this.db
      .insertInto("consent_events")
      .values({
        id: randomUUID(),
        owner_id: ownerId,
        scout_id: scout.id,
        purpose: "opportunity_alerts",
        granted: scout.alerts.consent,
        wording_version: scout.alerts.consentVersion,
        created_at: sql`greatest(${at}::timestamptz, clock_timestamp(), (select max(created_at) + interval '1 microsecond' from consent_events where scout_id=${scout.id}::uuid))`,
      })
      .execute();
  }
  /** Creates one event per new active revision; worker admission rejects every superseded revision. */
  async requestDiscovery(
    ownerId: string,
    scout: ManagedScout,
    at: Date,
  ): Promise<void> {
    await this.db
      .insertInto("outbox_events")
      .values({
        id: randomUUID(),
        owner_id: ownerId,
        aggregate_id: scout.id,
        aggregate_version: scout.version,
        event_type: "scout.refresh_requested",
        deduplication_key: `scout.change:${scout.id}:${scout.version}`,
        payload: { scoutId: scout.id, ownerId, version: scout.version },
        created_at: at,
        published_at: null,
      })
      .execute();
  }
  /** Persists the successful response in the same transaction as every side effect. */
  async saveReceipt(
    ownerId: string,
    key: string,
    fingerprint: string,
    scout: ManagedScout,
    at: Date,
  ): Promise<void> {
    await this.db
      .insertInto("scout_change_requests")
      .values({
        owner_id: ownerId,
        request_key: key,
        fingerprint,
        scout_id: scout.id,
        receipt: scout,
        created_at: at,
      })
      .execute();
  }
}
