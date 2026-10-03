import { describe, expect, it } from "vitest";
import {
  discoveryUtility,
  emptyDiscoveryPerformance,
  nativeAdmissionDelay,
  nativeRevisitMinutes,
  prioritizeDiscovery,
  queryRevisitMinutes,
  type DiscoveryPerformance,
} from "@repo/core/discovery";

/** Builds declared synthetic operational history; these labels never represent independently judged model quality. */
function sample(
  values: Partial<DiscoveryPerformance> = {},
): DiscoveryPerformance {
  return {
    ...emptyDiscoveryPerformance(),
    attempts: 5,
    successful: 5,
    ...values,
  };
}

describe("discovery scheduling policies", () => {
  it("keeps cold routes neutral and refuses to treat pending or sparse classifications as noise", () => {
    expect(
      discoveryUtility(sample({ attempts: 2, reviewed: 10, noise: 10 })),
    ).toBe(0);
    expect(discoveryUtility(sample({ observations: 20, novel: 10 }))).toBe(10);
    expect(
      discoveryUtility(
        sample({ observations: 20, novel: 10, reviewed: 4, noise: 4 }),
      ),
    ).toBe(10);
    expect(
      discoveryUtility(
        sample({ observations: 20, novel: 10, reviewed: 5, noise: 5 }),
      ),
    ).toBe(-30);
    expect(discoveryUtility(sample({ successful: 0 }))).toBe(-10);
  });

  it("favours measured demand while preserving every fifth oldest-due turn", () => {
    const candidates = [
      sample({ reviewed: 10, noise: 10 }),
      emptyDiscoveryPerformance(),
      sample({ reviewed: 10, demand: 10 }),
    ];
    expect(prioritizeDiscovery(candidates, (value) => value, 1)).toEqual([
      candidates[2],
      candidates[1],
      candidates[0],
    ]);
    expect(prioritizeDiscovery(candidates, (value) => value, 5)).toEqual(
      candidates,
    );
    expect(candidates[0]?.noise).toBe(10);
  });

  it("bounds empty/noisy and unchanged query revisits without stopping exploration", () => {
    expect(queryRevisitMinutes(emptyDiscoveryPerformance())).toBe(10);
    expect(queryRevisitMinutes(sample({ attempts: 3 }))).toBe(15);
    expect(queryRevisitMinutes(sample({ attempts: 20 }))).toBe(120);
    expect(
      queryRevisitMinutes(
        sample({ observations: 10, novel: 10, reviewed: 5, noise: 5 }),
      ),
    ).toBe(60);
    expect(queryRevisitMinutes(sample({ observations: 100, novel: 1 }))).toBe(
      45,
    );
    expect(
      queryRevisitMinutes(
        sample({ observations: 10, novel: 5, reviewed: 5, demand: 5 }),
      ),
    ).toBe(10);
  });

  it("bounds native refreshes and resets the wait for changed evidence", () => {
    expect(nativeRevisitMinutes("discussion", 0)).toBe(360);
    expect(nativeRevisitMinutes("client_request", 100)).toBe(20);
    expect(nativeRevisitMinutes(null, 0)).toBe(15);
    expect(nativeRevisitMinutes(null, 2)).toBe(60);
    expect(nativeRevisitMinutes(null, 100)).toBe(180);
  });

  it("paces requests to UTC reset and recalculates immediately when a limit changes", () => {
    const input = {
      now: new Date("2026-10-03T12:00:00Z"),
      lastAttemptAt: new Date("2026-10-03T11:59:00Z"),
      requests: 3,
      reservedMicros: 150_000,
      dailyRequests: 103,
      dailyMicros: 10_000_000,
      nextCostMicros: 50_000,
    };
    expect(nativeAdmissionDelay(input)).toBe(372_000);
    expect(nativeAdmissionDelay({ ...input, requests: 2 })).toBe(0);
    expect(
      nativeAdmissionDelay({ ...input, dailyMicros: 500_000 }),
    ).toBeGreaterThan(6_000_000);
    expect(
      nativeAdmissionDelay({
        ...input,
        dailyRequests: 100_003,
        dailyMicros: 1_000_000_000,
      }),
    ).toBe(0);
    expect(nativeAdmissionDelay({ ...input, dailyRequests: 3 })).toBe(0);
    expect(nativeAdmissionDelay({ ...input, nextCostMicros: 0 })).toBe(372_000);
    expect(nativeAdmissionDelay({ ...input, lastAttemptAt: null })).toBe(0);
    expect(
      nativeAdmissionDelay({ ...input, now: new Date("2026-10-03T23:59:59Z") }),
    ).toBe(0);
  });

  it("cuts repeat polling on a declared empty-query workload while retaining bounded probes", () => {
    let minute = 0;
    let checks = 0;
    while (minute < 24 * 60) {
      checks++;
      minute += queryRevisitMinutes(
        sample({
          attempts: Math.min(checks, 20),
          successful: Math.min(checks, 20),
        }),
      );
    }
    expect(checks).toBeLessThan(25);
    expect(checks).toBeGreaterThan(12);
    expect(checks).toBeLessThan((24 * 60) / 5 / 10);
  });
});
