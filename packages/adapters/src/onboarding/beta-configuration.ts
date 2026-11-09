import { z } from "zod";

/** Shared API/worker configuration; disabling beta explicitly preserves the existing unrestricted development lifecycle. */
export function readBetaConfiguration(
  environment: Record<string, string | undefined> = process.env,
) {
  const result = z
    .object({
      SCOUT_BETA_ENABLED: z.enum(["true", "false"]).default("false"),
      SCOUT_BETA_MAX_ACCOUNTS: z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(50),
      SCOUT_BETA_ACTIVE_SCOUTS: z.coerce
        .number()
        .int()
        .min(1)
        .max(20)
        .default(1),
      SCOUT_BETA_REFRESH_MINUTES: z.coerce
        .number()
        .int()
        .min(60)
        .max(10080)
        .default(1440),
      SCOUT_BETA_DISPATCH_BATCH: z.coerce
        .number()
        .int()
        .min(1)
        .max(20)
        .default(2),
      SCOUT_BETA_DISPATCH_INTERVAL_MINUTES: z.coerce
        .number()
        .int()
        .min(1)
        .max(1440)
        .default(25),
      SCOUT_BETA_MINI_ACCOUNT_TOKENS: z.coerce
        .number()
        .int()
        .min(4000)
        .max(2147483647)
        .default(80000),
      SCOUT_BETA_GPT54_ACCOUNT_TOKENS: z.coerce
        .number()
        .int()
        .min(4000)
        .max(2147483647)
        .default(20000),
    })
    .safeParse(environment);
  if (!result.success) {
    throw new Error(
      `Invalid beta settings: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  const settings = result.data;
  return {
    enabled: settings.SCOUT_BETA_ENABLED === "true",
    policy: {
      maximumAccounts: settings.SCOUT_BETA_MAX_ACCOUNTS,
      activeScoutsPerAccount: settings.SCOUT_BETA_ACTIVE_SCOUTS,
    },
    refreshMinutes: settings.SCOUT_BETA_REFRESH_MINUTES,
    dispatchBatch: settings.SCOUT_BETA_DISPATCH_BATCH,
    dispatchIntervalMinutes: settings.SCOUT_BETA_DISPATCH_INTERVAL_MINUTES,
    miniAccountTokens: settings.SCOUT_BETA_MINI_ACCOUNT_TOKENS,
    fullAccountTokens: settings.SCOUT_BETA_GPT54_ACCOUNT_TOKENS,
  };
}
