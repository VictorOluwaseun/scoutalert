import { describe, expect, it } from "vitest";
import {
  applyEmployerResearch,
  validResearch,
  validAnalysis,
  assessPersonalFit,
  type EmployerResearch,
} from "@repo/core/scouting";
import { isPromptMatch } from "@repo/core/notifications";
import { estimateIntelligenceCost } from "@repo/adapters/scouting";
import { ReviewSearchDraft } from "@repo/core/onboarding";
import { analysis, fit, posting, search } from "./fixtures/intelligence.js";

/** Builds applicable public evidence with an explicit six-hour validity interval. */
function evidence(): EmployerResearch {
  const checkedAt = new Date().toISOString();
  const url = "https://www.figma.com/careers/";
  return {
    checkedAt,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    documents: [
      {
        url,
        text: "Every role requires permission to work in Nigeria. Sponsorship is not offered for any role.",
        checkedAt,
        fingerprint: "evidence",
      },
    ],
    findings: [
      {
        fact: "authorization",
        status: "resolved",
        applicability: "all_roles",
        value: "Permission to work in Nigeria required",
        explanation: "The employer states a universal requirement.",
        quotes: ["Every role requires permission to work in Nigeria."],
        sourceUrl: url,
      },
      {
        fact: "location",
        status: "unresolved",
        applicability: "unclear",
        value: "",
        explanation: "Hiring locations remain unclear.",
        quotes: [],
        sourceUrl: null,
      },
      {
        fact: "sponsorship",
        status: "resolved",
        applicability: "all_roles",
        value: "Not offered",
        explanation: "The policy explicitly covers all roles.",
        quotes: ["Sponsorship is not offered for any role."],
        sourceUrl: url,
      },
    ],
  };
}

describe("employer evidence and verified alert boundaries", () => {
  it("rejects fabricated, misattributed, stale and scope-ambiguous evidence", () => {
    expect(validResearch(evidence())).toBe(true);
    const invented = evidence();
    invented.findings[0]!.quotes = ["We sponsor everyone."];
    expect(validResearch(invented)).toBe(false);
    const scope = evidence();
    scope.findings[0]!.applicability = "unclear";
    expect(validResearch(scope)).toBe(false);
    const url = evidence();
    url.findings[0]!.sourceUrl = "https://example.org/";
    expect(validResearch(url)).toBe(false);
    const expired = evidence();
    expired.expiresAt = new Date(Date.now() - 1).toISOString();
    expect(validResearch(expired)).toBe(false);
    const oldDocument = evidence();
    oldDocument.documents[0]!.checkedAt = "2020-01-01T00:00:00Z";
    expect(validResearch(oldDocument)).toBe(false);
  });
  it("supplements unknown public facts without overwriting role-specific restrictions", () => {
    const original = {
      ...analysis,
      facts: {
        ...analysis.facts,
        authorization: { status: "unknown" as const, value: "", quotes: [] },
      },
    };
    const researched = applyEmployerResearch(original, evidence());
    expect(researched.facts.authorization.status).toBe("stated");
    expect(researched.facts.sponsorship).toEqual(analysis.facts.sponsorship);
    expect(validAnalysis(posting, researched)).toBe(true);
    expect(original.facts.authorization.status).toBe("unknown");
  });
  it("requires explicit personal declaration and still withholds sponsorship uncertainty", () => {
    const declared = {
      ...search,
      authorizationLocations: "Nigeria",
      sponsorshipNeed: "not_needed" as const,
      authorizationConfirmed: true,
    };
    const accepted = assessPersonalFit(declared, analysis, fit)!;
    expect(
      accepted.detail!.criteria.find(
        (item) => item.criterion === "authorization",
      )!.status,
    ).toBe("meets");
    const missing = {
      ...analysis,
      facts: {
        ...analysis.facts,
        sponsorship: { status: "unknown" as const, value: "", quotes: [] },
      },
    };
    expect(
      assessPersonalFit(
        { ...declared, sponsorshipNeed: "needed" },
        missing,
        fit,
      )!.detail!.criteria.find((item) => item.criterion === "authorization")!
        .status,
    ).toBe("unknown");
    expect(
      new ReviewSearchDraft().execute({
        ...search,
        authorizationConfirmed: true,
      }).ready,
    ).toBe(false);
    const now = new Date();
    const opportunity = {
      ...posting,
      ...accepted,
      scouts: [search.name],
      checkedAt: now.toISOString(),
      availability: {
        status: "available" as const,
        checkedAt: now.toISOString(),
        sourceUrl: posting.url,
        fingerprint: posting.fingerprint,
      },
    };
    expect(isPromptMatch(opportunity, declared, now)).toBe(true);
    expect(isPromptMatch(opportunity, search, now)).toBe(false);
    const stale = {
      ...opportunity,
      detail: {
        ...accepted.detail!,
        employerResearch: { ...evidence(), expiresAt: "2020-01-01T00:00:00Z" },
      },
    };
    expect(isPromptMatch(stale, declared, now)).toBe(false);
    expect(
      isPromptMatch(
        {
          ...opportunity,
          detail: {
            ...accepted.detail!,
            verificationPolicy: "supported-criteria-v2",
          },
        },
        declared,
        now,
      ),
    ).toBe(false);
    const legacy = {
      ...opportunity,
      detail: { ...accepted.detail!, verificationPolicy: undefined },
    };
    expect(isPromptMatch(legacy, declared, now)).toBe(false);
  });
  it("prices cached tokens separately and keeps unrecognized models unpriced", () => {
    const usage = {
      model: "gpt-5.4-mini-2026-03-17",
      inputTokens: 1000,
      cachedInputTokens: 800,
      outputTokens: 100,
      durationMs: 5,
      responseId: "fixture",
    };
    expect(estimateIntelligenceCost(usage)?.estimatedMicrousd).toBe(660);
    expect(
      estimateIntelligenceCost({ ...usage, model: "unpriced-model" }),
    ).toBeNull();
  });
});
