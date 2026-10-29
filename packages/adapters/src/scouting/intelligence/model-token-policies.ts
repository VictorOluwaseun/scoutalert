import type { ModelTokenBudgetPolicy } from "@repo/core/scouting";

/** Reviewed GPT-5.4 aliases share one allowance with their pinned snapshots; unknown versions cannot silently receive fresh capacity. */
export function modelTokenBudgetPolicies(
  fullDailyTokens: number,
  miniDailyTokens: number,
  auditTokens = 0,
): ModelTokenBudgetPolicy[] {
  return [
    {
      family: "gpt-5.4",
      models: ["gpt-5.4", "gpt-5.4-2026-03-05"],
      dailyLimit: fullDailyTokens,
      auditTokens,
    },
    {
      family: "gpt-5.4-mini",
      models: ["gpt-5.4-mini", "gpt-5.4-mini-2026-03-17"],
      dailyLimit: miniDailyTokens,
    },
  ];
}
