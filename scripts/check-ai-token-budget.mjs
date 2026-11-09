import { configuredTokenPolicies } from "../apps/worker/dist/composition/token-budget-policy.js";
import { createPostgresClient } from "../packages/adapters/dist/database/public.js";
import { PostgresModelTokenBudgetRepository } from "../packages/adapters/dist/scouting/public.js";
import { readWorkerConfiguration } from "../apps/worker/dist/config.js";

// Read-only composition: no provider calls, migrations, resets or prompt/credential output.
const config = readWorkerConfiguration();
const db = createPostgresClient(config.DATABASE_URL, "scoutalert-token-usage");
try {
  const repository = new PostgresModelTokenBudgetRepository(
    db,
    config.SCOUT_AI_DAILY_TOKENS,
    configuredTokenPolicies(config),
  );
  console.log(
    JSON.stringify(
      {
        ...(await repository.snapshot()),
        maximumOutputTokens: config.SCOUT_AI_MAX_OUTPUT_TOKENS,
        planningModel: config.SCOUT_AI_PLANNING_MODEL,
        expertModel: config.SCOUT_AI_EXPERT_MODEL,
        auditPercent: config.SCOUT_AI_AUDIT_PERCENT,
        extractionModel: config.SCOUT_AI_EXTRACTION_MODEL,
        fitModel: config.SCOUT_AI_FIT_MODEL,
        resetTimezone: "UTC",
        scope:
          "Base token totals exclude paid calls, which appear under each model's paid section. Worker and shared-budget evaluations use the same ledger.",
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "Unable to read token usage. Check database access, rebuild the worker/adapters, and apply migrations through 20261109-beta-budget.",
  );
  process.exitCode = 1;
} finally {
  await db.destroy();
}
