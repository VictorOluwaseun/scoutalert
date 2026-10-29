import { publicDestination } from "../domain/public-destination.js";
import {
  remoteClientQueries,
  remoteClientHint,
  remoteClientNeedsSearch,
} from "./remote-client-discovery.js";
import type {
  DiscoveryExploration,
  DiscoveryPlan,
  WebSearchQuery,
} from "../domain/contracts.js";

type QueryPolicy =
  | "client-demand-v1"
  | "client-demand-v2"
  | "client-demand-v3"
  | "client-demand-v4"
  | "client-demand-v5"
  | "client-demand-v6"
  | "client-demand-v7"
  | "client-demand-v8";

/** Recognizes frozen buyer-query versions so existing cases retain their original vocabulary. */
export function usesClientRequestQueries(plan: DiscoveryPlan): boolean {
  return [
    "client-demand-v1",
    "client-demand-v2",
    "client-demand-v3",
    "client-demand-v4",
    "client-demand-v5",
    "client-demand-v6",
    "client-demand-v7",
    "client-demand-v8",
  ].includes(plan.exploration?.queryPolicy ?? "");
}

/** Builds complementary buyer-demand queries from approved public targets only. Remote routing never substitutes for source evidence or private matching. */
export function clientRequestQueries(
  targets: readonly string[],
  policy: QueryPolicy = "client-demand-v8",
  remote = false,
): string[] {
  if (policy === "client-demand-v8") {
    const broad = clientRequestQueries(targets, "client-demand-v7");
    return remote ? remoteClientQueries(targets, broad) : broad;
  }
  const legacy = [
    '("project" OR "brief") ("budget" OR "fixed price")',
    '("looking for" OR "seeking" OR "need") ("freelancer" OR "contractor")',
    '("request for proposal" OR "request for quotation" OR "RFP")',
    '("project" OR "brief") ("proposals" OR "bids")',
    'site:x.com ("hiring" OR "need") ("project" OR "freelance")',
    'site:linkedin.com/posts ("hiring" OR "need") ("project" OR "freelance")',
  ];
  const buyerBriefs = [
    '("project details" OR "project description" OR "open for bidding")',
    '("I need" OR "we need" OR "looking for") ("freelancer" OR "budget")',
    '("request for proposal" OR "request for quotation" OR "RFP")',
    '("seeking" OR "hiring") ("freelance" OR "contractor")',
    '("project" OR "brief") ("budget" OR "fixed price")',
    '("project" OR "brief") ("proposals" OR "bids")',
    ...legacy.slice(4),
  ];
  const families =
    policy === "client-demand-v1"
      ? legacy
      : policy === "client-demand-v2"
        ? buyerBriefs
        : [
              "client-demand-v4",
              "client-demand-v5",
              "client-demand-v6",
              "client-demand-v7",
            ].includes(policy)
          ? [
              "site:peopleperhour.com/freelance-jobs",
              [
                "client-demand-v5",
                "client-demand-v6",
                "client-demand-v7",
              ].includes(policy ?? "")
                ? "site:workana.com inurl:job"
                : 'site:workana.com ("about this project" OR "evaluating bids")',
              buyerBriefs[2]!,
              ...(policy === "client-demand-v7"
                ? [
                    `filetype:pdf ${buyerBriefs[2]!}`,
                    'site:bsky.app/profile inurl:post ("looking for" OR "need" OR "seeking")',
                  ]
                : []),
              'inurl:projects ("budget" OR "bids" OR "proposals")',
              buyerBriefs[1]!,
              ...buyerBriefs,
            ]
          : [
              'inurl:projects ("budget" OR "bids" OR "proposals")',
              '"open for bidding"',
              buyerBriefs[2]!,
              buyerBriefs[1]!,
              ...buyerBriefs,
            ];
  // Rotate targets between families so the initial bounded window covers several public skills/deliverables.
  return [
    ...new Set(
      targets.flatMap((_, offset) =>
        families.map((family, index) => {
          // Reuse the leading concept on the second marketplace before rotating less widely indexed stack terms.
          const targetIndex =
            [
              "client-demand-v5",
              "client-demand-v6",
              "client-demand-v7",
            ].includes(policy ?? "") && index === 1
              ? offset
              : index + offset;
          const target = targets[targetIndex % targets.length]!;
          // Quote supplied terms, not an entire skill stack: search must retain the topic without requiring an unnatural exact phrase.
          const words = target.match(/[\p{L}\p{N}+#.-]+/gu) ?? [];
          const topic =
            ["client-demand-v6", "client-demand-v7"].includes(policy) &&
            words.length <= 3
              ? `"${words.join(" ")}"`
              : policy === "client-demand-v1"
                ? target
                : (target.match(/[\p{L}\p{N}+#.-]+/gu) ?? [])
                    .map((word) => `"${word}"`)
                    .join(" ");
          return `${topic} ${family}`;
        }),
      ),
    ),
  ];
}

/** Sparse marketplace indexing needs an undated query; live source evidence still decides whether a request is open. Other query families and frozen older policies retain their monthly window. */
export function clientRequestFreshness(
  query: string,
  policy?: string,
): WebSearchQuery["freshness"] {
  if (
    policy === "client-demand-v8" &&
    /site:(?:workana\.com inurl:job|peopleperhour\.com\/freelance-jobs)/u.test(
      query,
    )
  ) {
    return "any";
  }
  return ["client-demand-v5", "client-demand-v6", "client-demand-v7"].includes(
    policy ?? "",
  ) && query.includes("site:workana.com inurl:job")
    ? "any"
    : "month";
}

/** Reserves a query change after two inaccessible reads or two reviewed buyer briefs without remote evidence. A new search resets recovery, and callers retain all frozen search/read ceilings. */
export function clientRequestNeedsSearch(
  snapshot: DiscoveryExploration,
): boolean {
  return (
    remoteClientNeedsSearch(snapshot) ||
    ([
      "client-demand-v3",
      "client-demand-v4",
      "client-demand-v5",
      "client-demand-v6",
      "client-demand-v7",
      "client-demand-v8",
    ].includes(snapshot.plan.exploration?.queryPolicy ?? "") &&
      snapshot.operations.length >= 2 &&
      snapshot.operations
        .slice(-2)
        .every(
          ({ result }) =>
            result?.kind === "document" && result.status !== "fetched",
        ))
  );
}

/** Scores public routing hints, never demand verification. Low scores remain available for semantic inspection; ambiguous snippets cannot become hard exclusions. */
export function clientRequestPriority(
  url: string,
  title: string,
  text: string,
  target: string,
  remote = false,
): number {
  if (!publicDestination(url)) {
    return -3;
  }
  const seller =
    /\b(?:for hire|hire me|my services|available for (?:freelance|hire)|looking for (?:clients|work|projects)|services (?:agency|company)|development services)\b/iu;
  const advice =
    /\b(?:how to|guide|tutorial|template|tips|cost calculator)\b/iu;
  const address = new URL(url);
  if (seller.test(title) || advice.test(`${title} ${address.pathname}`)) {
    return -3;
  }
  if (
    remote &&
    /\b(?:i['’]?m open to freelance|i am open to freelance|available for freelancing|available for freelance projects|looking for clients)\b/iu.test(
      `${title} ${text}`,
    )
  ) {
    return -3;
  }
  const collection =
    /^(?:www\.)?peopleperhour\.com$/iu.test(address.hostname) &&
    address.pathname.startsWith("/freelance-jobs") &&
    !/-\d+\/?$/u.test(address.pathname);
  // Marketplace collections advertise remote work for many listings; that wording is not evidence about an individual request.
  const remoteHint =
    remote && !collection ? remoteClientHint(`${title} ${text}`) : 0;
  const request =
    /\b(?:(?:i|we) (?:need|want|require|am looking|are looking)|seeking|looking for|needed|request for (?:proposal|quotation)|rfp|rfq)\b/iu;
  const commercial =
    /\b(?:budget|fixed.price|proposals?|bids?|deliverables?|scope of work)\b|[$€£]\s*\d/iu;
  const detail =
    /\/(?:projects?|freelance-jobs|requests?|rfps?|tenders?|opportunities)\/[^/?#]+/iu;
  const content = `${title} ${text}`;
  const words = new Set(content.toLowerCase().match(/[\p{L}\p{N}+#]+/gu) ?? []);
  const topic = [
    ...new Set(target.toLowerCase().match(/[\p{L}\p{N}+#]+/gu) ?? []),
  ]
    .filter(
      (word) =>
        !["and", "or", "for", "the", "a", "an", "of"].includes(word) &&
        words.has(word),
    )
    .reduce(
      (score, word) =>
        score +
        (["design", "development", "services", "project"].includes(word)
          ? 1
          : 4),
      0,
    );
  const buyer = request.test(content) && !seller.test(content);
  if (remote && topic === 0) {
    return 0;
  }
  if (remote && collection) {
    return Math.min(topic, 3);
  }
  const specificity = detail.test(url) && commercial.test(content);
  const employment =
    /\b(?:full.time|join (?:our|the) team)\b/iu.test(content) ||
    /\/(?:jobs?|careers|positions?)\//iu.test(address.pathname);
  if (buyer || specificity) {
    return (
      topic +
      3 +
      Number(commercial.test(content)) +
      Number(detail.test(url)) -
      Number(employment) * 5 +
      remoteHint
    );
  }
  if (
    /^hire\b/iu.test(title) ||
    /\/(?:services|hire-[^/]+)(?:\/|$)/iu.test(address.pathname)
  ) {
    return -2;
  }
  return topic + (topic > 0 ? remoteHint : 0);
}

/** Pauses a repeatedly crawl-denied sibling route for this case after two attempts. This is a local efficiency limit, not a claim that every page or the host is forbidden; other paths and native connectors remain eligible. */
export function clientRequestRouteCoolingDown(
  snapshot: DiscoveryExploration,
  destination: string,
): boolean {
  if (
    !usesClientRequestQueries(snapshot.plan) ||
    !publicDestination(destination)
  ) {
    return false;
  }
  const route = parentRoute(destination);
  return (
    snapshot.operations.filter(
      ({ result }) =>
        result?.kind === "document" &&
        result.status !== "fetched" &&
        result.reason === "crawl_policy_denied" &&
        publicDestination(result.url) &&
        parentRoute(result.url) === route,
    ).length >= 2
  );
}

/** Groups exact-origin sibling paths only; query parameters and leaf identities do not turn one denied route into more useful reads. */
function parentRoute(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1)}`;
}
