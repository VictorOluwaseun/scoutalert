import { describe, expect, it } from "vitest";
import {
  explorationChoices,
  planDiscovery,
  planExploration,
  type DiscoveryExploration,
  type LeadReview,
  type SearchObservation,
} from "@repo/core/discovery";
import { search } from "./fixtures/intelligence.js";
import { demandReview } from "./fixtures/lead-review.js";

/** Provides synthetic public candidates after all four initial queries, without any providers. */
function snapshot(
  observations: SearchObservation[] = [],
): DiscoveryExploration {
  const plan = planDiscovery(
    { ...search, category: "services", target: "Website redesign" },
    1,
    6,
    undefined,
    true,
    { maximumDepth: 3, maximumRounds: 8, maximumSourcePages: 2 },
  );
  plan.policy = "public-intent-v3";
  plan.exploration!.candidatePolicy = "contextual-v1";
  return {
    plan,
    round: 0,
    operations: plan.queries.map((query, index) => ({
      key: `query-${index}`,
      depth: 0,
      input: { kind: "search", query },
      result: {
        kind: "search",
        checkedAt: new Date().toISOString(),
        observations: index === 0 ? observations : [],
      },
    })),
  };
}

/** Keeps buyer scope and topic identical so only the observed remote/availability hints vary. */
function buyer(id: string, hint: string): SearchObservation {
  return {
    url: `https://buyer.example.org/projects/${id}`,
    title: "Website redesign requested",
    snippet: `We need website redesign. Budget $3000, send proposals. ${hint}`,
    rank: 1,
  };
}

/** Adds a reviewed source with explicit unknown arrangement; it must never be confused with remote query wording. */
function unknownBuyer(state: DiscoveryExploration, id: string): void {
  const url = `https://buyer.example.org/projects/${id}`;
  const text = "We need website redesign. Budget $3000.";
  state.operations.push({
    key: id,
    depth: 0,
    input: { kind: "document", url },
    result: {
      kind: "document",
      url,
      checkedAt: new Date().toISOString(),
      status: "fetched",
      reason: null,
      text,
      fingerprint: id,
      posting: null,
      hostDelaySeconds: 0,
    },
  });
  const review: LeadReview = demandReview({
    id,
    url,
    text,
    fingerprint: id,
    scope: "source",
    truncated: false,
    observedAt: new Date().toISOString(),
  });
  review.label = "client_request";
  review.analysis.facts.arrangement = {
    status: "unknown",
    value: "",
    quotes: [],
  };
  state.reviews ??= [];
  state.reviews.push({ url, scope: "source", review });
}

describe("remote buyer discovery", () => {
  it("retains broad coverage and private boundaries alongside remote queries", () => {
    const state = snapshot();
    const queries = state.plan.queries;
    expect(queries).toHaveLength(4);
    expect(queries.filter((q) => q.query.includes('"remote"'))).toHaveLength(2);
    expect(queries[0]!.freshness).toBe("any");
    expect(queries[2]!.query).toContain("site:workana.com");
    expect(queries[3]!.query).toContain("request for proposal");
    expect(JSON.stringify(queries)).not.toMatch(/Nigeria|50000|5 years/);
    const onsite = planDiscovery(
      { ...search, category: "services", arrangement: "onsite" },
      1,
      6,
      undefined,
      true,
    );
    expect(onsite.queries.every((q) => !q.query.includes('"remote"'))).toBe(
      true,
    );
  });

  it("does not require an exact long skill-stack phrase in the remote searches", () => {
    const plan = planDiscovery(
      {
        ...search,
        category: "services",
        target: "React TypeScript web development",
      },
      1,
      6,
      undefined,
      true,
    );
    expect(plan.queries[0]!.query).toContain(
      "React TypeScript web development",
    );
    expect(plan.queries[0]!.query).not.toContain(
      '"React TypeScript web development"',
    );
  });

  it.each(["Remote collaboration", "Work from anywhere", "Work remotely"])(
    "prefers an observed %s buyer while retaining unknown briefs",
    (hint) => {
      const remote = buyer("remote", hint);
      const unknown = buyer("unknown", "");
      const closed = buyer("closed", "Remote. Awarded.");
      const state = snapshot([unknown, closed, remote]);
      expect(planExploration(state).action).toEqual({
        kind: "document",
        url: remote.url,
      });
      const docs = explorationChoices(state).flatMap((c) =>
        c.action?.kind === "document" ? [c.action.url] : [],
      );
      expect(docs[0]).toBe(remote.url);
      expect(docs).toContain(unknown.url);
      state.plan.exploration!.queryPolicy = "client-demand-v7";
      expect(planExploration(state).action).toEqual({
        kind: "document",
        url: unknown.url,
      });
    },
  );

  it("does not boost negated remote or seller wording", () => {
    const unknown = buyer("unknown", "");
    const state = snapshot([
      buyer("onsite", "Not remote. On-site only."),
      {
        url: "https://buyers.example.org/projects/accounting",
        title: "Remote accountant needed",
        snippet:
          "We need accounting services. Budget $3000, send proposals. Remote.",
        rank: 1,
      },
      {
        ...buyer("seller", "Remote website redesign"),
        title: "My services: remote website redesign",
      },
      {
        ...buyer("available", "Remote website redesign"),
        title: "I'm open to freelance website redesign projects",
      },
      unknown,
    ]);
    expect(planExploration(state).action).toEqual({
      kind: "document",
      url: unknown.url,
    });
  });

  it("follows a relevant buyer anchor before another remote marketplace directory without inheriting parent remote claims", () => {
    const directoryUrl =
      "https://www.peopleperhour.com/freelance-jobs/design/web-design";
    const childUrl =
      "https://www.peopleperhour.com/freelance-jobs/design/web-design/redesign-4527472";
    const state = snapshot([
      {
        ...buyer(
          "collection",
          "Remote projects only. Website redesign projects.",
        ),
        title: "Website redesign projects",
        url: directoryUrl,
      },
    ]);
    state.operations.push({
      key: "captured-directory",
      depth: 0,
      input: {
        kind: "document",
        url: "https://www.peopleperhour.com/freelance-jobs/design",
      },
      result: {
        kind: "document",
        url: "https://www.peopleperhour.com/freelance-jobs/design",
        checkedAt: new Date().toISOString(),
        status: "fetched",
        reason: null,
        text: "Remote projects. Website redesign",
        fingerprint: "directory",
        posting: null,
        hostDelaySeconds: 0,
        links: [{ url: childUrl, text: "Redesign of FM services website" }],
      },
    });
    expect(planExploration(state)).toMatchObject({
      reason: "follow_source_link",
      action: { kind: "document", url: childUrl },
    });
    expect(explorationChoices(state)[0]?.action).toEqual({
      kind: "document",
      url: childUrl,
    });
  });

  it("changes query after two unknown buyer reviews, resets after search and respects remaining budgets", () => {
    const remaining = buyer("unread", "");
    const state = snapshot([remaining]);
    unknownBuyer(state, "one");
    expect(planExploration(state).action?.kind).toBe("document");
    unknownBuyer(state, "two");
    const choices = explorationChoices(state);
    expect(choices).toHaveLength(1);
    const action = choices[0]!.action;
    expect(action).toMatchObject({
      kind: "search",
      query: { query: expect.stringContaining('"remote"') },
    });
    if (action?.kind !== "search") {
      throw new Error("missing_remote_recovery");
    }
    state.operations.push({
      key: "recovery",
      input: action,
      depth: 0,
      result: {
        kind: "search",
        observations: [],
        checkedAt: new Date().toISOString(),
      },
    });
    expect(planExploration(state).action).toEqual({
      kind: "document",
      url: remaining.url,
    });
    state.operations.pop();
    state.plan.exploration!.maximumSearches = 4;
    expect(planExploration(state).action?.kind).toBe("document");
    state.plan.maximumDocuments = 2;
    expect(explorationChoices(state).every((c) => !c.action)).toBe(true);
  });

  it("does not recover from excerpt-only guesses, confirmed remote, or frozen older plans", () => {
    const state = snapshot([buyer("unread", "")]);
    unknownBuyer(state, "one");
    unknownBuyer(state, "two");
    state.reviews![1]!.scope = "search_excerpt";
    expect(planExploration(state).action?.kind).toBe("document");
    state.reviews![1]!.scope = "source";
    state.reviews![1]!.review.analysis.facts.arrangement = {
      status: "stated",
      value: "Remote",
      quotes: ["Remote"],
    };
    expect(planExploration(state).action?.kind).toBe("document");
    state.reviews![1]!.review.analysis.facts.arrangement = {
      status: "unknown",
      value: "",
      quotes: [],
    };
    state.plan.exploration!.queryPolicy = "client-demand-v7";
    expect(planExploration(state).action?.kind).toBe("document");
  });

  it("keeps the deterministic buyer-link fallback in a crowded semantic shortlist", () => {
    const observations = Array.from({ length: 12 }, (_, index) => ({
      url: `https://buyer${index}.example.org/projects/site`,
      title: "Website requested",
      snippet: "We need a website. Budget $3000, send proposals.",
      rank: index + 1,
    }));
    const state = snapshot();
    state.operations = Array.from({ length: 6 }, (_, index) => ({
      key: `search-${index}`,
      depth: 0,
      input: {
        kind: "search",
        query: {
          ...state.plan.queries[0]!,
          query: `Website redesign buyer query ${index}`,
        },
      },
      result: {
        kind: "search",
        checkedAt: new Date().toISOString(),
        observations: observations.slice(index * 2, index * 2 + 2),
      },
    }));
    const url = "https://buyer.example.org/projects/redesign";
    state.operations.push({
      key: "directory",
      depth: 0,
      input: { kind: "document", url: "https://buyer.example.org/projects" },
      result: {
        kind: "document",
        url: "https://buyer.example.org/projects",
        checkedAt: new Date().toISOString(),
        status: "fetched",
        reason: null,
        text: "Buyer projects",
        fingerprint: "directory",
        posting: null,
        hostDelaySeconds: 0,
        links: [{ url, text: "Website redesign request" }],
      },
    });
    const fallback = planExploration(state);
    expect(fallback.action).toEqual({ kind: "document", url });
    const choices = explorationChoices(state);
    expect(choices).toContainEqual(fallback);
    expect(
      choices.filter((choice) => choice.action?.kind === "document").length,
    ).toBeLessThanOrEqual(10);
  });
});
