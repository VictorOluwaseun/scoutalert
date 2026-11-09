import type { ModelTokenBudgetPolicy } from "@repo/core/scouting";

/** Optional account ceilings and a separately costed, fixed 30-day paid allocation. */
export interface ModelTokenBudgetExtras {
  miniAccountTokens?: number;
  fullAccountTokens?: number;
  paid?: { anchor: string; miniMicrousd: number; fullMicrousd: number };
}

/** Reviewed GPT-5.4 aliases share one allowance with their pinned snapshots; unknown versions cannot silently receive fresh capacity. */
export function modelTokenBudgetPolicies(
  fullDailyTokens: number,
  miniDailyTokens: number,
  auditTokens = 0,
  pacing?: ModelTokenBudgetPolicy["pacing"],
  fullPacing?: ModelTokenBudgetPolicy["pacing"],
  extras: ModelTokenBudgetExtras = {},
): ModelTokenBudgetPolicy[] {
  return [
    {
      family: "gpt-5.4",
      models: ["gpt-5.4", "gpt-5.4-2026-03-05"],
      dailyLimit: fullDailyTokens,
      auditTokens,
      accountDailyLimit: extras.fullAccountTokens,
      sharedDailyLimit:
        extras.fullAccountTokens === undefined ? undefined : 50_000,
      ...(extras.paid?.fullMicrousd
        ? {
            paid: {
              periodAnchor: extras.paid.anchor,
              periodDays: 30,
              periodMicrousd: extras.paid.fullMicrousd,
              inputRate: 2.5,
              cachedRate: 0.25,
              outputRate: 15,
              burstMicrousd: 100_000,
            },
          }
        : {}),
      ...(fullPacing ? { pacing: fullPacing } : {}),
    },
    {
      family: "gpt-5.4-mini",
      models: ["gpt-5.4-mini", "gpt-5.4-mini-2026-03-17"],
      dailyLimit: miniDailyTokens,
      accountDailyLimit: extras.miniAccountTokens,
      sharedDailyLimit:
        extras.miniAccountTokens === undefined ? undefined : 200_000,
      ...(extras.paid?.miniMicrousd
        ? {
            paid: {
              periodAnchor: extras.paid.anchor,
              periodDays: 30,
              periodMicrousd: extras.paid.miniMicrousd,
              inputRate: 0.75,
              cachedRate: 0.075,
              outputRate: 4.5,
              burstMicrousd: 84_000,
            },
          }
        : {}),
      ...(pacing ? { pacing } : {}),
    },
  ];
}
