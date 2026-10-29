import { test } from "node:test";
import assert from "node:assert/strict";
import { withEvaluationDatabase, sql } from "./database.mjs";
import { withSharedModelTokenBudget } from "./shared-token-budget.mjs";
import { PostgresModelTokenBudgetRepository } from "../../packages/adapters/dist/scouting/public.js";

test(
  "evaluation token admission shares the configured ledger while scenario records remain isolated",
  { skip: process.env.SCOUT_EVALUATION_INTEGRATION !== "1" },
  async () => {
    await withEvaluationDatabase(async (sharedDb) => {
      const originalUrl = process.env.DATABASE_URL;
      const originalLimit = process.env.SCOUT_AI_DAILY_TOKENS;
      const sharedSchema = (
        await sql`SELECT current_schema() AS name`.execute(sharedDb)
      ).rows[0].name;
      const url = new URL(originalUrl);
      url.pathname = "/scoutalert_test";
      url.searchParams.set("options", `-c search_path=${sharedSchema}`);
      process.env.DATABASE_URL = url.toString();
      process.env.SCOUT_AI_DAILY_TOKENS = "1000";
      try {
        const worker = new PostgresModelTokenBudgetRepository(sharedDb, 1000);
        await worker.reserve("gpt-5.4-mini", 50, 50);
        const result = await withEvaluationDatabase(
          withSharedModelTokenBudget(async (scenarioDb, budget) => {
            const scenarioSchema = (
              await sql`SELECT current_schema() AS name`.execute(scenarioDb)
            ).rows[0].name;
            assert.notEqual(scenarioSchema, sharedSchema);
            const id = await budget.repository.reserve("gpt-5.4", 20, 100);
            assert.ok(id);
            await budget.repository.settle(id, {
              inputTokens: 20,
              outputTokens: 10,
              cachedInputTokens: 5,
            });
            assert.equal(
              await budget.repository.reserve("gpt-5.4", 871, 16),
              null,
            );
            assert.equal(
              (
                await sql`SELECT * FROM intelligence_token_days`.execute(
                  scenarioDb,
                )
              ).rows.length,
              0,
            );
            return { scenario: "fixture" };
          }),
        );
        assert.equal(result.sharedTokenBudget.before.reservedTokens, 100);
        assert.equal(result.sharedTokenBudget.after.usedTokens, 30);
        assert.equal(result.sharedTokenBudget.after.remainingTokens, 870);
        assert.equal(result.sharedTokenBudget.attempts.length, 1);
        assert.equal(
          result.sharedTokenBudget.after.models.find(
            (item) => item.model === "gpt-5.4",
          ).usedTokens,
          30,
        );
        assert.equal(
          result.sharedTokenBudget.after.models.find(
            (item) => item.model === "gpt-5.4-mini",
          ).reservedTokens,
          100,
        );
        await assert.rejects(
          () =>
            withEvaluationDatabase(
              withSharedModelTokenBudget(async (_db, budget) =>
                budget.repository.reserve("unknown-model", 1, 16),
              ),
            ),
          /unconfigured_model_token_budget/,
        );
        assert.equal(result.sharedTokenBudget.attempts[0].state, "completed");
        assert.equal((await worker.snapshot()).remainingTokens, 870);
        const bounded = await withSharedModelTokenBudget(
          async (_db, budget) => {
            const claims = await Promise.all([
              budget.repository.reserve("gpt-5.4", 20, 50),
              budget.repository.reserve("gpt-5.4", 20, 50),
            ]);
            assert.equal(claims.filter(Boolean).length, 1);
            const id = claims.find(Boolean);
            const usage = {
              inputTokens: 10,
              outputTokens: 10,
              cachedInputTokens: 0,
            };
            await budget.repository.settle(id, usage);
            await budget.repository.settle(id, usage);
            await assert.rejects(
              () => budget.repository.reserve("unknown-model", 1, 16),
              /unconfigured_model_token_budget/,
            );
            const unknown = await budget.repository.reserve("gpt-5.4", 10, 50);
            assert.ok(unknown);
            await budget.repository.settle(unknown, null);
            assert.equal(
              await budget.repository.reserve("gpt-5.4", 5, 16),
              null,
            );
            return {};
          },
          true,
          100,
        )(sharedDb);
        assert.equal(bounded.sharedTokenBudget.evaluationAccountedTokens, 80);
        assert.equal(bounded.sharedTokenBudget.evaluationTokenCeiling, 100);
        assert.equal(bounded.sharedTokenBudget.attempts.length, 2);
      } finally {
        process.env.DATABASE_URL = originalUrl;
        if (originalLimit === undefined) {
          delete process.env.SCOUT_AI_DAILY_TOKENS;
        } else {
          process.env.SCOUT_AI_DAILY_TOKENS = originalLimit;
        }
      }
    });
  },
);

test("capture-only evaluation does not require or reserve a model budget", async () => {
  const result = await withSharedModelTokenBudget(async (db, budget) => {
    assert.equal(db, "fixture");
    assert.equal(budget, undefined);
    return { aiEnabled: false };
  }, false)("fixture");
  assert.deepEqual(result, { aiEnabled: false });
});
