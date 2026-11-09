import type { ModelTokenBudgetPolicy } from "./token-budget.js";

/** Computes bounded carryover capacity; small expert allocations must still accommodate one complete request. */
export function tokenPacingCapacity(
  dailyLimit: number,
  pacing: NonNullable<ModelTokenBudgetPolicy["pacing"]>,
): number {
  const minutes = pacing.windowMinutes + (pacing.carryoverMinutes ?? 0);
  return Math.min(
    dailyLimit,
    Math.max(
      pacing.minimumBurstTokens ?? 0,
      Math.floor((dailyLimit * minutes) / 1440),
    ),
  );
}

/** Refills from elapsed wall time without a midnight/restart bonus. Negative credit represents a reported provider overage. */
export function refillTokenCredit(
  credit: number,
  elapsedMs: number,
  dailyLimit: number,
  capacity: number,
): number {
  return (
    Math.floor(
      Math.min(
        capacity,
        credit + (Math.max(0, elapsedMs) * dailyLimit) / 86_400_000,
      ) * 1_000_000,
    ) / 1_000_000
  );
}

/** Waiting requests are scheduling signals only, never extra allowance or permission to publish a lead. */
export interface TokenDemand {
  participant: string;
  work: "discovery" | "maintenance";
  requestedTokens: number;
  committedTokens: number;
}

/** Lends idle discovery capacity and gives the next affordable turn to the least-served waiting participant. One indivisible call may overshoot equal service. */
export function tokenPacingAvailability(
  credit: number,
  maintenanceLimit: number,
  maintenanceCommitted: number,
  demands: TokenDemand[],
  participant: string | null,
  committed: number,
) {
  const discoveryWaiting = demands.some(
    (item) => item.work === "discovery" && item.requestedTokens <= credit,
  );
  const maintenanceAvailable = discoveryWaiting
    ? Math.min(credit, Math.max(0, maintenanceLimit - maintenanceCommitted))
    : credit;
  const eligible = demands.filter(
    (item) =>
      item.requestedTokens <=
      (item.work === "discovery" ? credit : maintenanceAvailable),
  );
  const leastServed = Math.min(
    committed,
    ...eligible.map((item) => item.committedTokens),
  );
  const fairTurn = participant === null || committed <= leastServed;
  return {
    availableTokens: fairTurn ? credit : 0,
    maintenanceAvailableTokens: fairTurn ? maintenanceAvailable : 0,
    maintenanceBorrowing: !discoveryWaiting,
    waitingScouts: eligible.filter((item) => item.participant !== "shared")
      .length,
    fairTurn,
  };
}
