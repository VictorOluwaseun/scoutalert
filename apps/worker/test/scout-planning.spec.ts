import { describe, it, expect } from "vitest";
import {
  validReasoning,
  normalizeReasoning,
  planDiscovery,
  explorationChoices,
  type DiscoveryReasoningInput,
  type DiscoveryExploration,
} from "@repo/core/discovery";
import {
  applyEmployerResearch,
  validResearch,
  type EmployerResearch,
} from "@repo/core/scouting";
import { analysis, search } from "./fixtures/intelligence.js";

const intent: DiscoveryReasoningInput = {
  kind: "strategy",
  intent: {
    target: "Android or server-side Software Engineer or both",
    category: "employment",
    remote: true,
  },
};

/** Provides explicit missing public facts for bounded research validation. */
function linkedEvidence(): EmployerResearch {
  const checkedAt = new Date().toISOString();
  const url = "https://careers.example.org/apply/42";
  return {
    checkedAt,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    documents: [
      {
        url,
        checkedAt,
        fingerprint: "fixture",
        text: "Kotlin required. Apply by 2026-12-01.",
      },
    ],
    findings: [
      ...(["location", "authorization", "sponsorship"] as const).map(
        (fact) => ({
          fact,
          status: "unresolved" as const,
          applicability: "unclear" as const,
          value: "",
          explanation: "Not stated.",
          quotes: [],
          sourceUrl: null,
        }),
      ),
      {
        fact: "requirements",
        status: "resolved",
        applicability: "this_role",
        value: "Kotlin required",
        explanation: "The application page names the skill.",
        quotes: ["Kotlin required."],
        sourceUrl: url,
      },
      {
        fact: "deadline",
        status: "resolved",
        applicability: "this_role",
        value: "2026-12-01",
        explanation: "The application page states an absolute deadline.",
        quotes: ["Apply by 2026-12-01."],
        sourceUrl: url,
      },
    ],
  };
}

describe("model planning boundaries", () => {
  it("separates alternatives without adding professions or dropping confirmed public words", () => {
    const output = {
      kind: "strategy" as const,
      strategy: {
        targets: ["Android Software Engineer", "server-side Software Engineer"],
        explanation: "Search both kinds of engineering work.",
      },
    };
    expect(validReasoning(intent, output)).toBe(true);
    expect(
      validReasoning(intent, {
        ...output,
        strategy: {
          ...output.strategy,
          targets: ["Android Software Engineer"],
        },
      }),
    ).toBe(false);
    expect(
      validReasoning(intent, {
        ...output,
        strategy: {
          ...output.strategy,
          targets: ["Android Software Engineer", "Product designer"],
        },
      }),
    ).toBe(false);
    expect(
      validReasoning(intent, {
        ...output,
        strategy: {
          ...output.strategy,
          targets: [
            "Android Software Engineer user@example.org",
            "server-side Software Engineer",
          ],
        },
      }),
    ).toBe(false);
  });
  it("normalizes a redundant confirmed remote qualifier without admitting an invented preference", () => {
    const input: DiscoveryReasoningInput = {
      kind: "strategy",
      intent: {
        target: "Product designer",
        category: "employment",
        remote: true,
      },
    };
    const output = {
      kind: "strategy" as const,
      strategy: {
        targets: ["remote Product designer"],
        explanation: "Search the stated profession remotely.",
      },
    };
    const normalized = normalizeReasoning(input, output);
    expect(validReasoning(input, normalized)).toBe(true);
    expect(normalized).toMatchObject({
      strategy: { targets: ["Product designer"] },
    });
    const unconfirmed = {
      ...input,
      intent: { ...input.intent, remote: false },
    };
    expect(
      validReasoning(unconfirmed, normalizeReasoning(unconfirmed, output)),
    ).toBe(false);
  });

  it("accepts only a supplied action index, never arbitrary model destinations", () => {
    const input: DiscoveryReasoningInput = {
      kind: "choice",
      intent: intent.intent,
      choices: [
        {
          reason: "no_further_action",
          action: null,
          parentKey: null,
          depth: 0,
          title: null,
        },
      ],
      evidence: [],
    };
    expect(
      validReasoning(input, {
        kind: "choice",
        index: 0,
        explanation: "No useful next action.",
      }),
    ).toBe(true);
    expect(
      validReasoning(input, {
        kind: "choice",
        index: 1,
        explanation: "Invented next action.",
      }),
    ).toBe(false);
    expect(
      validReasoning(input, {
        kind: "choice",
        index: 0.5,
        explanation: "Invalid index.",
      }),
    ).toBe(false);
  });
  it("always includes a stop action and preserves document/search/depth ceilings", () => {
    const plan = {
      ...planDiscovery(search, 1, 0, undefined, true),
      policy: "public-intent-v3" as const,
      strategy: { targets: [search.target], explanation: "Confirmed target." },
    };
    const snapshot: DiscoveryExploration = {
      plan,
      round: 0,
      operations: [
        {
          key: "query",
          depth: 0,
          input: { kind: "search", query: plan.queries[0]! },
          result: {
            kind: "search",
            checkedAt: new Date().toISOString(),
            completeness: "window",
            nextPage: null,
            observations: [],
          },
        },
      ],
    };
    expect(explorationChoices(snapshot).some((choice) => !choice.action)).toBe(
      true,
    );
    expect(
      explorationChoices(snapshot).every(
        (choice) => choice.action?.kind !== "document",
      ),
    ).toBe(true);
    expect(explorationChoices({ ...snapshot, round: 4 })).toEqual([
      {
        reason: "exploration_limit",
        action: null,
        parentKey: null,
        depth: 0,
        title: null,
      },
    ]);
  });
  it("adds grounded application requirements while preserving known posting restrictions and explicit deadlines", () => {
    const evidence = linkedEvidence();
    expect(validResearch(evidence)).toBe(true);
    const original = {
      ...analysis,
      facts: {
        ...analysis.facts,
        requirements: { status: "unknown" as const, value: "", quotes: [] },
      },
    };
    expect(
      applyEmployerResearch(original, evidence).facts.requirements.value,
    ).toBe("Kotlin required");
    expect(
      applyEmployerResearch(analysis, evidence).facts.requirements,
    ).toEqual(analysis.facts.requirements);
    evidence.findings[3]!.status = "conflicting";
    expect(
      applyEmployerResearch(analysis, evidence).facts.requirements.status,
    ).toBe("conflicting");
    evidence.findings[4]!.applicability = "all_roles";
    expect(validResearch(evidence)).toBe(false);
    evidence.findings[4]!.applicability = "this_role";
    evidence.findings[4]!.value = "next month";
    expect(validResearch(evidence)).toBe(false);
  });
});
