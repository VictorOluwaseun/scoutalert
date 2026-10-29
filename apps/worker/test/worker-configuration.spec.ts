import { describe, expect, it } from "vitest";
import { readWorkerConfiguration } from "../src/config.js";

const environment = {
  DATABASE_URL: "postgresql://local:local@127.0.0.1/scoutalert_test",
};

describe("configured daily budget limits", () => {
  it("defaults the shared token cap and permits explicitly blocking generation", () => {
    const config = readWorkerConfiguration(environment);
    expect(config.SCOUT_AI_DAILY_TOKENS).toBe(100_000);
    expect(config.SCOUT_AI_MAX_OUTPUT_TOKENS).toBe(4_000);
    expect(
      readWorkerConfiguration({
        ...environment,
        SCOUT_AI_DAILY_TOKENS: "0",
        SCOUT_AI_MAX_OUTPUT_TOKENS: "256",
      }),
    ).toMatchObject({
      SCOUT_AI_DAILY_TOKENS: 0,
      SCOUT_AI_MAX_OUTPUT_TOKENS: 256,
    });
  });

  it.each([
    ["SCOUT_AI_DAILY_TOKENS", "-1"],
    ["SCOUT_AI_DAILY_TOKENS", "1.5"],
    ["SCOUT_AI_DAILY_TOKENS", "2147483648"],
    ["SCOUT_AI_DAILY_TOKENS", "Infinity"],
    ["SCOUT_AI_MAX_OUTPUT_TOKENS", "0"],
    ["SCOUT_AI_MAX_OUTPUT_TOKENS", "15"],
    ["SCOUT_AI_MAX_OUTPUT_TOKENS", "4001"],
    ["SCOUT_AI_MAX_OUTPUT_TOKENS", "NaN"],
  ])("rejects an invalid token limit %s=%s", (key, value) => {
    expect(() =>
      readWorkerConfiguration({ ...environment, [key]: value }),
    ).toThrow(`Invalid fields: ${key}`);
  });

  it("retains conservative defaults when no allowance is supplied", () => {
    const config = readWorkerConfiguration(environment);

    expect(config.SCOUT_AI_DAILY_REQUESTS).toBe(50);
    expect(config.SCOUT_AI_DAILY_USD).toBe(5);
  });

  it("keeps navigation within database bounds without raising the document or spending defaults", () => {
    const config = readWorkerConfiguration(environment);
    expect(config.SCOUT_WEB_MAX_DEPTH).toBe(4);
    expect(config.SCOUT_WEB_MAX_ROUNDS).toBe(8);
    expect(config.SCOUT_WEB_MAX_SOURCE_PAGES).toBe(3);
    expect(config.SCOUT_WEB_MAX_DOCUMENTS).toBe(4);
    expect(() =>
      readWorkerConfiguration({ ...environment, SCOUT_WEB_MAX_DEPTH: "9" }),
    ).toThrow();
    expect(() =>
      readWorkerConfiguration({ ...environment, SCOUT_WEB_MAX_ROUNDS: "17" }),
    ).toThrow();
    expect(() =>
      readWorkerConfiguration({
        ...environment,
        SCOUT_WEB_MAX_SOURCE_PAGES: "0",
      }),
    ).toThrow();
  });

  it("accepts explicitly configured allowances above the former hard-coded caps", () => {
    const config = readWorkerConfiguration({
      ...environment,
      SCOUT_AI_DAILY_REQUESTS: "50000",
      SCOUT_AI_DAILY_USD: "50000",
      SCOUT_WEB_DAILY_USD: "50000",
      SCOUT_WEB_DAILY_DOCUMENTS: "50000",
    });

    expect(config.SCOUT_AI_DAILY_REQUESTS).toBe(50_000);
    expect(config.SCOUT_AI_DAILY_USD).toBe(50_000);
    expect(config.SCOUT_WEB_DAILY_USD).toBe(50_000);
    expect(config.SCOUT_WEB_DAILY_DOCUMENTS).toBe(50_000);
    expect(config.SCOUT_X_DAILY_REQUESTS).toBe(20);
    expect(config.SCOUT_X_DAILY_USD).toBe(1);
  });

  it.each(["0", "-1", "1.5", "2147483648", "Infinity", "NaN"])(
    "rejects a request allowance incompatible with the ledger: %s",
    (value) => {
      expect(() =>
        readWorkerConfiguration({
          ...environment,
          SCOUT_AI_DAILY_REQUESTS: value,
        }),
      ).toThrow();
    },
  );

  it.each(["0", "0.074", "-1", "9007199255", "Infinity", "NaN"])(
    "rejects a monetary allowance outside exact reservation arithmetic: %s",
    (value) => {
      expect(() =>
        readWorkerConfiguration({
          ...environment,
          SCOUT_AI_DAILY_USD: value,
        }),
      ).toThrow();
    },
  );

  it("identifies invalid fields without including supplied credentials", () => {
    expect(() =>
      readWorkerConfiguration({
        ...environment,
        SCOUT_AI_DAILY_USD: "invalid",
        X_BEARER_TOKEN: "private-test-credential",
      }),
    ).toThrow(
      "Configure valid worker settings before startup. Invalid fields: SCOUT_AI_DAILY_USD.",
    );
  });
});
