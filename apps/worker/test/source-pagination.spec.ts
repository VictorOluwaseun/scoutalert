import { describe, expect, it } from "vitest";
import { documentPagination } from "@repo/adapters/discovery";
import {
  planDiscovery,
  planExploration,
  type DiscoveryExploration,
  type SourceDocumentResult,
} from "@repo/core/discovery";
import type { SearchDraft } from "@repo/core/onboarding";
const origin = "https://projects.example.com";

/** Models the frozen worker plan while leaving spending ceilings unchanged. */
function state(): DiscoveryExploration {
  return {
    round: 0,
    operations: [],
    plan: planDiscovery(
      {
        target: "Product designer",
        category: "services",
        arrangement: "remote",
      } as SearchDraft,
      1,
      4,
      undefined,
      true,
      { maximumDepth: 4, maximumRounds: 8, maximumSourcePages: 3 },
    ),
  };
}

/** Records actual page identities, signatures and observed links for routing tests. */
function record(
  snapshot: DiscoveryExploration,
  page: number,
  signature: string,
  links: { url: string; text: string }[] = [],
): void {
  const url = `${origin}/search?page=${page}`;
  const result: SourceDocumentResult = {
    kind: "document",
    url,
    status: "fetched",
    checkedAt: new Date().toISOString(),
    reason: null,
    posting: null,
    fingerprint: `page-${page}`,
    text: "Project requests",
    hostDelaySeconds: 2,
    links,
    pagination: {
      next: [`${origin}/search?page=${page + 1}`],
      contentFingerprint: signature,
    },
  };
  snapshot.operations.push({
    key: url,
    depth: page - 1,
    input: { kind: "document", url },
    result,
  });
}

describe("deeper observed source navigation", () => {
  it("reads pagination from nav and head metadata while refusing hidden, foreign, previous and invented destinations", () => {
    const html =
      '<head><link rel="next" href="?page=2"></head><nav><a href="?page=2" aria-label="Next page">Next</a><a href="?page=0">Previous</a><a hidden rel="next" href="/hidden">Next</a><a style="display:none" rel="next" href="/hidden-css">Next</a><a rel="next" href="https://other.example.com/">Next</a></nav>';
    expect(documentPagination(html, `${origin}/search?page=1`)).toEqual([
      `${origin}/search?page=2`,
    ]);
  });
  it("reaches matching demand beyond a first page without inventing a search or relaxing the user's requirements", () => {
    const snapshot = state();
    record(snapshot, 1, "unrelated-first-page");
    expect(planExploration(snapshot)).toMatchObject({
      reason: "continue_source_page",
      depth: 1,
      action: { url: `${origin}/search?page=2` },
    });
    record(snapshot, 2, "different-second-page", [
      { url: `${origin}/projects/42`, text: "Product designer needed" },
    ]);
    expect(planExploration(snapshot)).toMatchObject({
      reason: "follow_source_link",
      depth: 2,
      action: { url: `${origin}/projects/42` },
    });
  });
  it("stops repeated result content even when the source keeps changing page URLs", () => {
    const snapshot = state();
    record(snapshot, 1, "same-items");
    record(snapshot, 2, "same-items");
    expect(planExploration(snapshot).action).toBeNull();
  });
  it("bounds page counts, depth, rounds and document admissions independently", () => {
    const snapshot = state();
    record(snapshot, 1, "one");
    record(snapshot, 2, "two");
    record(snapshot, 3, "three");
    expect(planExploration(snapshot).action).toBeNull();
    snapshot.operations.pop();
    snapshot.plan.maximumDocuments = 2;
    expect(planExploration(snapshot).action).toBeNull();
    snapshot.plan.maximumDocuments = 4;
    snapshot.plan.exploration!.maximumDepth = 1;
    expect(planExploration(snapshot).action).toBeNull();
    snapshot.plan.exploration!.maximumDepth = 4;
    snapshot.round = 8;
    expect(planExploration(snapshot).reason).toBe("exploration_limit");
  });
  it("treats query-order aliases and backward links as already visited", () => {
    const snapshot = state();
    record(snapshot, 1, "one");
    const operation = snapshot.operations[0]!;
    operation.input = {
      kind: "document",
      url: `${origin}/search?sort=new&page=1`,
    };
    if (operation.result?.kind === "document") {
      operation.result.pagination!.next = [
        `${origin}/search?page=1&sort=new#top`,
      ];
    }
    expect(planExploration(snapshot).action).toBeNull();
  });
});
