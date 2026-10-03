import type { SearchDraft } from "../../onboarding/domain/search-draft.js";
import type { DiscoveryPlan, SearchCapability } from "../domain/contracts.js";

/** Freezes public intent; adaptive cases reserve part of their document budget for evidence-led follow-ups. */
export function planDiscovery(
  search: SearchDraft,
  version: number,
  maximumDocuments: number,
  capability?: SearchCapability,
  adaptive = false,
): DiscoveryPlan {
  const target = search.target.trim().replace(/\s+/gu, " ");
  const publicTarget = target.replace(/[^\p{L}\p{N} +#.-]/gu, " ").trim();
  const blocked =
    !/[\p{L}\p{N}]/u.test(publicTarget) ||
    target.length > 160 ||
    /[@/:]|\d{6,}|[\r\n]/u.test(search.target);
  const arrangement = search.arrangement === "remote" ? " remote" : "";
  const demand = search.category === "services" ? '"looking for"' : "hiring";
  const intent =
    search.category === "employment" ? "jobs" : "freelance projects";
  const queries = [
    `${publicTarget}${arrangement} ${intent}`,
    `${publicTarget}${arrangement} ${demand}`,
    `site:x.com ${publicTarget} ${demand}`,
    `site:linkedin.com/posts ${publicTarget} ${demand}`,
  ];

  return {
    policy: adaptive ? "public-intent-v2" : "public-intent-v1",
    scoutVersion: version,
    category: search.category,
    queries: blocked
      ? []
      : queries.map((query) => ({
          query,
          language: capability?.language ?? "en",
          country: capability?.country ?? null,
          freshness: "month",
          page: 1,
          limit: 10,
        })),
    maximumDocuments,
    deadlineSeconds: 240,
    continuation: "explore_on_next_run",
    blockedReason: blocked ? "public_intent_required" : null,
    ...(adaptive
      ? {
          exploration: {
            target: publicTarget,
            remote: search.arrangement === "remote",
            maximumRounds: 4,
            maximumSearches: 6,
            maximumDepth: 2,
          },
        }
      : {}),
  };
}
