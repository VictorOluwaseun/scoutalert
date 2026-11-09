/** USD rates are microdollars per token, numerically equal to dollars per million tokens. */
export interface ModelPaidBudgetPolicy {
  periodAnchor: string;
  periodDays: number;
  periodMicrousd: number;
  inputRate: number;
  cachedRate: number;
  outputRate: number;
  burstMicrousd: number;
}

/** Read-only paid capacity; ordinary token counters continue to describe the base allowance. */
export interface ModelPaidBudgetSnapshot {
  periodStart: string;
  periodEndsAt: string;
  periodLimitMicrousd: number;
  periodCommittedMicrousd: number;
  dailyLimitMicrousd: number;
  dailyCommittedMicrousd: number;
  availableMicrousd: number;
  burstMicrousd: number;
  usedTokens: number;
  reservedTokens: number;
  unknownReservations: number;
  retryAt: string;
  inputRate: number;
  cachedRate: number;
  outputRate: number;
}

/** Splits every microdollar across fixed UTC days; the persisted anchor prevents a restart or month boundary granting new credit. */
export function paidBudgetPeriod(policy: ModelPaidBudgetPolicy, now: Date) {
  const dayMs = 86_400_000;
  const anchor = Date.parse(`${policy.periodAnchor}T00:00:00Z`);
  const elapsedDays = Math.floor((now.getTime() - anchor) / dayMs);
  const cycle = Math.max(0, Math.floor(elapsedDays / policy.periodDays));
  const index = Math.max(0, elapsedDays % policy.periodDays);
  const start = anchor + cycle * policy.periodDays * dayMs;
  return {
    started: elapsedDays >= 0,
    start: new Date(start).toISOString().slice(0, 10),
    endsAt: new Date(start + policy.periodDays * dayMs).toISOString(),
    dailyMicrousd:
      Math.floor(((index + 1) * policy.periodMicrousd) / policy.periodDays) -
      Math.floor((index * policy.periodMicrousd) / policy.periodDays),
  };
}

/** Reserves uncached input and maximum output; settled cached input is charged once at its captured rate. */
export function paidTokenCost(
  rates: Pick<ModelPaidBudgetPolicy, "inputRate" | "cachedRate" | "outputRate">,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  return Math.ceil(
    (inputTokens - cachedInputTokens) * rates.inputRate +
      cachedInputTokens * rates.cachedRate +
      outputTokens * rates.outputRate,
  );
}
