import { describe, it, expect } from "vitest";
import {
  validReasoning,
  normalizeReasoning,
  PlanScoutSearch,
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
  it("returns an admitted fallback when duplicate search observations disagree on title and parent", async () => {
    const plan = planDiscovery(
      { ...search, category: "services", target: "Website redesign" },
      1,
      6,
      undefined,
      true,
    );
    plan.policy = "public-intent-v3";
    plan.exploration!.candidatePolicy = "contextual-v1";
    const snapshot: DiscoveryExploration = {
      plan,
      round: 0,
      operations: ["first", "later"].map((key, index) => ({
        key,
        depth: 0,
        input: { kind: "search", query: plan.queries[index]! },
        result: {
          kind: "search",
          checkedAt: new Date().toISOString(),
          completeness: "window",
          nextPage: null,
          observations: [
            {
              url: "https://buyer.example.org/projects/site",
              title: index ? "Website project" : "Website redesign RFP",
              snippet: index
                ? "We need a website"
                : "We need a website redesign, budget $5000, open proposals.",
              rank: 1,
            },
          ],
        },
      })),
    };
    const planner = new PlanScoutSearch(
      {
        /** Failed model work remains unavailable without another provider attempt. */
        async claim() {
          return { status: "unavailable" as const };
        },
        /** No new work is completed on this cached failure. */
        async complete() {},
        /** No new attempt is failed on this cached failure. */
        async fail() {},
      },
      {
        configuration: "unavailable",
        /** The fallback must not call the model. */ async reason(): Promise<never> {
          throw new Error("unexpected call");
        },
      },
    );
    const decision = await planner.next(
      { ownerId: "owner", scoutId: "scout", runId: "run", version: 1 },
      snapshot,
    );
    expect(explorationChoices(snapshot)).toContainEqual(decision);
    expect(decision).toMatchObject({
      action: {
        kind: "document",
        url: "https://buyer.example.org/projects/site",
      },
      parentKey: "later",
    });
  });
  it("prepares remote and broad buyer queries without exposing private constraints", async () => {
    const brief = {
      ...search,
      category: "services" as const,
      target: "React TypeScript web development",
      residence: "Private residence",
      background: "Private employer",
    };
    const plan = planDiscovery(brief, 1, 6, undefined, true);
    const planner = new PlanScoutSearch(
      {
        /** Models a cached public strategy; the application still checks allowed vocabulary. */
        async claim() {
          return {
            status: "ready",
            output: {
              kind: "strategy",
              strategy: {
                targets: [
                  "React development",
                  "TypeScript development",
                  "web development",
                ],
                explanation:
                  "Search the supplied skills through several buyer demand patterns.",
              },
            },
          };
        },
        /** Cached strategies must not complete new paid work. */
        async complete() {
          throw new Error("unexpected_complete");
        },
        /** Cached strategies must not create failed attempts. */
        async fail() {
          throw new Error("unexpected_fail");
        },
      },
      {
        configuration: "fixture",
        /** A cached strategy consumes no provider request. */
        async reason(): Promise<never> {
          throw new Error("unexpected_provider");
        },
      },
    );
    const result = await planner.prepare(
      { ownerId: "private", scoutId: "scout", runId: "run", version: 1 },
      plan,
    );
    expect(typeof result).toBe("object");
    if (typeof result === "string") {
      throw new Error("missing_plan");
    }
    const text = JSON.stringify(result.queries);
    expect(result.queries).toHaveLength(4);
    expect(text).toContain("request for proposal");
    expect(text).toContain("site:peopleperhour.com/freelance-jobs");
    expect(text).toContain("site:workana.com");
    expect(result.queries[0]!.query).toContain('"React development"');
    expect(text).not.toMatch(/Private/);
    expect(
      result.queries.filter((query) => query.query.includes('"remote"')),
    ).toHaveLength(2);
    expect(result.exploration?.queryPolicy).toBe("client-demand-v8");
    expect(
      result.queries.find((query) => query.query.includes("site:workana.com"))
        ?.freshness,
    ).toBe("any");
    expect(
      result.queries
        .filter(
          (query) => !/site:(?:workana|peopleperhour)\.com/u.test(query.query),
        )
        .every((query) => query.freshness === "month"),
    ).toBe(true);
    expect(result.strategy?.targets).toEqual([
      "React development",
      "TypeScript development",
      "web development",
    ]);
    expect(brief.arrangement).toBe(search.arrangement);
  });

  it.each([
    "client-demand-v1",
    "client-demand-v2",
    "client-demand-v3",
  ] as const)(
    "keeps the frozen %s query portfolio when resuming an older case",
    (policy) => {
      const plan = planDiscovery(
        { ...search, category: "services", target: "Website redesign" },
        1,
        2,
        undefined,
        true,
      );
      plan.policy = "public-intent-v3";
      plan.exploration!.queryPolicy = policy;
      const choices = explorationChoices({
        plan,
        round: 0,
        operations: [
          {
            key: "previous",
            depth: 0,
            input: { kind: "search", query: plan.queries[0]! },
            result: {
              kind: "search",
              observations: [],
              checkedAt: new Date().toISOString(),
            },
          },
        ],
      });
      const queries = choices.flatMap((choice) =>
        choice.action?.kind === "search" ? [choice.action.query.query] : [],
      );
      expect(queries).toContain(
        policy === "client-demand-v1"
          ? 'Website redesign ("project" OR "brief") ("budget" OR "fixed price")'
          : '"Website" "redesign" ("project details" OR "project description" OR "open for bidding")',
      );
      expect(queries.some((query) => query.includes("inurl:projects"))).toBe(
        policy === "client-demand-v3",
      );
      expect(
        queries.some((query) => query.includes("site:peopleperhour.com")),
      ).toBe(false);
    },
  );

  it("retains unused social searches as bounded alternatives without repeating the initial buyer queries", () => {
    const plan = planDiscovery(
      { ...search, category: "services", target: "Website redesign" },
      1,
      1,
      undefined,
      true,
    );
    plan.policy = "public-intent-v3";
    const snapshot: DiscoveryExploration = {
      plan,
      round: 0,
      operations: plan.queries.map((query, index) => ({
        key: `query-${index}`,
        depth: 0,
        input: { kind: "search", query },
        result: {
          kind: "search",
          observations: [],
          checkedAt: new Date().toISOString(),
          completeness: "window",
          nextPage: null,
        },
      })),
    };
    const next = explorationChoices(snapshot).flatMap((choice) =>
      choice.action?.kind === "search" ? [choice.action.query.query] : [],
    );
    expect(next.some((query) => query.includes("site:x.com"))).toBe(true);
    expect(
      next.some((query) => query.includes("site:linkedin.com/posts")),
    ).toBe(true);
    expect(
      next.every(
        (query) => !plan.queries.some((initial) => initial.query === query),
      ),
    ).toBe(true);
    plan.exploration!.maximumSearches = 4;
    expect(explorationChoices(snapshot).every((choice) => !choice.action)).toBe(
      true,
    );
  });

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
