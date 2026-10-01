import type { Kysely } from "kysely";
import type {
  ActivatedScout,
  ScoutActivation,
  ScoutActivationTransaction,
} from "@repo/core/onboarding";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Activation repositories sharing the supplied transaction and verified-owner lock. */
export class PostgresScoutActivationTransaction implements ScoutActivationTransaction {
  /** Receives a transaction client; no method escapes to the shared pool. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {}

  /** Locks the verified owner, serializing concurrent activation retries without duplicate scouts. */
  async lockOwner(ownerId: string): Promise<void> {
    await this.db
      .selectFrom("users")
      .select("id")
      .where("id", "=", ownerId)
      .forUpdate()
      .executeTakeFirstOrThrow();
  }

  /** Reads a request only within the supplied owner's scope. */
  async findRequest(ownerId: string, key: string) {
    return (
      (await this.db
        .selectFrom("activation_requests")
        .select(["fingerprint", "receipt"])
        .where("owner_id", "=", ownerId)
        .where("request_key", "=", key)
        .executeTakeFirst()) ?? null
    );
  }

  /** Claims a snapshot whose revision and approved revision must agree by database constraint. */
  async claimDraft(
    id: string,
    ownerId: string,
    browserHash: string,
    input: ScoutActivation,
    at: Date,
  ): Promise<void> {
    await this.db
      .insertInto("onboarding_drafts")
      .values({
        id,
        owner_id: ownerId,
        browser_hash: browserHash,
        search: input.search,
        revision: 1,
        approved_revision: 1,
        created_at: at,
      })
      .execute();
  }

  /** Creates a versioned scout and explicit preferences with relational ownership constraints. */
  async createScout(
    ownerId: string,
    draftId: string,
    scout: ActivatedScout,
  ): Promise<void> {
    await this.db
      .insertInto("scouts")
      .values({
        id: scout.id,
        owner_id: ownerId,
        draft_id: draftId,
        name: scout.name,
        search: scout.search,
        version: 1,
        status: scout.status,
        discovery_status: scout.discovery,
        activated_at: scout.activatedAt,
      })
      .execute();
    await this.db
      .insertInto("notification_preferences")
      .values({
        scout_id: scout.id,
        owner_id: ownerId,
        preferences: scout.alerts,
        email_enabled: scout.alerts.consent,
        version: 1,
      })
      .execute();
  }

  /** Persists the separate opportunity-alert consent decision, including dashboard-only refusal. */
  async recordConsent(
    id: string,
    ownerId: string,
    scout: ActivatedScout,
  ): Promise<void> {
    await this.db
      .insertInto("consent_events")
      .values({
        id,
        owner_id: ownerId,
        scout_id: scout.id,
        purpose: "opportunity_alerts",
        granted: scout.alerts.consent,
        wording_version: scout.alerts.consentVersion,
        created_at: scout.activatedAt,
      })
      .execute();
  }

  /** Saves a minimal durable dispatch intent with a unique logical discovery identity. */
  async requestDiscovery(
    id: string,
    ownerId: string,
    scout: ActivatedScout,
  ): Promise<void> {
    await this.db
      .insertInto("outbox_events")
      .values({
        id,
        owner_id: ownerId,
        aggregate_id: scout.id,
        aggregate_version: 1,
        event_type: "scout.initial_discovery_requested",
        deduplication_key: `scout.initial:${scout.id}:1`,
        payload: { scoutId: scout.id, ownerId, version: 1 },
        created_at: scout.activatedAt,
        published_at: null,
      })
      .execute();
  }

  /** Commits the owner-scoped immutable retry receipt alongside all activation side effects. */
  async saveRequest(
    ownerId: string,
    key: string,
    fingerprint: string,
    scout: ActivatedScout,
  ): Promise<void> {
    await this.db
      .insertInto("activation_requests")
      .values({
        owner_id: ownerId,
        request_key: key,
        fingerprint,
        scout_id: scout.id,
        receipt: scout,
        created_at: scout.activatedAt,
      })
      .execute();
  }
}
