import { describe, expect, it } from "vitest";
import { paidBudgetPeriod, paidTokenCost } from "@repo/core/scouting";
import { readBetaConfiguration } from "@repo/adapters/onboarding";
import { assertBetaReady } from "@repo/core/onboarding";
import { readWorkerConfiguration } from "../src/config.js";

const policy = {
  periodAnchor: "2026-11-09",
  periodDays: 30,
  periodMicrousd: 10_000_000,
  inputRate: 2.5,
  cachedRate: 0.25,
  outputRate: 15,
  burstMicrousd: 100_000,
};

describe("beta spending policy", () => {
  it("requires explicit legacy-account cleanup before beta execution starts", () => {
    const policy = { maximumAccounts: 50, activeScoutsPerAccount: 1 };
    expect(() =>
      assertBetaReady(policy, {
        accounts: 15,
        activeScouts: 20,
        accountsOverScoutLimit: 4,
      }),
    ).toThrow("4 accounts over");
    expect(() =>
      assertBetaReady(policy, {
        accounts: 51,
        activeScouts: 51,
        accountsOverScoutLimit: 0,
      }),
    ).toThrow("51 accounts");
    expect(() =>
      assertBetaReady(policy, {
        accounts: 50,
        activeScouts: 50,
        accountsOverScoutLimit: 0,
      }),
    ).not.toThrow();
  });
  it("spreads the exact allocation across 30 UTC days and rolls forward without a calendar-month reset", () => {
    const start = Date.parse("2026-11-09T00:00:00Z");
    const days = Array.from({ length: 30 }, (_, day) =>
      paidBudgetPeriod(policy, new Date(start + day * 86_400_000)),
    );
    expect(days.reduce((sum, day) => sum + day.dailyMicrousd, 0)).toBe(
      10_000_000,
    );
    expect(days.every((day) => day.start === "2026-11-09")).toBe(true);
    expect(
      paidBudgetPeriod(policy, new Date(start + 30 * 86_400_000)).start,
    ).toBe("2026-12-09");
    expect(paidBudgetPeriod(policy, new Date(start - 1)).started).toBe(false);
  });

  it("reserves expensive output and counts cached input only once", () => {
    expect(paidTokenCost(policy, 2000, 4000)).toBe(65_000);
    expect(paidTokenCost(policy, 2000, 100, 1000)).toBe(4250);
  });

  it("configures 50 seats, one active scout and a daily deep-search window", () => {
    expect(readBetaConfiguration({ SCOUT_BETA_ENABLED: "true" })).toMatchObject(
      {
        enabled: true,
        policy: { maximumAccounts: 50, activeScoutsPerAccount: 1 },
        refreshMinutes: 1440,
        dispatchBatch: 2,
      },
    );
  });

  it("requires a valid fixed anchor and keeps allocations within the extra budget", () => {
    const environment = {
      DATABASE_URL: "postgresql://local:local@localhost/scoutalert_test",
      SCOUT_AI_PAID_MONTHLY_USD: "40",
    };
    expect(() => readWorkerConfiguration(environment)).toThrow(
      "SCOUT_AI_PAID_PERIOD_ANCHOR",
    );
    expect(() =>
      readWorkerConfiguration({
        ...environment,
        SCOUT_AI_PAID_PERIOD_ANCHOR: "2026-02-30",
      }),
    ).toThrow("SCOUT_AI_PAID_PERIOD_ANCHOR");
    expect(() =>
      readWorkerConfiguration({
        ...environment,
        SCOUT_AI_PAID_PERIOD_ANCHOR: "2026-11-09",
        SCOUT_AI_PAID_MINI_MONTHLY_USD: "31",
      }),
    ).toThrow("SCOUT_AI_PAID_MONTHLY_USD");
    expect(
      readWorkerConfiguration({
        ...environment,
        SCOUT_AI_PAID_PERIOD_ANCHOR: "2026-11-09",
      }),
    ).toMatchObject({
      SCOUT_AI_DAILY_TOKENS: 2_650_000,
      SCOUT_AI_GPT54_DAILY_TOKENS: 250_000,
      SCOUT_AI_GPT54_MINI_DAILY_TOKENS: 2_400_000,
    });
  });
});
