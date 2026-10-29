import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createPostgresClient, migrateDatabase } from "@repo/adapters/database";
import {
  PostgresModelTokenBudgetRepository,
  modelTokenBudgetPolicies,
} from "@repo/adapters/scouting";

describe.skipIf(process.env.SCOUTING_INTEGRATION !== "1")(
  "atomic model token budgets",
  () => {
    let admin: ReturnType<typeof createPostgresClient>;
    let db: ReturnType<typeof createPostgresClient>;
    let databaseUrl: string;
    const schema = `token_budget_${randomUUID().replaceAll("-", "")}`;

    beforeAll(async () => {
      loadEnvFile(new URL("../../api/.env", import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = "/scoutalert_test";
      admin = createPostgresClient(url.toString());
      await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(admin);
      url.searchParams.set("options", `-c search_path=${schema}`);
      databaseUrl = url.toString();
      db = createPostgresClient(databaseUrl);
      await migrateDatabase(db, schema);
    });

    beforeEach(async () => {
      await sql`TRUNCATE intelligence_token_reservations,intelligence_token_days`.execute(
        db,
      );
    });

    afterAll(async () => {
      await db?.destroy();
      await sql`DROP SCHEMA IF EXISTS ${sql.id(schema)} CASCADE`.execute(admin);
      await admin?.destroy();
    });

    it("admits only the available capacity across concurrent repository instances", async () => {
      const claims = await Promise.all(
        Array.from({ length: 20 }, () =>
          new PostgresModelTokenBudgetRepository(db, 1000).reserve(
            "fixture",
            60,
            40,
          ),
        ),
      );
      expect(claims.filter(Boolean)).toHaveLength(10);
      expect(
        await new PostgresModelTokenBudgetRepository(db, 1000).snapshot(),
      ).toMatchObject({
        usedTokens: 0,
        reservedTokens: 1000,
        remainingTokens: 0,
      });
    });

    it("protects audit capacity inside the full-model cap and retains it across restarts", async () => {
      const policies = modelTokenBudgetPolicies(250, 2400, 25);
      const repo = new PostgresModelTokenBudgetRepository(db, 2650, policies);
      const standard = await Promise.all(
        Array.from({ length: 20 }, () => repo.reserve("gpt-5.4", 5, 20)),
      );
      expect(standard.filter(Boolean)).toHaveLength(9);
      expect(await repo.reserve("gpt-5.4-2026-03-05", 0, 16)).toBeNull();
      expect(await repo.reserve("gpt-5.4", 5, 20, "audit")).not.toBeNull();
      expect(await repo.reserve("gpt-5.4", 0, 16, "audit")).toBeNull();
      const snapshot = await new PostgresModelTokenBudgetRepository(
        db,
        2650,
        policies,
      ).snapshot();
      expect(snapshot.models?.[0]).toMatchObject({
        reservedTokens: 250,
        remainingTokens: 0,
        allocations: [
          {
            purpose: "standard",
            dailyLimit: 225,
            reservedTokens: 225,
            remainingTokens: 0,
          },
          {
            purpose: "audit",
            dailyLimit: 25,
            reservedTokens: 25,
            remainingTokens: 0,
          },
        ],
      });
      expect(await repo.reserve("gpt-5.4-mini", 0, 16, "audit")).toBeNull();
      expect(await repo.reserve("gpt-5.4-mini", 0, 16)).not.toBeNull();
    });

    it("enforces two independent caps under concurrent aliases without borrowing", async () => {
      const policy = modelTokenBudgetPolicies(250, 2400);
      const claims = await Promise.all(
        Array.from({ length: 40 }, (_, index) => {
          const full = index % 2 === 0;
          const model = full
            ? index % 4
              ? "gpt-5.4"
              : "gpt-5.4-2026-03-05"
            : index % 4 === 1
              ? "gpt-5.4-mini"
              : "gpt-5.4-mini-2026-03-17";
          return new PostgresModelTokenBudgetRepository(
            db,
            2650,
            policy,
          ).reserve(model, full ? 5 : 220, 20);
        }),
      );
      expect(claims.filter((id, index) => id && index % 2 === 0)).toHaveLength(
        10,
      );
      expect(claims.filter((id, index) => id && index % 2 === 1)).toHaveLength(
        10,
      );
      const repo = new PostgresModelTokenBudgetRepository(db, 2650, policy);
      expect(await repo.snapshot()).toMatchObject({
        reservedTokens: 2650,
        remainingTokens: 0,
        models: [
          {
            model: "gpt-5.4",
            dailyLimit: 250,
            reservedTokens: 250,
            remainingTokens: 0,
          },
          {
            model: "gpt-5.4-mini",
            dailyLimit: 2400,
            reservedTokens: 2400,
            remainingTokens: 0,
          },
        ],
      });
    });

    it("counts pre-existing usage and unknown calls without resetting a model on rollout or alias changes", async () => {
      const old = new PostgresModelTokenBudgetRepository(db, 2650);
      const completed = (await old.reserve(
        "gpt-5.4-mini-2026-03-17",
        2000,
        400,
      ))!;
      await old.settle(completed, {
        inputTokens: 2000,
        outputTokens: 350,
        cachedInputTokens: 1000,
      });
      const uncertain = (await old.reserve("gpt-5.4-mini", 20, 30))!;
      await old.settle(uncertain, null);
      const repo = new PostgresModelTokenBudgetRepository(
        db,
        2650,
        modelTokenBudgetPolicies(250, 2400),
      );
      expect(await repo.snapshot("gpt-5.4-mini")).toMatchObject({
        usedTokens: 2350,
        cachedInputTokens: 1000,
        reservedTokens: 50,
        remainingTokens: 0,
        unknownReservations: 1,
      });
      expect(await repo.reserve("gpt-5.4-mini-2026-03-17", 0, 16)).toBeNull();
      expect(await repo.reserve("gpt-5.4", 100, 150)).not.toBeNull();
      expect((await repo.snapshot()).reservedTokens).toBe(300);
    });

    it("leaves global capacity untouched when a family is full and honors a stricter global ceiling", async () => {
      const repo = new PostgresModelTokenBudgetRepository(
        db,
        500,
        modelTokenBudgetPolicies(100, 900),
      );
      const id = (await repo.reserve("gpt-5.4", 50, 50))!;
      expect(await repo.reserve("gpt-5.4-2026-03-05", 0, 16)).toBeNull();
      expect((await repo.snapshot()).reservedTokens).toBe(100);
      const usage = {
        inputTokens: 40,
        outputTokens: 10,
        cachedInputTokens: 20,
      };
      await Promise.all([repo.settle(id, usage), repo.settle(id, usage)]);
      expect(await repo.snapshot("gpt-5.4")).toMatchObject({
        usedTokens: 50,
        remainingTokens: 50,
        reservedTokens: 0,
      });
      expect(await repo.reserve("gpt-5.4-mini", 400, 50)).not.toBeNull();
      expect(await repo.snapshot("gpt-5.4")).toMatchObject({
        remainingTokens: 0,
      });
      expect(await repo.reserve("gpt-5.4", 0, 16)).toBeNull();
    });

    it("denies unknown model versions and supports disabling the full model independently", async () => {
      const repo = new PostgresModelTokenBudgetRepository(
        db,
        2400,
        modelTokenBudgetPolicies(0, 2400),
      );
      await expect(
        repo.reserve("gpt-5.4-other-version", 1, 16),
      ).rejects.toThrow("unconfigured_model_token_budget");
      await expect(repo.snapshot("gpt-5.4-other-version")).rejects.toThrow(
        "unconfigured_model_token_budget",
      );
      expect(await repo.reserve("gpt-5.4", 1, 16)).toBeNull();
      expect(await repo.reserve("gpt-5.4-mini", 1, 16)).not.toBeNull();
    });

    it("releases unused allowance and settles once under concurrent replay", async () => {
      const budget = new PostgresModelTokenBudgetRepository(db, 1000);
      const id = (await budget.reserve("fixture", 100, 400))!;
      const usage = {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 25,
      };
      await Promise.all([budget.settle(id, usage), budget.settle(id, usage)]);
      expect(await budget.snapshot()).toMatchObject({
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 25,
        usedTokens: 150,
        reservedTokens: 0,
        remainingTokens: 850,
      });
      expect(await budget.reserve("fixture", 800, 50)).not.toBeNull();
      expect(await budget.reserve("fixture", 0, 1)).toBeNull();
    });

    it("does not reset unknown or abandoned reservations after restart or a lower limit", async () => {
      const budget = new PostgresModelTokenBudgetRepository(db, 1000);
      const unknown = (await budget.reserve("fixture", 100, 300))!;
      await budget.reserve("fixture", 100, 200);
      await budget.settle(unknown, null);
      await budget.settle(unknown, null);
      const restarted = new PostgresModelTokenBudgetRepository(db, 500);
      expect(await restarted.snapshot()).toMatchObject({
        reservedTokens: 700,
        unknownReservations: 1,
        remainingTokens: 0,
      });
      expect(await restarted.reserve("fixture", 1, 16)).toBeNull();
    });

    it("charges a late completion to the original admission day", async () => {
      const budget = new PostgresModelTokenBudgetRepository(db, 1000);
      const id = (await budget.reserve("fixture", 100, 200))!;
      // Move this authored reservation to yesterday to exercise the real midnight settlement path.
      await sql`INSERT INTO intelligence_token_days(day,reserved_tokens) SELECT day-1,reserved_tokens FROM intelligence_token_days`.execute(
        db,
      );
      await sql`UPDATE intelligence_token_reservations SET day=day-1 WHERE id=${id}::uuid`.execute(
        db,
      );
      await sql`UPDATE intelligence_token_days SET reserved_tokens=0 WHERE day=(now() AT TIME ZONE 'UTC')::date`.execute(
        db,
      );
      await budget.settle(id, {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 0,
      });
      expect(await budget.snapshot()).toMatchObject({
        usedTokens: 0,
        reservedTokens: 0,
        remainingTokens: 1000,
      });
      const previous = await sql<{
        used: string;
        held: string;
      }>`SELECT (input_tokens+output_tokens)::text AS used,reserved_tokens::text AS held FROM intelligence_token_days WHERE day=(now() AT TIME ZONE 'UTC')::date-1`.execute(
        db,
      );
      expect(previous.rows[0]).toEqual({ used: "150", held: "0" });
    });

    it("truthfully records unexpected provider overage and blocks further admission", async () => {
      const budget = new PostgresModelTokenBudgetRepository(db, 100);
      const id = (await budget.reserve("fixture", 40, 60))!;
      await budget.settle(id, {
        inputTokens: 45,
        outputTokens: 60,
        cachedInputTokens: 0,
      });
      expect(await budget.snapshot()).toMatchObject({
        usedTokens: 105,
        remainingTokens: 0,
        reservedTokens: 0,
      });
      expect(await budget.reserve("fixture", 1, 16)).toBeNull();
    });

    it("rejects invalid usage without releasing capacity", async () => {
      const budget = new PostgresModelTokenBudgetRepository(db, 1000);
      const id = (await budget.reserve("fixture", 100, 400))!;
      await expect(
        budget.settle(id, {
          inputTokens: 100,
          outputTokens: -1,
          cachedInputTokens: 0,
        }),
      ).rejects.toThrow("invalid_reported_token_usage");
      expect(await budget.snapshot()).toMatchObject({
        reservedTokens: 500,
        usedTokens: 0,
      });
    });

    it("disables admission with a zero daily token limit", async () => {
      const budget = new PostgresModelTokenBudgetRepository(db, 0);
      expect(await budget.reserve("fixture", 0, 16)).toBeNull();
      expect(await budget.snapshot()).toMatchObject({
        dailyLimit: 0,
        remainingTokens: 0,
        reservedTokens: 0,
      });
    });

    it("reports actual and reserved tokens through the read-only operator command", async () => {
      const budget = new PostgresModelTokenBudgetRepository(db, 1000);
      const id = (await budget.reserve("fixture", 100, 200))!;
      await budget.settle(id, {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 25,
      });
      await budget.reserve("fixture", 50, 100);
      const script = fileURLToPath(
        new URL("../../../scripts/check-ai-token-budget.mjs", import.meta.url),
      );
      const { stdout, stderr } = await promisify(execFile)(
        process.execPath,
        [script],
        {
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            SCOUT_AI_DAILY_TOKENS: "1000",
            SCOUT_AI_MAX_OUTPUT_TOKENS: "256",
          },
        },
      );
      expect(stderr).toBe("");
      expect(JSON.parse(stdout)).toMatchObject({
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 25,
        usedTokens: 150,
        reservedTokens: 150,
        remainingTokens: 700,
        dailyLimit: 1000,
        maximumOutputTokens: 256,
        resetTimezone: "UTC",
      });
      expect(await budget.snapshot()).toMatchObject({
        usedTokens: 150,
        reservedTokens: 150,
      });
    });
  },
);
