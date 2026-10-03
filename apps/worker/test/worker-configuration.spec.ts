import { describe, expect, it } from "vitest";
import { readWorkerConfiguration } from "../src/config.js";

const environment = {
  DATABASE_URL: "postgresql://local:local@127.0.0.1/scoutalert_test",
};

describe("configured daily budget limits", () => {
  it("retains conservative defaults when no allowance is supplied", () => {
    const config = readWorkerConfiguration(environment);

    expect(config.SCOUT_AI_DAILY_REQUESTS).toBe(50);
    expect(config.SCOUT_AI_DAILY_USD).toBe(5);
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
