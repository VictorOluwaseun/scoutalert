import { describe, expect, it } from "vitest";
import {
  assessPersonalFit,
  validAnalysis,
  validFit,
  normalizeCompensation,
  type PersonalFit,
} from "@repo/core/scouting";
import { search, posting, analysis, fit } from "./fixtures/intelligence.js";

/** Changes one model proposal without mutating shared fixtures. */
function change(
  criterion: string,
  status: "meets" | "conflicts" | "unknown",
): PersonalFit {
  return {
    criteria: fit.criteria.map((item) =>
      item.criterion === criterion ? { ...item, status } : item,
    ),
  };
}

describe("evidence and personal fit policies", () => {
  it("rejects invented source evidence, duplicate criteria, and invented profile quotes", () => {
    expect(validAnalysis(posting, analysis)).toBe(true);
    expect(
      validAnalysis(posting, {
        ...analysis,
        facts: {
          ...analysis.facts,
          role: {
            status: "stated",
            value: "invented",
            quotes: ["not in source"],
          },
        },
      }),
    ).toBe(false);
    expect(validFit(posting, search, fit)).toBe(true);
    expect(
      validFit(posting, search, {
        criteria: fit.criteria.map(() => fit.criteria[0]!),
      }),
    ).toBe(false);
    expect(
      validFit(posting, search, {
        criteria: fit.criteria.map((item) => ({
          ...item,
          briefQuotes: ["Invented citizenship"],
        })),
      }),
    ).toBe(false);
  });
  it("keeps work authorization unknown and honors strict eligibility", () => {
    expect(
      assessPersonalFit(search, analysis, fit)?.detail?.criteria.find(
        (item) => item.criterion === "authorization",
      )?.status,
    ).toBe("unknown");
    expect(
      assessPersonalFit(
        { ...search, unknownEligibility: "exclude" },
        analysis,
        fit,
      ),
    ).toBeNull();
  });
  it("does not let a model waive must-haves or explicit location conflicts", () => {
    expect(
      assessPersonalFit(search, analysis, change("arrangement", "unknown")),
    ).toBeNull();
    expect(
      assessPersonalFit(search, analysis, change("location", "conflicts")),
    ).toBeNull();
    expect(
      assessPersonalFit(search, analysis, change("role", "conflicts")),
    ).toBeNull();
    expect(
      assessPersonalFit(search, analysis, change("category", "unknown")),
    ).toBeNull();
    expect(
      assessPersonalFit(
        { ...search, arrangementRequired: false },
        analysis,
        change("arrangement", "conflicts"),
      ),
    ).not.toBeNull();
  });
  it("compares pay arithmetically, preserving range uncertainty and incompatible units", () => {
    expect(
      assessPersonalFit(
        search,
        {
          ...analysis,
          pay: { ...analysis.pay, minimum: 30000, maximum: 40000 },
        },
        fit,
      ),
    ).toBeNull();
    const range = assessPersonalFit(
      search,
      { ...analysis, pay: { ...analysis.pay, minimum: 30000 } },
      fit,
    );
    expect(
      range?.detail?.criteria.find((item) => item.criterion === "compensation")
        ?.status,
    ).toBe("unknown");
    const currency = assessPersonalFit(
      search,
      { ...analysis, pay: { ...analysis.pay, currency: "NGN" } },
      fit,
    );
    expect(
      currency?.detail?.criteria.find(
        (item) => item.criterion === "compensation",
      )?.status,
    ).toBe("unknown");
    const period = assessPersonalFit(
      search,
      { ...analysis, pay: { ...analysis.pay, period: "hour" } },
      fit,
    );
    expect(
      period?.detail?.criteria.find((item) => item.criterion === "compensation")
        ?.status,
    ).toBe("unknown");
  });
  it("retains missing experience and contradictory public evidence as unknown", () => {
    const missing = assessPersonalFit(
      { ...search, background: "" },
      analysis,
      fit,
    );
    expect(
      missing?.detail?.criteria.find((item) => item.criterion === "experience")
        ?.status,
    ).toBe("unknown");
    const contradictory = {
      ...analysis,
      facts: {
        ...analysis.facts,
        arrangement: {
          ...analysis.facts.arrangement,
          status: "conflicting" as const,
        },
      },
    };
    expect(assessPersonalFit(search, contradictory, fit)).toBeNull();
  });
});

describe("compensation evidence normalization", () => {
  it("reads explicit numeric ranges without guessed currency/period conversions", () => {
    const quoted = {
      ...analysis,
      facts: {
        ...analysis.facts,
        compensation: {
          ...analysis.facts.compensation,
          quotes: ["Base salary is USD 60,000 to 80,000 per year."],
        },
      },
    };
    expect(normalizeCompensation(quoted).pay).toEqual({
      minimum: 60000,
      maximum: 80000,
      currency: "USD",
      period: "year",
    });
    expect(
      normalizeCompensation({
        ...quoted,
        facts: {
          ...quoted.facts,
          compensation: {
            ...quoted.facts.compensation,
            quotes: ["Bonus is USD 60000 to 80000 per year."],
          },
        },
      }).pay.minimum,
    ).toBeNull();
    expect(
      normalizeCompensation({
        ...quoted,
        facts: {
          ...quoted.facts,
          compensation: {
            ...quoted.facts.compensation,
            quotes: ["Base salary is $60,000 to $80,000."],
          },
        },
      }).pay.minimum,
    ).toBeNull();
    expect(
      normalizeCompensation({
        ...quoted,
        facts: {
          ...quoted.facts,
          compensation: {
            ...quoted.facts.compensation,
            quotes: [
              "Base salary is USD 60000 to 80000 per year. Base salary is GBP 40000 to 60000 per year.",
            ],
          },
        },
      }).pay.minimum,
    ).toBeNull();
  });
});

describe("work arrangement evidence", () => {
  it("cannot turn hourly or contract terms into a mandatory remote match", () => {
    const ambiguous = {
      ...analysis,
      facts: {
        ...analysis.facts,
        arrangement: {
          status: "stated" as const,
          value: "Hourly contract work",
          quotes: [
            "Source category: buyer-posted client project / service request (hourly).",
          ],
        },
      },
    };
    expect(assessPersonalFit(search, ambiguous, fit)).toBeNull();
    const optional = assessPersonalFit(
      { ...search, arrangementRequired: false },
      ambiguous,
      fit,
    );
    expect(
      optional?.detail?.criteria.find(
        (item) => item.criterion === "arrangement",
      )?.status,
    ).toBe("unknown");
  });
  it("checks the arrangement's own citation and preserves explicit hybrid or on-site restrictions", () => {
    const missingCitation = {
      ...analysis,
      facts: {
        ...analysis.facts,
        arrangement: {
          status: "stated" as const,
          value: "remote",
          quotes: ["Contract paid hourly."],
        },
      },
    };
    expect(assessPersonalFit(search, missingCitation, fit)).toBeNull();
    const hybrid = {
      ...analysis,
      facts: {
        ...analysis.facts,
        arrangement: {
          status: "stated" as const,
          value: "hybrid",
          quotes: ["Hybrid work with three on-site days and two remote days."],
        },
      },
    };
    expect(assessPersonalFit(search, hybrid, fit)).toBeNull();
    expect(
      assessPersonalFit({ ...search, arrangement: "hybrid" }, hybrid, fit),
    ).not.toBeNull();
    const onsite = {
      ...analysis,
      facts: {
        ...analysis.facts,
        arrangement: {
          status: "stated" as const,
          value: "on-site",
          quotes: ["This is an on-site position in Lagos."],
        },
      },
    };
    expect(assessPersonalFit(search, onsite, fit)).toBeNull();
    expect(
      assessPersonalFit({ ...search, arrangement: "onsite" }, onsite, fit),
    ).not.toBeNull();
  });
});
