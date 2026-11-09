import { describe, expect, it, vi } from "vitest";
import {
  EvaluateCandidates,
  ModelTokenBudgetDeferred,
} from "@repo/core/scouting";
import {
  PlanScoutSearch,
  ReviewDiscoveryLeads,
  planDiscovery,
} from "@repo/core/discovery";
import { posting, search } from "./fixtures/intelligence.js";

const request = {
  ownerId: "owner",
  scoutId: "scout",
  version: 1,
  runId: "run",
};
const retryAt = "2030-01-01T02:00:00.000Z";
/** Mirrors the native SDK cause chain without a network request or fake successful generation. */
function denied() {
  return new Error("Connection error", {
    cause: new ModelTokenBudgetDeferred(retryAt),
  });
}

describe("paced admission through application use cases", () => {
  it("passes candidate priority to the provider and defers an unsent extraction", async () => {
    const records = {
      plan: vi.fn().mockResolvedValue({ selected: [posting.id], results: [] }),
      claim: vi.fn().mockResolvedValue({
        status: "claimed",
        token: "lease",
        work: "discovery",
      }),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const provider = {
      configuration: "fixture",
      extract: vi.fn().mockRejectedValue(denied()),
      assess: vi.fn(),
    };
    expect(
      await new EvaluateCandidates(records, provider).evaluate(
        { request, search },
        [posting],
      ),
    ).toBe("progress");
    expect(provider.extract).toHaveBeenCalledWith(posting, "discovery", {
      scoutId: request.scoutId,
      version: request.version,
    });
    expect(records.fail).toHaveBeenCalledWith(
      "lease",
      "provider_unavailable",
      retryAt,
    );
    expect(records.complete).not.toHaveBeenCalled();
    expect(provider.assess).not.toHaveBeenCalled();
  });

  it("preserves an unreviewed source on token deferral instead of accepting or rejecting it", async () => {
    const inputs = [
      {
        id: "lead",
        url: posting.url,
        fingerprint: "v1",
        scope: "source" as const,
        text: posting.text,
        truncated: false,
        observedAt: "2026-11-02T00:00:00Z",
        documentFingerprint: "v1",
      },
    ];
    const records = {
      claim: vi.fn().mockResolvedValue({
        status: "claimed",
        token: "lease",
        inputs,
        work: "discovery",
      }),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const provider = {
      configuration: "fixture",
      review: vi.fn().mockRejectedValue(denied()),
    };
    expect(
      await new ReviewDiscoveryLeads(records, provider).execute(request),
    ).toBe("progress");
    expect(provider.review).toHaveBeenCalledWith(inputs, "discovery", {
      scoutId: request.scoutId,
      version: request.version,
    });
    expect(records.fail).toHaveBeenCalledWith(
      "lease",
      "provider_unavailable",
      retryAt,
    );
    expect(records.complete).not.toHaveBeenCalled();
  });

  it("defers planning and never treats a known unsent call as a terminal provider failure", async () => {
    const records = {
      claim: vi.fn().mockResolvedValue({ status: "claimed", token: "lease" }),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const provider = {
      configuration: "fixture",
      reason: vi.fn().mockRejectedValue(denied()),
    };
    const planner = new PlanScoutSearch(records, provider);
    expect(
      await planner.prepare(
        request,
        planDiscovery(search, 1, 4, undefined, true),
      ),
    ).toBe("progress");
    expect(records.fail).toHaveBeenCalledWith("lease", retryAt);
    expect(records.complete).not.toHaveBeenCalled();
  });
});
