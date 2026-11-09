import { describe, expect, it } from "vitest";
import {
  refillTokenCredit,
  tokenPacingAvailability,
  tokenPacingCapacity,
} from "@repo/core/scouting";

describe("bounded token credit policy", () => {
  it("carries idle time within capacity and repays overage debt before allowing more work", () => {
    const capacity = tokenPacingCapacity(2_400_000, {
      windowMinutes: 60,
      carryoverMinutes: 60,
      maintenancePercent: 30,
    });
    expect(capacity).toBe(200_000);
    expect(refillTokenCredit(0, 30 * 60_000, 2_400_000, capacity)).toBe(50_000);
    expect(refillTokenCredit(0, 24 * 60 * 60_000, 2_400_000, capacity)).toBe(
      capacity,
    );
    expect(refillTokenCredit(-2000, 36_000, 2_400_000, capacity)).toBe(-1000);
    expect(refillTokenCredit(-2000, -36_000, 2_400_000, capacity)).toBe(-2000);
  });

  it("fits an indivisible expert call without enlarging a small or disabled allocation", () => {
    const pacing = {
      windowMinutes: 60,
      carryoverMinutes: 120,
      minimumBurstTokens: 32_000,
      maintenancePercent: 100,
    };
    expect(tokenPacingCapacity(250_000, pacing)).toBe(32_000);
    expect(tokenPacingCapacity(40_000, pacing)).toBe(32_000);
    expect(tokenPacingCapacity(4000, pacing)).toBe(4000);
    expect(tokenPacingCapacity(0, pacing)).toBe(0);
  });

  it("lends idle priority capacity, but never lets an unaffordable contender block useful work", () => {
    const waiting = {
      participant: "other",
      work: "discovery" as const,
      requestedTokens: 10_000,
      committedTokens: 0,
    };
    expect(
      tokenPacingAvailability(9000, 3000, 3000, [waiting], "active", 10_000),
    ).toMatchObject({
      fairTurn: true,
      maintenanceAvailableTokens: 9000,
      maintenanceBorrowing: true,
    });
    expect(
      tokenPacingAvailability(10_000, 3000, 3000, [waiting], "active", 10_000),
    ).toMatchObject({
      fairTurn: false,
      maintenanceAvailableTokens: 0,
      maintenanceBorrowing: false,
    });
    expect(
      tokenPacingAvailability(10_000, 3000, 3000, [], "active", 10_000),
    ).toMatchObject({ fairTurn: true, maintenanceAvailableTokens: 10_000 });
  });
});
