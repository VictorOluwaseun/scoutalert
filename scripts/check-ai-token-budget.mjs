import { createPostgresClient } from "../packages/adapters/dist/database/public.js";
import {
  PostgresModelTokenBudgetRepository,
  modelTokenBudgetPolicies,
} from "../packages/adapters/dist/scouting/public.js";
import { readWorkerConfiguration } from "../apps/worker/dist/config.js";

// Read-only composition: no provider calls, migrations, resets or prompt/credential output.
const config = readWorkerConfiguration();
const db = createPostgresClient(config.DATABASE_URL, "scoutalert-token-usage");
try {
  const repository = new PostgresModelTokenBudgetRepository(
    db,
    config.SCOUT_AI_DAILY_TOKENS,
    modelTokenBudgetPolicies(
      config.SCOUT_AI_GPT54_DAILY_TOKENS,
      config.SCOUT_AI_GPT54_MINI_DAILY_TOKENS,
      config.SCOUT_AI_AUDIT_DAILY_TOKENS,
    ),
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
          "This deployment's guarded worker and shared-budget evaluation calls; counting begins when the guard is activated.",
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "Unable to read token usage. Check database access, rebuild the worker/adapters, and apply migrations through 20261029-selective-model-review.",
  );
  process.exitCode = 1;
} finally {
  await db.destroy();
}
