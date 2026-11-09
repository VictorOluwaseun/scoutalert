import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  ActivateScout,
  ReviewSearchDraft,
  type ScoutAlerts,
} from "@repo/core/onboarding";
import { ManageScout } from "@repo/core/scouts";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "@repo/adapters/onboarding";
import { PostgresScoutManagementRepository } from "@repo/adapters/scouts";
import { PostgresWebDiscoveryRepository } from "@repo/adapters/discovery";
import {
  DiscoverWeb,
  type DiscoveryLimits,
  type SearchCapability,
} from "@repo/core/discovery";
import {
  PostgresModelTokenBudgetRepository,
  PostgresScoutingRepository,
  PostgresDiscoveryIntentRepository,
  modelTokenBudgetPolicies,
} from "@repo/adapters/scouting";
import { search } from "./fixtures/intelligence.js";

const alerts: ScoutAlerts = {
  frequency: "dashboard",
  timezone: "UTC",
  deliveryTime: "00:00",
  weekday: "Monday",
  promptAlerts: false,
  consent: false,
  consentVersion: "opportunity-alerts-v1",
};

describe.skipIf(process.env.SCOUTING_INTEGRATION !== "1")(
  "beta account admission, cadence and paid budgets",
  () => {
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let anchor: string;
    const schema = `beta_budget_${randomUUID().replaceAll("-", "")}`;

    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = "/scoutalert_test";
      admin = createPostgresClient(url.toString());
      await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
      url.searchParams.set("options", `-c search_path=${schema}`);
      db = createPostgresClient(url.toString());
      await migrateDatabase(db, schema);
      anchor = (
        await sql<{
          day: string;
        }>`SELECT (now() AT TIME ZONE 'UTC')::date::text AS day`.execute(db)
      ).rows[0]!.day;
    });

    beforeEach(async () => {
      await sql`TRUNCATE users CASCADE`.execute(db);
      await sql`TRUNCATE beta_discovery_dispatch,intelligence_paid_reservations,intelligence_paid_budgets,intelligence_token_reservations,intelligence_token_days,intelligence_token_pacing,intelligence_token_demand`.execute(
        db,
      );
    });

    afterAll(async () => {
      await db?.destroy();
      await sql`DROP SCHEMA IF EXISTS ${sql.id(schema)} CASCADE`.execute(admin);
      await admin?.destroy();
    });

    /** Creates only synthetic owners in this suite's disposable schema. */
    async function owner() {
      const id = randomUUID();
      await db
        .insertInto("users")
        .values({ id, email: `${id}@scoutalert.test`, verified_at: new Date() })
        .execute();
      return id;
    }

    /** Shares the production activation use case, with a deliberately configurable cohort size. */
    function activation(maximumAccounts = 50) {
      return new ActivateScout(
        new ReviewSearchDraft(),
        new PostgresScoutActivationUnitOfWork(db),
        new NodeScoutActivationIdentity(),
        () => new Date(),
        { maximumAccounts, activeScoutsPerAccount: 1 },
      );
    }

    /** Creates a confirmed request with a reusable retry identity. */
    function input() {
      return { key: randomUUID(), search, alerts, confirmed: true as const };
    }

    /** A tiny base allowance forces synthetic calls through the real additional-money guard. No provider is constructed. */
    function paid(accountLimit?: number) {
      return new PostgresModelTokenBudgetRepository(
        db,
        1,
        modelTokenBudgetPolicies(0, 1, 0, undefined, undefined, {
          miniAccountTokens: accountLimit,
          paid: { anchor, miniMicrousd: 30_000_000, fullMicrousd: 0 },
        }),
      );
    }

    it("admits exactly 50 concurrent accounts and rejects the 51st without creating a scout or intent", async () => {
      const owners = await Promise.all(
        Array.from({ length: 51 }, () => owner()),
      );
      const attempts = await Promise.allSettled(
        owners.map((id) => activation().execute(id, "beta-test", input())),
      );
      expect(
        attempts.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(50);
      expect(attempts.find((item) => item.status === "rejected")).toMatchObject(
        { reason: { code: "beta_full" } },
      );
      expect(
        (
          await sql<{
            count: number;
          }>`SELECT count(*)::integer AS count FROM scouts`.execute(db)
        ).rows[0]!.count,
      ).toBe(50);
    });

    it("makes activation idempotent and prevents concurrent second scouts and resume bypasses", async () => {
      const id = await owner();
      const request = input();
      const scout = await activation().execute(id, "beta-test", request);
      expect((await activation().execute(id, "beta-test", request)).id).toBe(
        scout.id,
      );
      await expect(
        activation().execute(id, "beta-test", input()),
      ).rejects.toMatchObject({ code: "active_scout_limit" });
      const manage = new ManageScout(
        new PostgresScoutManagementRepository(db),
        new ReviewSearchDraft(),
        () => new Date(),
        { maximumAccounts: 50, activeScoutsPerAccount: 1 },
      );
      await manage.execute(id, scout.id, {
        key: randomUUID(),
        version: 1,
        action: "pause",
      });
      await activation().execute(id, "beta-test", input());
      await expect(
        manage.execute(id, scout.id, {
          key: randomUUID(),
          version: 2,
          action: "resume",
        }),
      ).rejects.toMatchObject({ code: "active_scout_limit" });
      expect(
        (
          await sql<{
            count: number;
          }>`SELECT count(*)::integer AS count FROM beta_accounts`.execute(db)
        ).rows[0]!.count,
      ).toBe(1);
    });

    it("charges one deep search per owner window, preserving retries and blocking replacement/version bypasses", async () => {
      const ownerId = await owner();
      const scout = await activation().execute(ownerId, "beta-test", input());
      const web = new PostgresWebDiscoveryRepository(db, 1440);
      const request = {
        ownerId,
        scoutId: scout.id,
        version: 1,
        runId: randomUUID(),
      };
      expect(await web.admitSearch(request)).toBe(true);
      expect(await web.admitSearch(request)).toBe(true);
      expect(await web.admitSearch({ ...request, runId: randomUUID() })).toBe(
        false,
      );
      await sql`UPDATE scouts SET version=2 WHERE id=${scout.id}::uuid`.execute(
        db,
      );
      expect(
        await web.admitSearch({ ...request, version: 2, runId: randomUUID() }),
      ).toBe(false);
      await sql`UPDATE beta_discovery_windows SET started_at=now()-interval '24 hours 1 second'`.execute(
        db,
      );
      expect(
        await web.admitSearch({ ...request, version: 2, runId: randomUUID() }),
      ).toBe(true);
    });

    it("stagger-dispatches only two overdue scouts in a scheduler batch", async () => {
      for (let index = 0; index < 5; index++) {
        await activation().execute(await owner(), "beta-test", input());
      }
      await sql`UPDATE scouts SET discovery_requested_at=now()-interval '25 hours'`.execute(
        db,
      );
      expect(
        await new PostgresScoutingRepository(db, 1440, 2).reconcile(
          "beta-test",
          new Date(),
        ),
      ).toBe(2);
    });

    it("spaces initial workflows across concurrent relays and restarts without delaying lost acknowledgements", async () => {
      for (let index = 0; index < 3; index++) {
        await activation().execute(await owner(), "beta-test", input());
      }
      const relay = () =>
        new PostgresDiscoveryIntentRepository(db, {
          refreshMinutes: 1440,
          dispatchIntervalMinutes: 25,
        });
      const batches = await Promise.all([
        relay().claim(),
        relay().claim(),
        relay().claim(),
      ]);
      const claimed = batches.flat();
      expect(claimed).toHaveLength(1);
      expect(await relay().claim()).toHaveLength(0);
      await sql`UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE id=${claimed[0]!.id}::uuid`.execute(
        db,
      );
      const retried = await relay().claim();
      expect(retried.map((intent) => intent.id)).toEqual([claimed[0]!.id]);
      await relay().acknowledge(retried[0]!.id, retried[0]!.lease);
      await sql`UPDATE beta_discovery_dispatch SET next_at=now()-interval '1 second'`.execute(
        db,
      );
      const next = await relay().claim();
      expect(next).toHaveLength(1);
      expect(next[0]!.id).not.toBe(claimed[0]!.id);
    });

    it("records a deferred deep search before any provider call and does not charge a disabled provider's window", async () => {
      const ownerId = await owner();
      const scout = await activation().execute(ownerId, "beta-test", input());
      const records = new PostgresWebDiscoveryRepository(db, 1440);
      const request = {
        ownerId,
        scoutId: scout.id,
        version: 1,
        runId: randomUUID(),
      };
      const limits: DiscoveryLimits = {
        dailySearchRequests: 100,
        dailySearchMicros: 1000000,
        dailyDocumentRequests: 100,
        maximumConcurrentSearches: 2,
        maximumDocuments: 4,
      };
      const capability: SearchCapability = {
        id: "synthetic-search",
        configuration: "beta-test",
        access: "public_index",
        language: "en",
        country: "us",
        requestCostMicros: 1000,
      };
      const documents = {
        read: async () => {
          throw new Error("unexpected document call");
        },
      };
      await new DiscoverWeb(records, documents, null, limits).execute(request);
      expect(
        (
          await sql<{
            count: number;
          }>`SELECT count(*)::integer AS count FROM beta_discovery_windows`.execute(
            db,
          )
        ).rows[0]!.count,
      ).toBe(0);
      expect(
        await records.admitSearch({ ...request, runId: randomUUID() }),
      ).toBe(true);
      const second = { ...request, runId: randomUUID() };
      const provider = {
        capability,
        search: async () => {
          throw new Error("unexpected search call");
        },
      };
      expect(
        await new DiscoverWeb(records, documents, provider, limits).execute(
          second,
        ),
      ).toBe("done");
      expect(
        (
          await sql`SELECT status,reason FROM web_discovery_cases WHERE id=${second.runId}::uuid`.execute(
            db,
          )
        ).rows[0],
      ).toMatchObject({
        status: "deferred",
        reason: "account_refresh_scheduled",
      });
    });

    it("shares fair turns by owner and excludes demand that cannot fit its account quota", async () => {
      const firstOwner = await owner();
      const secondOwner = await owner();
      const first = await activation().execute(
        firstOwner,
        "beta-test",
        input(),
      );
      const second = await activation().execute(
        secondOwner,
        "beta-test",
        input(),
      );
      const policies = modelTokenBudgetPolicies(
        250000,
        2400000,
        40000,
        { windowMinutes: 60, maintenancePercent: 30 },
        undefined,
        { miniAccountTokens: 10000 },
      );
      const repo = new PostgresModelTokenBudgetRepository(
        db,
        2650000,
        policies,
      );
      await repo.prepare("gpt-5.4-mini", 12000, "standard", "discovery", {
        scoutId: first.id,
        version: 1,
      });
      expect(
        await repo.reserve(
          "gpt-5.4-mini",
          1000,
          4000,
          "standard",
          "discovery",
          { scoutId: second.id, version: 1 },
        ),
      ).not.toBeNull();
      const demand = (
        await sql<{
          participant: string;
        }>`SELECT participant FROM intelligence_token_demand`.execute(db)
      ).rows;
      expect(demand.map((row) => row.participant)).toContain(firstOwner);
      expect(demand.map((row) => row.participant)).not.toContain(first.id);
    });

    it("does not refill paid credit just because the daily ledger rolls over", async () => {
      for (let index = 0; index < 3; index++) {
        expect(
          await paid().reserve("gpt-5.4-mini", 10000, 4000),
        ).not.toBeNull();
      }
      await sql`UPDATE intelligence_paid_reservations SET day=day-1`.execute(
        db,
      );
      expect(await paid().reserve("gpt-5.4-mini", 10000, 4000)).toBeNull();
      await sql`UPDATE intelligence_paid_budgets SET updated_at=now()-interval '1 hour'`.execute(
        db,
      );
      expect(await paid().reserve("gpt-5.4-mini", 10000, 4000)).not.toBeNull();
    });

    it("serializes paid bursts across aliases and restarts without raising the base token limit", async () => {
      const attempts = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          paid().reserve(
            index % 2 ? "gpt-5.4-mini" : "gpt-5.4-mini-2026-03-17",
            10000,
            4000,
          ),
        ),
      );
      expect(attempts.filter(Boolean)).toHaveLength(3);
      const report = await paid().snapshot("gpt-5.4-mini");
      expect(report).toMatchObject({
        dailyLimit: 1,
        reservedTokens: 0,
        remainingTokens: 1,
        paid: { dailyCommittedMicrousd: 76500, periodCommittedMicrousd: 76500 },
      });
      expect(await paid().reserve("gpt-5.4-mini", 10000, 4000)).toBeNull();
    });

    it("reconciles cached usage once and retains unknown charges", async () => {
      const repo = paid();
      const first = await repo.reserve("gpt-5.4-mini", 10000, 4000);
      const second = await repo.reserve("gpt-5.4-mini", 10000, 4000);
      const usage = {
        inputTokens: 10000,
        outputTokens: 100,
        cachedInputTokens: 5000,
      };
      await Promise.all([
        repo.settle(first!, usage),
        repo.settle(first!, usage),
      ]);
      await repo.settle(second!, null);
      await repo.settle(second!, usage);
      expect(
        (await repo.snapshot("gpt-5.4-mini")).paid?.dailyCommittedMicrousd,
      ).toBe(30075);
    });

    it("retains owner quotas across scout replacements, revisions and paid calls", async () => {
      const ownerId = await owner();
      const scout = await activation().execute(ownerId, "beta-test", input());
      const scope = { scoutId: scout.id, version: 1 };
      const repo = paid(20000);
      expect(
        await repo.reserve(
          "gpt-5.4-mini",
          10000,
          4000,
          "standard",
          "discovery",
          scope,
        ),
      ).not.toBeNull();
      const manage = new ManageScout(
        new PostgresScoutManagementRepository(db),
        new ReviewSearchDraft(),
        () => new Date(),
      );
      await manage.execute(ownerId, scout.id, {
        key: randomUUID(),
        version: 1,
        action: "pause",
      });
      const replacement = await activation().execute(
        ownerId,
        "beta-test",
        input(),
      );
      expect(
        await repo.reserve(
          "gpt-5.4-mini",
          10000,
          4000,
          "standard",
          "discovery",
          { scoutId: replacement.id, version: 1 },
        ),
      ).toBeNull();
      expect(
        (
          await repo.snapshot("gpt-5.4-mini", "standard", "discovery", {
            scoutId: replacement.id,
            version: 1,
          })
        ).account,
      ).toMatchObject({ remainingTokens: 6000 });
    });

    it("enforces both daily and 30-day money ceilings even after pacing credit refills", async () => {
      const id = await paid().reserve("gpt-5.4-mini", 10000, 4000);
      await sql`UPDATE intelligence_paid_reservations SET reserved_microusd=1000000 WHERE id=${id}::uuid`.execute(
        db,
      );
      await sql`UPDATE intelligence_paid_budgets SET updated_at=now()-interval '1 day'`.execute(
        db,
      );
      expect(await paid().reserve("gpt-5.4-mini", 100, 100)).toBeNull();
      await sql`UPDATE intelligence_paid_reservations SET reserved_microusd=30000000,day=day-1 WHERE id=${id}::uuid`.execute(
        db,
      );
      expect(await paid().reserve("gpt-5.4-mini", 100, 100)).toBeNull();
    });

    it("fails closed if the billing anchor changes and never lends paid money to audits", async () => {
      await paid().reserve("gpt-5.4-mini", 10000, 4000);
      expect(
        await paid().reserve("gpt-5.4-mini", 100, 100, "audit"),
      ).toBeNull();
      await sql`UPDATE intelligence_paid_budgets SET period_anchor=period_anchor-1`.execute(
        db,
      );
      await expect(paid().reserve("gpt-5.4-mini", 100, 100)).rejects.toThrow(
        "paid_budget_anchor_changed",
      );
    });
  },
);
