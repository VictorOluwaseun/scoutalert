import { blocksSourceHost } from "../domain/source-access.js";
import { sourceNextPages } from "./source-pagination.js";
import { sourceSearchUrls } from "./source-search.js";
import { publicDestination } from "../domain/public-destination.js";
import { contextualDocumentChoices } from "./contextual-candidates.js";
import { discoveryNavigation } from "./discovery-navigation.js";
import {
  clientRequestQueries,
  clientRequestFreshness,
  clientRequestNeedsSearch,
  clientRequestPriority,
  clientRequestRouteCoolingDown,
  usesClientRequestQueries,
} from "./client-request-search.js";
import type {
  DiscoveryDecision,
  DiscoveryExploration,
  SearchObservation,
  WebSearchQuery,
} from "../domain/contracts.js";

type Candidate = {
  url: string;
  title: string | null;
  parentKey: string;
  depth: number;
  score: number;
  reason: DiscoveryDecision["reason"];
};
const noise =
  /\b(?:salary guide|career advice|how to|resume tips|i offer|my services|hire me|privacy|log in|sign in|register|subscribe)\b/iu;
const demand =
  /\b(?:hiring|looking for|seeking|apply|opening|vacancy|needed|request|project brief)\b/iu;
const listingPath =
  /\/(?:jobs?|positions?|openings?|careers?|projects?|requests?|opportunities)\/[^/?#]+/iu;

/** Tokenizes only the frozen public target; private requirements never become search-provider input. */
function targetWords(target: string): string[] {
  return [
    ...new Set(target.toLocaleLowerCase("en").match(/[\p{L}\p{N}+#]+/gu) ?? []),
  ].filter(
    (word) =>
      !["a", "an", "the", "and", "or", "for", "of", "in", "with"].includes(
        word,
      ),
  );
}

/** Scores routing hints, never eligibility or publication; label/path specificity beats generic directories. */
function relevance(text: string, url: string, words: string[]): number {
  const normalized = text.toLocaleLowerCase("en");
  const matched = words.filter((word) => normalized.includes(word)).length;
  if (!matched || noise.test(text)) {
    return 0;
  }
  return (
    matched * 3 + (demand.test(text) ? 4 : 0) + (listingPath.test(url) ? 4 : 0)
  );
}

/** Allows an observed application anchor on a relevant listing; it still requires a fresh permitted source read. */
function linkRelevance(
  text: string,
  url: string,
  parentUrl: string,
  parentText: string,
  words: string[],
): number {
  const score = relevance(text, url, words);
  if (score > 0) {
    return score + 10;
  }
  const application =
    /^(?:apply(?: now| here| for (?:this|the) (?:role|job|position))?|submit (?:your |an )?application)$/iu.test(
      text.trim(),
    );
  return application &&
    listingPath.test(parentUrl) &&
    relevance(parentText, parentUrl, words) >= 7
    ? 12
    : 0;
}

/** Selects observed, relevant anchors and unvisited results; loops and excessive investigation depth are excluded. */
function documentCandidates(
  snapshot: DiscoveryExploration,
  words: string[],
): Candidate[] {
  const seen = new Set(
    snapshot.operations.flatMap(({ input, result }) =>
      input.kind === "document"
        ? [
            input.url,
            ...(result?.kind === "document" && result.retrievedUrl
              ? [result.retrievedUrl]
              : []),
          ]
        : [],
    ),
  );
  const candidates: Candidate[] = [];
  const inaccessibleHosts = new Set(
    snapshot.operations.flatMap(({ result }) =>
      result?.kind === "document" &&
      blocksSourceHost(result) &&
      publicDestination(result.url)
        ? [new URL(result.url).hostname]
        : [],
    ),
  );
  for (const operation of snapshot.operations) {
    const result = operation.result;
    if (result?.kind === "search") {
      for (const item of result.observations) {
        candidates.push({
          url: item.url,
          title: item.title,
          parentKey: operation.key,
          depth: 0,
          reason: "check_promising_result",
          score:
            relevance(
              `${item.title ?? ""} ${item.snippet ?? ""}`,
              item.url,
              words,
            ) +
            (usesClientRequestQueries(snapshot.plan)
              ? clientRequestPriority(
                  item.url,
                  item.title ?? "",
                  item.snippet ?? "",
                  snapshot.plan.exploration!.target,
                ) * 5
              : 0),
        });
      }
    }
    if (
      result?.kind === "document" &&
      operation.depth < snapshot.plan.exploration!.maximumDepth
    ) {
      candidates.push(
        ...(result.sitemaps ?? []).map((sitemap) => ({
          url: sitemap.url,
          title: sitemap.text,
          parentKey: operation.key,
          depth: operation.depth + 1,
          reason: "follow_source_link" as const,
          score: 9,
        })),
      );
    }
    if (
      result?.kind === "document" &&
      snapshot.reviews?.some(
        ({ url, review }) =>
          url === result.url &&
          ["closed", "service_offer", "discussion"].includes(review.label),
      )
    ) {
      continue;
    }
    if (
      result?.kind === "document" &&
      result.status === "fetched" &&
      operation.depth < snapshot.plan.exploration!.maximumDepth
    ) {
      for (const url of sourceNextPages(result, snapshot)) {
        candidates.push({
          url,
          title: "Next source results page",
          parentKey: operation.key,
          depth: operation.depth + 1,
          reason: "continue_source_page",
          score: 8,
        });
      }
      for (const url of sourceSearchUrls(
        result,
        snapshot.plan.exploration!.target,
      )) {
        candidates.push({
          url,
          title: "Search this source",
          parentKey: operation.key,
          depth: operation.depth + 1,
          reason: "search_source_site",
          score: 16,
        });
      }
      for (const feed of result.feeds ?? []) {
        candidates.push({
          url: feed.url,
          title: feed.text,
          parentKey: operation.key,
          depth: operation.depth + 1,
          reason: "follow_source_link",
          score: 9,
        });
      }
      for (const link of result.links ?? []) {
        candidates.push({
          url: link.url,
          title: link.text || null,
          parentKey: operation.key,
          depth: operation.depth + 1,
          reason: "follow_source_link",
          score:
            result.sitemap?.format === "index"
              ? 9
              : snapshot.plan.policy === "public-intent-v3" &&
                  /\b(?:apply|application|eligibility|sponsorship|requirements|careers|hiring policy)\b/iu.test(
                    link.text,
                  ) &&
                  snapshot.reviews?.some(
                    ({ url, scope, review }) =>
                      url === result.url &&
                      scope === "source" &&
                      ["job_opening", "client_request"].includes(review.label),
                  )
                ? 30
                : linkRelevance(
                    link.text,
                    link.url,
                    result.url,
                    result.text ?? "",
                    words,
                  ),
        });
      }
    }
  }
  const rejected = new Set(
    (snapshot.reviews ?? [])
      .filter(({ review }) =>
        ["closed", "service_offer", "discussion"].includes(review.label),
      )
      .map(({ url }) => url),
  );
  return candidates
    .filter(
      (candidate) =>
        !seen.has(candidate.url) &&
        !discoveryNavigation(candidate.url, candidate.title) &&
        !rejected.has(candidate.url) &&
        publicDestination(candidate.url) &&
        !inaccessibleHosts.has(new URL(candidate.url).hostname) &&
        !clientRequestRouteCoolingDown(snapshot, candidate.url) &&
        candidate.score >= 7,
    )
    .sort((a, b) => b.score - a.score);
}

/** Treats search snippets as routing hints only; a later cited source review must establish any facts. */
function promising(item: SearchObservation, words: string[]): boolean {
  return (
    relevance(`${item.title ?? ""} ${item.snippet ?? ""}`, item.url, words) >= 7
  );
}

/** Plans a next page only when it contains new promising leads, preventing repeated-result pagination loops. */
function nextPage(
  snapshot: DiscoveryExploration,
  words: string[],
): DiscoveryDecision | null {
  const seen = new Set<string>();
  for (const operation of snapshot.operations) {
    const { input, result } = operation;
    if (input.kind !== "search" || result?.kind !== "search") {
      continue;
    }
    const fresh = new Set(
      result.observations
        .filter((item) => !seen.has(item.url) && promising(item, words))
        .map((item) => item.url),
    );
    for (const item of result.observations) {
      seen.add(item.url);
    }
    const alreadyQueued = snapshot.operations.some(
      (entry) =>
        entry.input.kind === "search" &&
        entry.input.query.query === input.query.query &&
        entry.input.query.page === result.nextPage,
    );
    if (
      fresh.size < 2 ||
      result.nextPage !== input.query.page + 1 ||
      result.nextPage > 2 ||
      alreadyQueued
    ) {
      continue;
    }
    return {
      reason: "continue_result_page",
      action: {
        kind: "search",
        query: { ...input.query, page: result.nextPage },
      },
      parentKey: operation.key,
      depth: 0,
      title: null,
    };
  }
  return null;
}

/** Uses results to choose a source investigation, useful next page, or revised demand query within frozen limits. */
export function planExploration(
  snapshot: DiscoveryExploration,
): DiscoveryDecision {
  const stop: DiscoveryDecision = {
    reason: "no_further_action",
    action: null,
    parentKey: null,
    depth: 0,
    title: null,
  };
  const settings = snapshot.plan.exploration;
  if (!settings || snapshot.plan.blockedReason) {
    return stop;
  }
  if (snapshot.round >= settings.maximumRounds) {
    return { ...stop, reason: "exploration_limit" };
  }
  const words = targetWords(settings.target);
  const documents = snapshot.operations.filter(
    ({ input }) => input.kind === "document",
  );
  const candidate = documentCandidates(snapshot, words)[0];
  if (
    usesClientRequestQueries(snapshot.plan) &&
    documents.length >= snapshot.plan.maximumDocuments
  ) {
    return { ...stop, reason: "exploration_limit" };
  }
  const recovery = clientRequestNeedsSearch(snapshot)
    ? alternativeSearchChoices(snapshot)
    : [];
  const recoveryQuery = [
    "client-demand-v4",
    "client-demand-v5",
    "client-demand-v6",
    "client-demand-v7",
  ].includes(settings.queryPolicy ?? "")
    ? recovery[0]
    : (recovery.find(
        (choice) =>
          choice.action?.kind === "search" &&
          choice.action.query.query.includes("inurl:projects"),
      ) ?? recovery[0]);
  if (recoveryQuery) {
    return recoveryQuery;
  }
  if (candidate && documents.length < snapshot.plan.maximumDocuments) {
    return {
      reason: candidate.reason,
      action: { kind: "document", url: candidate.url },
      parentKey: candidate.parentKey,
      depth: candidate.depth,
      title: candidate.title,
    };
  }
  const searches = snapshot.operations.filter(
    ({ input }) => input.kind === "search",
  );
  if (!searches.some(({ result }) => result?.kind === "search")) {
    return stop;
  }
  if (searches.length >= settings.maximumSearches) {
    return { ...stop, reason: "exploration_limit" };
  }
  if (usesClientRequestQueries(snapshot.plan)) {
    return alternativeSearchChoices(snapshot)[0] ?? stop;
  }
  const continuation = nextPage(snapshot, words);
  if (continuation) {
    return continuation;
  }
  const observed = searches.flatMap(({ result }) =>
    result?.kind === "search" ? result.observations : [],
  );
  const hasResults = observed.length > 0;
  const suffixes =
    snapshot.plan.category === "employment"
      ? ['"apply"', '"we are hiring"']
      : ['"hiring" "freelance"', '"project" "budget"'];
  const candidates = hasResults
    ? suffixes
    : snapshot.plan.category === "employment"
      ? ["vacancies", "opportunities"]
      : ["project requests", "contract opportunities"];
  const target = `${settings.target}${settings.remote ? " remote" : ""}`;
  const queryText = candidates
    .map((suffix) => `${target} ${suffix}`)
    .find(
      (query) =>
        !searches.some(
          ({ input }) => input.kind === "search" && input.query.query === query,
        ),
    );
  const initial = snapshot.plan.queries[0];
  if (!queryText || !initial) {
    return stop;
  }
  const query: WebSearchQuery = { ...initial, query: queryText, page: 1 };
  return {
    reason: hasResults ? "refine_demand_query" : "broaden_query_wording",
    action: { kind: "search", query },
    parentKey: searches.at(-1)?.key ?? null,
    depth: 0,
    title: null,
  };
}

/** Builds unused public-target query alternatives only while the frozen search allowance remains available. */
function alternativeSearchChoices(
  snapshot: DiscoveryExploration,
): DiscoveryDecision[] {
  const settings = snapshot.plan.exploration!;
  const searches = snapshot.operations.filter(
    ({ input }) => input.kind === "search",
  );
  if (searches.length >= settings.maximumSearches) {
    return [];
  }
  if (
    usesClientRequestQueries(snapshot.plan) &&
    snapshot.operations.filter(({ input }) => input.kind === "document")
      .length >= snapshot.plan.maximumDocuments
  ) {
    return [];
  }
  const choices: DiscoveryDecision[] = [];
  const targets = snapshot.plan.strategy?.targets ?? [settings.target];
  const queries = usesClientRequestQueries(snapshot.plan)
    ? clientRequestQueries(targets, settings.queryPolicy)
    : targets.map(
        (target) =>
          `${target}${settings.remote ? " remote" : ""} ${snapshot.plan.category === "employment" ? '"apply"' : '"project" "budget"'}`,
      );
  for (const query of queries) {
    if (
      searches.some(
        ({ input }) => input.kind === "search" && input.query.query === query,
      )
    ) {
      continue;
    }
    choices.push({
      reason: "refine_demand_query",
      action: {
        kind: "search",
        query: {
          ...snapshot.plan.queries[0]!,
          query,
          page: 1,
          freshness: usesClientRequestQueries(snapshot.plan)
            ? clientRequestFreshness(query, settings.queryPolicy)
            : snapshot.plan.queries[0]!.freshness,
        },
      },
      parentKey: searches.at(-1)?.key ?? null,
      depth: 0,
      title: null,
    });
  }
  return choices;
}

/** Supplies bounded alternatives to model routing while keeping URLs, queries, depth and attempt ceilings under deterministic control. */
export function explorationChoices(
  snapshot: DiscoveryExploration,
): DiscoveryDecision[] {
  const first = planExploration(snapshot);
  const contextual =
    snapshot.plan.exploration?.candidatePolicy === "contextual-v1";
  if (
    snapshot.plan.policy !== "public-intent-v3" ||
    !snapshot.plan.exploration ||
    snapshot.plan.blockedReason ||
    snapshot.round >= snapshot.plan.exploration.maximumRounds ||
    (!first.action && !contextual)
  ) {
    return [first];
  }
  if (clientRequestNeedsSearch(snapshot) && first.action?.kind === "search") {
    return [first];
  }
  const settings = snapshot.plan.exploration!;
  const choices = [first];
  const documents = snapshot.operations.filter(
    ({ input }) => input.kind === "document",
  );
  if (documents.length < snapshot.plan.maximumDocuments) {
    for (const candidate of documentCandidates(
      snapshot,
      targetWords(settings.target),
    ).slice(0, 6)) {
      choices.push({
        reason: candidate.reason,
        action: { kind: "document", url: candidate.url },
        parentKey: candidate.parentKey,
        depth: candidate.depth,
        title: candidate.title,
      });
    }
  }
  choices.push(...alternativeSearchChoices(snapshot));
  choices.push({
    reason: "no_further_action",
    action: null,
    parentKey: null,
    depth: 0,
    title: null,
  });
  const unique = [
    ...new Map(
      choices.map((choice) => [JSON.stringify(choice), choice]),
    ).values(),
  ];
  if (!contextual) {
    return unique;
  }
  const selected = contextualDocumentChoices(snapshot, unique);
  const actions = [
    ...selected,
    ...unique.filter((choice) => choice.action?.kind === "search"),
  ];
  // Keep the model's schema bound and an explicit stop; failed reasoning uses planExploration separately.
  return [
    ...new Map(
      actions
        .filter((choice) => choice.action)
        .map((choice) => [JSON.stringify(choice.action), choice]),
    ).values(),
  ]
    .slice(0, 15)
    .concat(unique.find((choice) => !choice.action)!);
}
