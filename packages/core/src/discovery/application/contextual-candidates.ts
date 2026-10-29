import { blocksSourceHost } from "../domain/source-access.js";
import type {
  DiscoveryDecision,
  DiscoveryExploration,
  SourceDocumentResult,
} from "../domain/contracts.js";
import type { DiscoveryReasoningInput } from "../domain/reasoning.js";
import { publicDestination } from "../domain/public-destination.js";
import { discoveryNavigation } from "./discovery-navigation.js";
import { prefersRemoteClientRequests } from "./remote-client-discovery.js";
import {
  clientRequestPriority,
  clientRequestRouteCoolingDown,
  usesClientRequestQueries,
} from "./client-request-search.js";

type Candidate = {
  decision: DiscoveryDecision & { action: { kind: "document"; url: string } };
  text: string;
};
type Hints = NonNullable<
  Extract<DiscoveryReasoningInput, { kind: "choice" }>["candidates"]
>;
const negative = new Set(["closed", "service_offer", "discussion"]);

/** Requires actual observed text but never requires a target-word match; navigation labels cannot fill the recall allowance. */
function hasContext(candidate: Candidate): boolean {
  return (
    /[\p{L}\p{N}]{3}/u.test(candidate.text) &&
    !discoveryNavigation(
      candidate.decision.action.url,
      candidate.decision.title,
    )
  );
}

/** Keeps access, depth, replay and original-source verdicts authoritative; excerpt verdicts remain tentative. */
function allowed(
  snapshot: DiscoveryExploration,
  decision: DiscoveryDecision,
): boolean {
  if (
    decision.action?.kind !== "document" ||
    !publicDestination(decision.action.url) ||
    discoveryNavigation(decision.action.url, decision.title)
  ) {
    return false;
  }
  const url = decision.action.url;
  const parent = snapshot.operations.find(
    (item) => item.key === decision.parentKey,
  );
  const denied = snapshot.reviews?.some(
    (item) =>
      item.scope === "source" &&
      negative.has(item.review.label) &&
      (item.url === url ||
        (parent?.input.kind === "document" && item.url === parent.input.url)),
  );
  const visited = snapshot.operations.some(
    (item) =>
      (item.input.kind === "document" && item.input.url === url) ||
      (item.result?.kind === "document" && item.result.retrievedUrl === url),
  );
  const blockedHost = snapshot.operations.some(
    ({ result }) =>
      result?.kind === "document" &&
      blocksSourceHost(result) &&
      publicDestination(result.url) &&
      new URL(result.url).hostname === new URL(url).hostname,
  );
  return (
    !denied &&
    !visited &&
    !blockedHost &&
    !clientRequestRouteCoolingDown(snapshot, url) &&
    !!parent &&
    decision.depth <= snapshot.plan.exploration!.maximumDepth
  );
}

/** Offers observed search results and source anchors, including informal demand whose wording differs from the public goal. */
function observedCandidates(snapshot: DiscoveryExploration): Candidate[] {
  const candidates: Candidate[] = [];
  for (const operation of snapshot.operations) {
    const result = operation.result;
    if (result?.kind === "search") {
      candidates.push(
        ...[...result.observations]
          .sort((a, b) => a.rank - b.rank)
          .map((item) => ({
            decision: {
              reason: "check_promising_result" as const,
              action: { kind: "document" as const, url: item.url },
              title: item.title,
              parentKey: operation.key,
              depth: 0,
            },
            text: `${item.title ?? ""} ${item.snippet ?? ""}`,
          })),
      );
      continue;
    }
    if (result?.kind !== "document" || result.status !== "fetched") {
      continue;
    }
    candidates.push(
      ...(result.links ?? []).map((link) => ({
        decision: {
          reason: "follow_source_link" as const,
          action: { kind: "document" as const, url: link.url },
          title: link.text,
          parentKey: operation.key,
          depth: operation.depth + 1,
        },
        text: `${link.text} ${childContext(snapshot, result, link.text)}`,
      })),
    );
  }
  return candidates.filter(
    (item) => hasContext(item) && allowed(snapshot, item.decision),
  );
}

/** Interleaves originating searches/pages and hosts so a repetitive domain cannot occupy every model option. */
function diverse(
  candidates: Candidate[],
  maximum: number,
  rank?: (candidate: Candidate) => number,
): Candidate[] {
  const selected: Candidate[] = [];
  const remaining = [...candidates];
  const parents = new Map<string | null, number>();
  const hosts = new Map<string, number>();
  /** Scores selection pressure only; this is diversity, not semantic relevance. */
  const pressure = (candidate: Candidate): [number, number] => [
    hosts.get(new URL(candidate.decision.action.url).hostname) ?? 0,
    parents.get(candidate.decision.parentKey) ?? 0,
  ];
  while (remaining.length && selected.length < maximum) {
    remaining.sort(
      (a, b) =>
        Number(pressure(a)[0] >= 2) - Number(pressure(b)[0] >= 2) ||
        (rank
          ? Number(pressure(a)[1] >= 2) - Number(pressure(b)[1] >= 2)
          : 0) ||
        (rank ? rank(b) - rank(a) : 0) ||
        pressure(a)[0] - pressure(b)[0] ||
        pressure(a)[1] - pressure(b)[1],
    );
    const candidate = remaining.shift()!;
    const action = candidate.decision.action;
    const host = new URL(action.url).hostname;
    selected.push(candidate);
    parents.set(
      candidate.decision.parentKey,
      (parents.get(candidate.decision.parentKey) ?? 0) + 1,
    );
    hosts.set(host, (hosts.get(host) ?? 0) + 1);
  }
  return selected;
}

/** Preserves four high-priority choices and reserves six options for semantic inspection, without admitting more source reads. */
export function contextualDocumentChoices(
  snapshot: DiscoveryExploration,
  preferred: DiscoveryDecision[],
): DiscoveryDecision[] {
  const documents = snapshot.operations.filter(
    (item) => item.input.kind === "document",
  );
  if (
    !snapshot.plan.exploration ||
    documents.length >= snapshot.plan.maximumDocuments
  ) {
    return [];
  }
  const trusted = new Map<string, DiscoveryDecision>();
  for (const decision of preferred) {
    if (decision.action?.kind !== "document" || !allowed(snapshot, decision)) {
      continue;
    }
    trusted.set(decision.action.url, decision);
  }
  if (usesClientRequestQueries(snapshot.plan)) {
    return clientRequestChoices(snapshot, [...trusted.values()]);
  }
  const priority = [...trusted.values()].slice(0, 4);
  const chosen = new Set(
    priority.flatMap((item) =>
      item.action?.kind === "document" ? [item.action.url] : [],
    ),
  );
  const unseen = new Map<string, Candidate>();
  for (const candidate of observedCandidates(snapshot)) {
    const action = candidate.decision.action;
    if (chosen.has(action.url) || unseen.has(action.url)) {
      continue;
    }
    unseen.set(action.url, candidate);
  }
  const extra = diverse([...unseen.values()], 10 - priority.length);
  return [...priority, ...extra.map((item) => item.decision)];
}

/** Gives specific buyer requests room ahead of generic hiring directories and seller pages, retaining two diverse semantic options so English hints never become a recall gate. */
function clientRequestChoices(
  snapshot: DiscoveryExploration,
  preferred: DiscoveryDecision[],
): DiscoveryDecision[] {
  const observed = observedCandidates(snapshot);
  const candidates = new Map(
    observed.map((item) => [item.decision.action.url, item]),
  );
  for (const decision of preferred) {
    if (
      decision.action?.kind !== "document" ||
      candidates.has(decision.action.url)
    ) {
      continue;
    }
    candidates.set(decision.action.url, {
      decision: { ...decision, action: decision.action },
      text: decision.title ?? "",
    });
  }
  const target = snapshot.plan.exploration!.target;
  const priority = diverse([...candidates.values()], 8, (candidate) =>
    requestPriority(
      candidate,
      target,
      prefersRemoteClientRequests(snapshot.plan),
    ),
  );
  const selected = new Set(priority.map((item) => item.decision.action.url));
  const extra = diverse(
    [...candidates.values()].filter(
      (item) => !selected.has(item.decision.action.url),
    ),
    2,
  );
  const shortlist = [...priority, ...extra].map((item) => item.decision);
  const fallback = preferred[0];
  const fallbackAction = fallback?.action;
  if (
    snapshot.plan.exploration?.queryPolicy !== "client-demand-v8" ||
    !fallback ||
    fallbackAction?.kind !== "document" ||
    shortlist.some(
      (choice) =>
        choice.action?.kind === "document" &&
        choice.action.url === fallbackAction.url,
    )
  ) {
    return shortlist;
  }
  // Preserve an already admitted deterministic route when diversity ranking fills the menu.
  // Otherwise unavailable model reasoning can stop despite remaining useful read capacity.
  return [...shortlist.slice(0, 9), fallback];
}

/** Ranks observed buyer language without authorizing publication or making private fit judgments. */
function requestPriority(
  candidate: Candidate,
  target: string,
  remote: boolean,
): number {
  return clientRequestPriority(
    candidate.decision.action.url,
    candidate.decision.title ?? "",
    candidate.text,
    target,
    remote,
  );
}

/** Keeps an anchor's observed surrounding wording available as a routing hint, without transferring parent facts to the unread child. */
function nearbyText(text: string | null, title: string): string {
  if (!text || title.trim().length < 8) {
    return "";
  }
  const position = text
    .toLocaleLowerCase("en")
    .indexOf(title.toLocaleLowerCase("en"));
  return position < 0 ? "" : text.slice(position, position + 700);
}

/** Only confirmed collections may supply nearby listing context. Unreviewed pages and failed reviews do not establish that surrounding demand describes an unread child. */
function childContext(
  snapshot: DiscoveryExploration,
  document: SourceDocumentResult,
  title: string,
): string {
  if (document.capture?.scope === "buyer_brief" || document.posting) {
    return "";
  }
  const collection =
    !!document.feed ||
    !!document.sitemap ||
    snapshot.reviews?.some(
      ({ url, scope, review }) =>
        url === document.url &&
        scope === "source" &&
        review.label === "directory",
    );
  return collection ? nearbyText(document.text, title) : "";
}

/** Supplies only selected public hints, with explicit parent/query provenance; linked-page facts remain unknown until captured. */
export function contextualCandidateHints(
  snapshot: DiscoveryExploration,
  choices: DiscoveryDecision[],
): Hints {
  return choices.flatMap((choice, index): Hints => {
    const action = choice.action;
    const parent = snapshot.operations.find(
      (item) => item.key === choice.parentKey,
    );
    if (action?.kind !== "document" || !parent?.result) {
      return [];
    }
    if (parent.result.kind === "search") {
      const item = parent.result.observations.find(
        (entry) => entry.url === action.url,
      );
      return [
        {
          choice: index,
          origin: "search_result",
          text: `${item?.title ?? choice.title ?? ""} ${item?.snippet ?? ""}`.slice(
            0,
            1200,
          ),
          parentUrl: null,
          query:
            parent.input.kind === "search"
              ? parent.input.query.query.slice(0, 300)
              : null,
        },
      ];
    }
    const document = parent.result;
    const context = childContext(snapshot, document, choice.title ?? "");
    return [
      {
        choice: index,
        origin: "source_link",
        text: `${choice.title ?? ""}\n${context ? `Nearby collection text (not verified child evidence): ${context}` : "Linked page unread; the parent page does not establish this child's demand, availability or fit."}`.slice(
          0,
          1200,
        ),
        parentUrl: parent.result.url,
        query: null,
      },
    ];
  });
}
