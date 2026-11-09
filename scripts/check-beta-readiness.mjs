import { createPostgresClient } from "../packages/adapters/dist/database/public.js";
import {
  PostgresBetaReadinessRepository,
  readBetaConfiguration,
} from "../packages/adapters/dist/onboarding/public.js";

// Read-only aggregate report; never pauses scouts, changes membership or calls a model.
const beta = readBetaConfiguration();
const db = createPostgresClient(
  process.env.DATABASE_URL,
  "scoutalert-beta-readiness",
);
try {
  const current = await new PostgresBetaReadinessRepository(db).read(
    beta.policy,
  );
  const ready =
    current.accounts <= beta.policy.maximumAccounts &&
    current.accountsOverScoutLimit === 0;
  console.log(
    JSON.stringify(
      {
        enabled: beta.enabled,
        ready,
        policy: beta.policy,
        refreshMinutes: beta.refreshMinutes,
        ...current,
      },
      null,
      2,
    ),
  );
  process.exitCode = ready ? 0 : 2;
} catch {
  console.error(
    "Unable to check beta readiness. Check database access and apply migrations through 20261109-beta-budget.",
  );
  process.exitCode = 1;
} finally {
  await db.destroy();
}
