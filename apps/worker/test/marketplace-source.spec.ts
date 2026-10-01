import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FreelancerSourceConnector,
  FreelancerAvailabilitySource,
  normalizeFreelancerProject,
  SourceConnectorRouter,
} from "@repo/adapters/scouting";
import { hasUnavailablePosting } from "@repo/core/notifications";
import {
  assessPosting,
  rankWithFeedback,
  prioritizeWithFeedback,
  type OpportunityView,
} from "@repo/core/scouting";
import { search, posting } from "./fixtures/intelligence.js";

const project = {
  id: 123,
  title: "Remote website design service",
  description: "Design a website for our remote team.",
  seo_url: "website-design/Remote-website-design-service",
  type: "fixed",
  status: "active",
  frontend_project_status: "open",
  deleted: false,
  nonpublic: false,
  local: false,
  hireme: false,
  time_updated: 1790812800,
  currency: { code: "USD" },
  budget: { minimum: 500, maximum: 1500 },
  jobs: [{ name: "Website Design" }],
};

/** Supplies a deterministic public feed with one page per payment type. */
function feed(url: URL) {
  const type = url.searchParams.get("project_types[]");
  const projects =
    url.searchParams.get("offset") === "100"
      ? []
      : [{ ...project, type, id: type === "fixed" ? 123 : 456 }];
  return Response.json({
    status: "success",
    result: { projects, total_count: 1 },
  });
}

describe("public client projects and service requests", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shares bounded fixed/hourly feeds without calling a rolling window a complete snapshot", async () => {
    const fetch = vi.fn(async (url: URL) => feed(url));
    vi.stubGlobal("fetch", fetch);
    const snapshot = await new FreelancerSourceConnector().read(
      "freelancer",
      new Date(),
    );
    expect(snapshot).toMatchObject({ scope: "window", kind: "client_request" });
    expect(snapshot.postings).toHaveLength(2);
    expect(snapshot.postings[0]?.text).toContain("USD per project");
    expect(snapshot.postings[1]?.text).toContain("USD per hour");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(snapshot.postings[0]?.location).toContain("not confirmed");
  });
  it("rejects unknown sources, malformed budgets, unsafe paths and partial malformed pages", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        status: "success",
        result: {
          projects: [project, { ...project, id: 124, description: null }],
          total_count: 2,
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      new FreelancerSourceConnector().read("__proto__", new Date()),
    ).rejects.toThrow("unsupported_source");
    await expect(
      new SourceConnectorRouter({
        freelancer: new FreelancerSourceConnector(),
      }).read("__proto__", new Date()),
    ).rejects.toThrow("unsupported_source");
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      new FreelancerSourceConnector().read("freelancer", new Date()),
    ).rejects.toThrow();
    expect(() =>
      normalizeFreelancerProject({ ...project, seo_url: "../secret" }),
    ).toThrow();
    expect(() =>
      normalizeFreelancerProject({
        ...project,
        budget: { minimum: 800, maximum: 500 },
      }),
    ).toThrow();
    expect(() =>
      normalizeFreelancerProject({ ...project, nonpublic: true }),
    ).toThrow();
  });
  it("keeps IDs stable across pay-type changes and versions only meaningful evidence", () => {
    const fixed = normalizeFreelancerProject(project);
    const hourly = normalizeFreelancerProject({ ...project, type: "hourly" });
    expect(hourly.id).toBe(fixed.id);
    expect(
      normalizeFreelancerProject({
        ...project,
        time_updated: null,
        submitdate: project.time_updated,
      }).fingerprint,
    ).toBe(fixed.fingerprint);
    expect(hourly.fingerprint).not.toBe(fixed.fingerprint);
    expect(
      normalizeFreelancerProject({
        ...project,
        time_updated: project.time_updated + 1,
      }).fingerprint,
    ).toBe(fixed.fingerprint);
  });
  it("checks identity, content changes, closure and unavailable responses independently", async () => {
    const normalized = normalizeFreelancerProject(project);
    const source = new FreelancerAvailabilitySource();
    for (const [value, expected] of [
      [project, "available"],
      [{ ...project, title: "Changed title" }, "changed"],
      [{ ...project, status: "closed" }, "closed"],
      [{ ...project, id: 555 }, "unresolved"],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ status: "success", result: value })),
      );
      expect((await source.check(normalized)).status).toBe(expected);
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );
    expect((await source.check(normalized)).status).toBe("unresolved");
  });
  it("requires fresh positive availability for every client-request email", () => {
    const now = new Date();
    const opportunity: OpportunityView = {
      ...normalizeFreelancerProject(project),
      checkedAt: now.toISOString(),
      scouts: [],
      reasons: [],
      uncertainties: [],
    };
    expect(hasUnavailablePosting(opportunity, now)).toBe(true);
    const available = {
      ...opportunity,
      availability: {
        status: "available" as const,
        checkedAt: now.toISOString(),
        fingerprint: "fingerprint",
        sourceUrl: opportunity.url,
      },
    };
    expect(hasUnavailablePosting(available, now)).toBe(false);
    expect(
      hasUnavailablePosting(available, new Date(now.getTime() + 15 * 60_000)),
    ).toBe(true);
    expect(
      hasUnavailablePosting(
        {
          ...available,
          availability: { ...available.availability, status: "unresolved" },
        },
        now,
      ),
    ).toBe(true);
  });
  it("matches requested services while keeping ordinary jobs outside client scouts", () => {
    const draft = {
      ...search,
      category: "services" as const,
      target: "website design",
      arrangementRequired: false,
    };
    expect(
      assessPosting(draft, normalizeFreelancerProject(project)),
    ).not.toBeNull();
    expect(assessPosting(draft, posting)).toBeNull();
    expect(
      assessPosting(search, normalizeFreelancerProject(project)),
    ).toBeNull();
    expect(
      assessPosting(
        { ...draft, unknownEligibility: "exclude" },
        normalizeFreelancerProject(project),
      ),
    ).toBeNull();
  });
});

describe("bounded explicit relevance learning", () => {
  const example = { title: "Product designer", kind: "job" as const };
  it("boosts similar work by one point without amplifying repeated positives or crossing categories", () => {
    const assessment = assessPosting(search, posting)!;
    const learned = rankWithFeedback(
      posting,
      assessment,
      Array(100).fill(example),
    );
    expect(learned.rank).toBe(assessment.rank + 1);
    expect(learned.reasons).toEqual(assessment.reasons);
    expect(learned.uncertainties).toEqual(assessment.uncertainties);
    expect(
      rankWithFeedback({ ...posting, kind: "client_request" }, assessment, [
        example,
      ]).rank,
    ).toBe(assessment.rank);
    expect(rankWithFeedback(posting, assessment, []).rank).toBe(
      assessment.rank,
    );
    expect(
      rankWithFeedback(posting, assessment, [
        { title: "Product manager", kind: "job" },
      ]).rank,
    ).toBe(assessment.rank);
  });
  it("prioritises related retrieved candidates and retains neutral baseline order", () => {
    const unrelated = { ...posting, id: "another", title: "Software engineer" };
    expect(
      prioritizeWithFeedback([unrelated, posting], [example]).map(
        (item) => item.id,
      ),
    ).toEqual([posting.id, unrelated.id]);
    expect(prioritizeWithFeedback([unrelated, posting], [])).toEqual([
      unrelated,
      posting,
    ]);
  });
});
