import { digestWindow } from "@repo/core/notifications";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  PostgresIntelligenceRepository,
  PostgresSourceRepository,
  PostgresScoutingRepository,
  PostgresOpportunityCatalogRepository,
} from "@repo/adapters/scouting";
import { PostgresOpportunityDeliveryRepository } from "@repo/adapters/notifications";
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from "@repo/adapters/onboarding";
import { ActivateScout, ReviewSearchDraft } from "@repo/core/onboarding";
import {
  EvaluateCandidates,
  IntelligenceProvider,
  ScoutOpportunities,
  type IntelligenceTask,
  type IntelligenceResult,
  type RunContext,
} from "@repo/core/scouting";
import { search, posting, analysis, fit } from "./fixtures/intelligence.js";

const usage = {
  model: "fixture",
  inputTokens: 100,
  outputTokens: 50,
  durationMs: 1,
  responseId: "fixture",
};
const result: IntelligenceResult & { kind: "extraction" } = {
  kind: "extraction",
  analysis,
  usage,
};
/** Deterministic provider only for persistence/orchestration failure tests, never used by app composition. */
class FixtureProvider extends IntelligenceProvider {
  readonly configuration = "fixture-v1";
  calls = 0;

  /** Supplies known evidence for transaction and replay checks. */
  async extract(): Promise<IntelligenceResult & { kind: "extraction" }> {
    this.calls++;

    return result;
  }

  /** Supplies known private criteria for owner isolation checks. */
  async assess(): Promise<IntelligenceResult & { kind: "fit" }> {
    this.calls++;

    return { kind: "fit", fit, usage };
  }
}

describe.skipIf(process.env.SCOUTING_INTEGRATION !== "1")(
  "intelligence persistence and bounded execution",
  () => {
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let context: RunContext;
    const schema = `intelligence_${randomUUID().replaceAll("-", "")}`;
    const task: IntelligenceTask = {
      kind: "extraction",
      posting,
      configuration: "fixture-v1",
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
      const ownerId = randomUUID();
      await db
        .insertInto("users")
        .values({
          id: ownerId,
          email: `${ownerId}@scoutalert.test`,
          verified_at: new Date(),
        })
        .execute();
      const activation = new ActivateScout(
        new ReviewSearchDraft(),
        new PostgresScoutActivationUnitOfWork(db),
        new NodeScoutActivationIdentity(),
        () => new Date(),
      );
      const scout = await activation.execute(ownerId, "synthetic-browser", {
        key: randomUUID(),
        search,
        confirmed: true,
        alerts: {
          frequency: "daily",
          timezone: "UTC",
          deliveryTime: "00:00",
          weekday: "Monday",
          promptAlerts: false,
          consent: true,
          consentVersion: "opportunity-alerts-v1",
        },
      });
      context = {
        request: {
          ownerId,
          scoutId: scout.id,
          version: 1,
          runId: randomUUID(),
        },
        search,
      };
      const sources = new PostgresSourceRepository(db);
      const token = await sources.claim(posting.source, new Date());
      await sources.publish(
        {
          source: posting.source,
          checkedAt: new Date().toISOString(),
          postings: [posting],
        },
        token!,
      );
    });
    afterAll(async () => {
      await db?.destroy();

      if (admin && /^intelligence_[a-f0-9]{32}$/.test(schema)) {
        await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(admin);
      }

      await admin?.destroy();
    });
    it("fences duplicate shared attempts and reuses public extraction", async () => {
      const repository = new PostgresIntelligenceRepository(db, 50);
      const claims = await Promise.all([
        repository.claim(task),
        repository.claim(task),
      ]);
      expect(claims.map((item) => item.status).sort()).toEqual([
        "claimed",
        "waiting",
      ]);
      const acquired = claims.find((item) => item.status === "claimed")!;

      if (acquired.status !== "claimed") {
        throw new Error("missing fixture lease");
      }

      await repository.complete(acquired.token, result);
      expect((await repository.claim(task)).status).toBe("ready");
    });
    it("rejects foreign private cache reads and stale revisions", async () => {
      const repository = new PostgresIntelligenceRepository(db, 50);
      const privateTask = { ...task, kind: "fit" as const, context, analysis };
      expect(
        (
          await repository.claim({
            ...privateTask,
            context: {
              ...context,
              request: { ...context.request, ownerId: randomUUID() },
            },
          })
        ).status,
      ).toBe("unavailable");
      expect(
        (
          await repository.claim({
            ...privateTask,
            context: {
              ...context,
              request: { ...context.request, version: 2 },
            },
          })
        ).status,
      ).toBe("unavailable");
    });
    it("publishes evidence-linked fit and includes the same conclusions in eligible digest contents", async () => {
      const repository = new PostgresIntelligenceRepository(db, 50);
      const provider = new FixtureProvider();
      const matching = new ScoutOpportunities(
        new PostgresScoutingRepository(db),
        new EvaluateCandidates(repository, provider),
      );
      expect(await matching.execute(context.request)).toBe("progress");
      expect(await matching.execute(context.request)).toBe("done");
      expect(provider.calls).toBe(1); // shared extraction was reused
      const feed = await new PostgresOpportunityCatalogRepository(db).list(
        context.request.ownerId,
      );
      expect(feed[0]?.detail?.criteria).toHaveLength(7);
      expect(feed[0]?.assessmentScout).toBe(search.name);
      const delivery = new PostgresOpportunityDeliveryRepository(db);
      const candidates = await delivery.candidates();
      const prepared = await delivery.prepare(
        context.request.ownerId,
        digestWindow(candidates[0]!.alerts, new Date())!,
        candidates,
      );
      expect(prepared?.opportunities[0]?.detail?.assessedBy).toBe("ai");
      const again = await new EvaluateCandidates(repository, provider).evaluate(
        context,
        [posting],
      );
      expect(again).toHaveLength(1);
      expect(provider.calls).toBe(1);
    });
    it("does not publish a late response after its lease expires or a source version changes", async () => {
      const repository = new PostgresIntelligenceRepository(db, 50);
      const changed = { ...task, configuration: "fencing" };
      const first = await repository.claim(changed);

      if (first.status !== "claimed") {
        throw new Error("missing fixture lease");
      }

      await sql`UPDATE intelligence_tasks SET lease_until=now()-interval '1 second' WHERE lease_token=${first.token}::uuid`.execute(
        db,
      );
      const second = await repository.claim(changed);

      if (second.status !== "claimed") {
        throw new Error("missing replacement lease");
      }

      await repository.complete(first.token, result);
      expect((await repository.claim(changed)).status).toBe("waiting");
      await sql`UPDATE opportunity_postings SET version=version+1 WHERE id=${posting.id}`.execute(
        db,
      );
      await repository.complete(second.token, result);
      expect((await repository.claim(changed)).status).toBe("unavailable");
      await sql`UPDATE opportunity_postings SET version=1 WHERE id=${posting.id}`.execute(
        db,
      );
      await repository.fail(second.token, "provider_unavailable");
    });
    it("retains a failure cooldown and enforces a shared daily request budget", async () => {
      const repository = new PostgresIntelligenceRepository(db, 50);
      const failedTask = { ...task, configuration: "failure" };
      const claim = await repository.claim(failedTask);

      if (claim.status !== "claimed") {
        throw new Error("missing fixture lease");
      }

      await repository.fail(claim.token, "provider_unavailable");
      expect((await repository.claim(failedTask)).status).toBe("unavailable");
      const limited = new PostgresIntelligenceRepository(db, 1);
      expect(
        (await limited.claim({ ...task, configuration: "over-budget" })).status,
      ).toBe("unavailable");
    });
  },
);
