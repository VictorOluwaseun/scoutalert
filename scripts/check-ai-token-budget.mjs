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
  );
  console.log(
    JSON.stringify(
      {
        ...(await repository.snapshot()),
        maximumOutputTokens: config.SCOUT_AI_MAX_OUTPUT_TOKENS,
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
    "Unable to read token usage. Check database access, rebuild the worker/adapters, and apply migration 20261029-intelligence-token-budget.",
  );
  process.exitCode = 1;
} finally {
  await db.destroy();
}
