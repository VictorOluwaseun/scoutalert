import { modelTokenBudgetPolicies } from "@repo/adapters/scouting";
import type { WorkerConfiguration } from "../config.js";

/** Keeps worker, usage reports and shared evaluations on the same base, account and paid policies. */
export function configuredTokenPolicies(config: WorkerConfiguration) {
  return modelTokenBudgetPolicies(
    config.SCOUT_AI_GPT54_DAILY_TOKENS,
    config.SCOUT_AI_GPT54_MINI_DAILY_TOKENS,
    config.SCOUT_AI_AUDIT_DAILY_TOKENS,
    {
      windowMinutes: config.SCOUT_AI_MINI_PACING_WINDOW_MINUTES,
      maintenancePercent: config.SCOUT_AI_MINI_MAINTENANCE_PERCENT,
      carryoverMinutes: config.SCOUT_AI_MINI_CARRYOVER_MINUTES,
      demandMinutes: config.SCOUT_AI_PACING_DEMAND_MINUTES,
    },
    {
      windowMinutes: config.SCOUT_AI_GPT54_PACING_WINDOW_MINUTES,
      carryoverMinutes: config.SCOUT_AI_GPT54_CARRYOVER_MINUTES,
      maintenancePercent: 100,
      minimumBurstTokens: 32_000,
      demandMinutes: config.SCOUT_AI_PACING_DEMAND_MINUTES,
    },
    {
      miniAccountTokens: config.beta.enabled
        ? config.beta.miniAccountTokens
        : undefined,
      fullAccountTokens: config.beta.enabled
        ? config.beta.fullAccountTokens
        : undefined,
      paid:
        config.SCOUT_AI_PAID_MONTHLY_USD > 0
          ? {
              anchor: config.SCOUT_AI_PAID_PERIOD_ANCHOR!,
              miniMicrousd: Math.floor(
                config.SCOUT_AI_PAID_MINI_MONTHLY_USD * 1_000_000,
              ),
              fullMicrousd: Math.floor(
                config.SCOUT_AI_PAID_GPT54_MONTHLY_USD * 1_000_000,
              ),
            }
          : undefined,
    },
  );
}
