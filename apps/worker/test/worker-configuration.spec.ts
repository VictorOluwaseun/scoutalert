import { describe, expect, it } from "vitest";
import { readWorkerConfiguration } from "../src/config.js";

const environment = {
  DATABASE_URL: "postgresql://local:local@127.0.0.1/scoutalert_test",
};

describe("configured daily budget limits", () => {
  it("defaults the shared token cap and permits explicitly blocking generation", () => {
    const config = readWorkerConfiguration(environment);
    expect(config.SCOUT_AI_DAILY_TOKENS).toBe(2_650_000);
    expect(config.SCOUT_AI_GPT54_DAILY_TOKENS).toBe(250_000);
    expect(config.SCOUT_AI_GPT54_MINI_DAILY_TOKENS).toBe(2_400_000);
    expect(config.SCOUT_AI_PLANNING_MODEL).toBe("gpt-5.4-mini-2026-03-17");
    expect(config.SCOUT_AI_MAX_OUTPUT_TOKENS).toBe(4_000);
    expect(config.SCOUT_AI_EXPERT_MODEL).toBe("gpt-5.4-2026-03-05");
    expect(config.SCOUT_AI_AUDIT_DAILY_TOKENS).toBe(25_000);
    expect(config.SCOUT_AI_AUDIT_PERCENT).toBe(5);
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
    ["SCOUT_AI_AUDIT_PERCENT", "11"],
    ["SCOUT_AI_AUDIT_DAILY_TOKENS", "-1"],
    ["SCOUT_AI_GPT54_DAILY_TOKENS", "-1"],
    ["SCOUT_AI_GPT54_MINI_DAILY_TOKENS", "1.5"],
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

  it("keeps an explicit global ceiling and supports disabling both families", () => {
    expect(
      readWorkerConfiguration({ ...environment, SCOUT_AI_DAILY_TOKENS: "1000" })
        .SCOUT_AI_DAILY_TOKENS,
    ).toBe(1000);
    expect(
      readWorkerConfiguration({
        ...environment,
        SCOUT_AI_GPT54_DAILY_TOKENS: "0",
        SCOUT_AI_GPT54_MINI_DAILY_TOKENS: "0",
      }).SCOUT_AI_DAILY_TOKENS,
    ).toBe(0);
    expect(
      readWorkerConfiguration({
        ...environment,
        SCOUT_AI_GPT54_DAILY_TOKENS: "100",
        SCOUT_AI_GPT54_MINI_DAILY_TOKENS: "900",
      }).SCOUT_AI_DAILY_TOKENS,
    ).toBe(1000);
  });

  it.each(["0", "249999", "250000"])(
    "rejects a mini allowance no larger than the full-model allowance: %s",
    (value) => {
      expect(() =>
        readWorkerConfiguration({
          ...environment,
          SCOUT_AI_GPT54_MINI_DAILY_TOKENS: value,
        }),
      ).toThrow(
        "SCOUT_AI_GPT54_MINI_DAILY_TOKENS above SCOUT_AI_GPT54_DAILY_TOKENS",
      );
    },
  );

  it("keeps routine planning on mini and limits expert work to the full model", () => {
    const enabled = {
      ...environment,
      SCOUT_AI_ENABLED: "true",
      OPENAI_API_KEY: "fixture-no-network",
    };
    expect(readWorkerConfiguration(enabled).SCOUT_AI_PLANNING_MODEL).toBe(
      "gpt-5.4-mini-2026-03-17",
    );
    expect(
      readWorkerConfiguration({
        ...enabled,
        SCOUT_AI_PLANNING_MODEL: "gpt-5.4-mini",
      }).SCOUT_AI_PLANNING_MODEL,
    ).toBe("gpt-5.4-mini");
    for (const field of ["SCOUT_AI_EXTRACTION_MODEL", "SCOUT_AI_FIT_MODEL"]) {
      expect(() =>
        readWorkerConfiguration({ ...enabled, [field]: "gpt-5.4" }),
      ).toThrow("reviewed pricing policy");
    }
    expect(() =>
      readWorkerConfiguration({
        ...enabled,
        SCOUT_AI_PLANNING_MODEL: "gpt-5.4-unknown",
      }),
    ).toThrow("reviewed pricing policy");
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
