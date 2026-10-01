import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  PostgresScoutManagementRepository,
  PostgresOpportunityFeedbackRepository,
} from "@repo/adapters/scouts";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "@repo/adapters/onboarding";
import {
  PostgresSourceRepository,
  PostgresScoutingRepository,
  PostgresOpportunityCatalogRepository,
} from "@repo/adapters/scouting";
import { PostgresOpportunityDeliveryRepository } from "@repo/adapters/notifications";
import {
  ActivateScout,
  ReviewSearchDraft,
  type ScoutAlerts,
} from "@repo/core/onboarding";
import {
  ManageScout,
  RecordOpportunityFeedback,
  type ManagedScout,
  type ScoutChange,
} from "@repo/core/scouts";
import { assessPosting } from "@repo/core/scouting";
import { digestWindow } from "@repo/core/notifications";
import { search, posting } from "./fixtures/intelligence.js";

describe.skipIf(process.env.SCOUTING_INTEGRATION !== "1")(
  "owner-scoped scout controls and feedback",
  () => {
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let manage: ManageScout;
    let records: PostgresScoutManagementRepository;
    let runs: PostgresScoutingRepository;
    let catalog: PostgresOpportunityCatalogRepository;
    let feedback: RecordOpportunityFeedback;
    let delivery: PostgresOpportunityDeliveryRepository;
    const schema = `controls_${randomUUID().replaceAll("-", "")}`;
    const alerts: ScoutAlerts = {
      frequency: "daily",
      timezone: "UTC",
      deliveryTime: "00:00",
      weekday: "Monday",
      promptAlerts: false,
      consent: true,
      consentVersion: "opportunity-alerts-v1",
    };

    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = "/scoutalert_test";
      admin = createPostgresClient(url.toString());
      await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
      url.searchParams.set("options", `-c search_path=${schema}`);
      db = createPostgresClient(url.toString());
      await migrateDatabase(db, schema);
      records = new PostgresScoutManagementRepository(db);
      manage = new ManageScout(
        records,
        new ReviewSearchDraft(),
        () => new Date(),
      );
      runs = new PostgresScoutingRepository(db);
      catalog = new PostgresOpportunityCatalogRepository(db);
      feedback = new RecordOpportunityFeedback(
        new PostgresOpportunityFeedbackRepository(db),
      );
      delivery = new PostgresOpportunityDeliveryRepository(db);
      const sources = new PostgresSourceRepository(db);
      const lease = await sources.claim(posting.source, new Date());
      await sources.publish(
        {
          source: posting.source,
          checkedAt: new Date().toISOString(),
          postings: [posting],
        },
        lease!,
      );
    });

    afterAll(async () => {
      await db?.destroy();
      await sql`DROP SCHEMA IF EXISTS ${sql.id(schema)} CASCADE`.execute(admin);
      await admin?.destroy();
    });

    /** Creates a synthetic owner with independent identity and explicit email consent. */
    async function owner(): Promise<string> {
      const id = randomUUID();
      await db
        .insertInto("users")
        .values({ id, email: `${id}@scoutalert.test`, verified_at: new Date() })
        .execute();
      return id;
    }
    /** Starts an independent recipient scan so random UUID ordering from a preceding test cannot skip this fixture. */
    async function deliveryCandidates(ownerId: string) {
      await db
        .updateTable("delivery_scan_cursor")
        .set({ after_owner: null })
        .where("id", "=", 1)
        .execute();
      return (await delivery.candidates()).filter(
        (item) => item.ownerId === ownerId,
      );
    }

    /** Uses the real activation transaction so all FK, consent and retry records exist. */
    async function activate(ownerId: string): Promise<ManagedScout> {
      const activation = new ActivateScout(
        new ReviewSearchDraft(),
        new PostgresScoutActivationUnitOfWork(db),
        new NodeScoutActivationIdentity(),
        () => new Date(),
      );
      const scout = await activation.execute(ownerId, "controls-test", {
        key: randomUUID(),
        search,
        alerts,
        confirmed: true,
      });
      return (await records.find(ownerId, scout.id))!;
    }
    /** Publishes a real versioned recommendation under the same constraints used by a worker. */
    async function recommend(ownerId: string, scout: ManagedScout) {
      const context = (await runs.begin({
        ownerId,
        scoutId: scout.id,
        version: scout.version,
        runId: randomUUID(),
      }))!;
      await runs.complete(context, [
        { posting, assessment: assessPosting(search, posting)! },
      ]);
      return context;
    }

    it("pauses before new reservation, fences old runs and resumes once despite lost-response retries", async () => {
      const id = await owner();
      const scout = await activate(id);
      const context = await recommend(id, scout);
      const candidates = await deliveryCandidates(id);
      expect(candidates).toHaveLength(1);
      const change: ScoutChange = {
        key: randomUUID(),
        version: 1,
        action: "pause",
      };
      const paused = await manage.execute(id, scout.id, change);
      expect(paused).toMatchObject({ status: "paused", version: 2, alerts });
      expect(
        await db
          .selectFrom("consent_events")
          .select("id")
          .where("scout_id", "=", scout.id)
          .execute(),
      ).toHaveLength(1);
      expect(await manage.execute(id, scout.id, change)).toEqual(paused);
      expect(
        await runs.begin({ ...context.request, runId: randomUUID() }),
      ).toBeNull();
      await runs.complete(context, [
        { posting, assessment: assessPosting(search, posting)! },
      ]);
      expect(await catalog.list(id)).toEqual([]);
      expect(
        await delivery.prepare(
          id,
          digestWindow(alerts, new Date())!,
          candidates,
        ),
      ).toBeNull();
      const resume: ScoutChange = {
        key: randomUUID(),
        version: 2,
        action: "resume",
      };
      const resumed = await manage.execute(id, scout.id, resume);
      expect(resumed).toMatchObject({
        status: "active",
        version: 3,
        discovery: "pending",
      });
      await manage.execute(id, scout.id, resume);
      const outbox = await db
        .selectFrom("outbox_events")
        .selectAll()
        .where("aggregate_id", "=", scout.id)
        .execute();
      expect(outbox.map((item) => item.aggregate_version).sort()).toEqual([
        1, 3,
      ]);
    });

    it("rejects foreign IDs, stale simultaneous edits and altered idempotency payloads", async () => {
      const id = await owner();
      const other = await owner();
      const scout = await activate(id);
      const change: ScoutChange = {
        key: randomUUID(),
        version: 1,
        action: "update",
        search: { ...search, name: "New direction" },
        alerts,
      };
      await expect(
        manage.execute(other, scout.id, change),
      ).rejects.toMatchObject({ code: "scout_not_found" });
      const results = await Promise.allSettled([
        manage.execute(id, scout.id, change),
        manage.execute(id, scout.id, {
          ...change,
          key: randomUUID(),
          search: { ...search, name: "Stale direction" },
        }),
      ]);
      expect(
        results.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((item) => item.status === "rejected")[0],
      ).toMatchObject({ reason: { code: "scout_changed" } });
      const winning = results.findIndex((item) => item.status === "fulfilled");
      if (winning === 0)
        await expect(
          manage.execute(id, scout.id, {
            ...change,
            search: { ...search, name: "Different payload" },
          }),
        ).rejects.toMatchObject({ code: "request_conflict" });
      expect((await records.find(id, scout.id))?.version).toBe(2);
    });

    it("validates edits, preserves paused status and rolls back state, consent and outbox after late failure", async () => {
      const id = await owner();
      const scout = await activate(id);
      await expect(
        manage.execute(id, scout.id, {
          key: randomUUID(),
          version: 1,
          action: "update",
          search: { ...search, target: "" },
          alerts,
        }),
      ).rejects.toMatchObject({ code: "search_needs_changes" });
      await sql`ALTER TABLE scout_change_requests ADD CONSTRAINT test_late_failure CHECK (false) NOT VALID`.execute(
        db,
      );
      try {
        await expect(
          manage.execute(id, scout.id, {
            key: randomUUID(),
            version: 1,
            action: "update",
            search: { ...search, name: "Must roll back" },
            alerts,
          }),
        ).rejects.toThrow();
      } finally {
        await sql`ALTER TABLE scout_change_requests DROP CONSTRAINT test_late_failure`.execute(
          db,
        );
      }
      expect(await records.find(id, scout.id)).toEqual(scout);
      expect(
        await db
          .selectFrom("outbox_events")
          .select("id")
          .where("owner_id", "=", id)
          .execute(),
      ).toHaveLength(1);
      expect(
        await db
          .selectFrom("consent_events")
          .select("id")
          .where("owner_id", "=", id)
          .execute(),
      ).toHaveLength(1);
      await manage.execute(id, scout.id, {
        key: randomUUID(),
        version: 1,
        action: "pause",
      });
      const edited = await manage.execute(id, scout.id, {
        key: randomUUID(),
        version: 2,
        action: "update",
        search: { ...search, name: "Later" },
        alerts: { ...alerts, frequency: "dashboard", consent: false },
      });
      expect(edited).toMatchObject({
        status: "paused",
        version: 3,
        name: "Later",
      });
      expect(
        await db
          .selectFrom("outbox_events")
          .select("id")
          .where("owner_id", "=", id)
          .execute(),
      ).toHaveLength(1);
    });

    it("hides across overlapping scouts, blocks stale delivery candidates and retains undo after recommendations disappear", async () => {
      const id = await owner();
      const other = await owner();
      const a = await activate(id);
      const b = await activate(id);
      const c = await activate(other);
      await recommend(id, a);
      await recommend(id, b);
      await recommend(other, c);
      const candidates = await deliveryCandidates(id);
      expect(candidates).toHaveLength(2);
      const input = { key: randomUUID(), value: "hidden" as const, version: 0 };
      expect(await feedback.execute(id, posting.id, input)).toEqual({
        value: "hidden",
        version: 1,
      });
      expect(await feedback.execute(id, posting.id, input)).toEqual({
        value: "hidden",
        version: 1,
      });
      expect(await catalog.list(id)).toEqual([]);
      expect(await catalog.list(other)).toHaveLength(1);
      expect(await catalog.list(id, true)).toHaveLength(1);
      expect(
        await delivery.prepare(
          id,
          digestWindow(alerts, new Date())!,
          candidates,
        ),
      ).toBeNull();
      expect(
        await runs.candidates({
          request: {
            ownerId: id,
            scoutId: a.id,
            version: 1,
            runId: randomUUID(),
          },
          search,
        }),
      ).toEqual([]);
      await db
        .deleteFrom("scout_recommendations")
        .where("owner_id", "=", id)
        .execute();
      expect(await catalog.list(id, true)).toHaveLength(1);
      await expect(
        feedback.execute(id, posting.id, {
          key: randomUUID(),
          value: "relevant",
          version: 0,
        }),
      ).rejects.toMatchObject({ code: "feedback_changed" });
      await feedback.execute(id, posting.id, {
        key: randomUUID(),
        value: "none",
        version: 1,
      });
      expect(await catalog.list(id, true)).toEqual([]);
      expect(
        await runs.candidates({
          request: {
            ownerId: id,
            scoutId: a.id,
            version: 1,
            runId: randomUUID(),
          },
          search,
        }),
      ).toHaveLength(1);
      expect((await records.find(id, a.id))?.search).toEqual(search);
    });

    it("does not accept feedback for unrelated public postings and records relevance without changing the brief", async () => {
      const id = await owner();
      const scout = await activate(id);
      await expect(
        feedback.execute(id, posting.id, {
          key: randomUUID(),
          value: "hidden",
          version: 0,
        }),
      ).rejects.toMatchObject({ code: "opportunity_not_found" });
      await recommend(id, scout);
      await feedback.execute(id, posting.id, {
        key: randomUUID(),
        value: "relevant",
        version: 0,
      });
      expect((await catalog.list(id))[0]?.feedback).toEqual({
        value: "relevant",
        version: 1,
      });
      expect((await records.find(id, scout.id))?.search).toEqual(search);
      const events = await db
        .selectFrom("opportunity_feedback_events")
        .selectAll()
        .where("owner_id", "=", id)
        .execute();
      expect(events).toHaveLength(1);
      expect(events[0]?.context).toMatchObject({
        scoutId: scout.id,
        scoutVersion: 1,
        postingVersion: 1,
      });
    });
  },
);
