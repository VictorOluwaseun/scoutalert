import type {
  DiscoveryDecision,
  DiscoveryExploration,
} from "../domain/contracts.js";
import type { DiscoveryReasoningInput } from "../domain/reasoning.js";
import { publicDestination } from "../domain/public-destination.js";

type Candidate = {
  decision: DiscoveryDecision & { action: { kind: "document"; url: string } };
  text: string;
};
type Hints = NonNullable<
  Extract<DiscoveryReasoningInput, { kind: "choice" }>["candidates"]
>;
const negative = new Set(["closed", "service_offer", "discussion"]);
const navigation =
  /^(?:log[ -]?in|sign[ -]?in|sign[ -]?up|register|subscribe|privacy(?: policy)?|terms(?: of (?:use|service))?|cookie policy|home|next|previous|back)$/iu;

/** Requires actual observed text but never requires a target-word match; navigation labels cannot fill the recall allowance. */
function hasContext(candidate: Candidate): boolean {
  return (
    /[\p{L}\p{N}]{3}/u.test(candidate.text) &&
    !navigation.test(candidate.decision.title?.trim() ?? "")
  );
}

/** Keeps access, depth, replay and original-source verdicts authoritative; excerpt verdicts remain tentative. */
function allowed(
  snapshot: DiscoveryExploration,
  decision: DiscoveryDecision,
): boolean {
  if (
    decision.action?.kind !== "document" ||
    !publicDestination(decision.action.url)
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
    (item) => item.input.kind === "document" && item.input.url === url,
  );
  const blockedHost = snapshot.operations.some(
    ({ result }) =>
      result?.kind === "document" &&
      result.status !== "fetched" &&
      publicDestination(result.url) &&
      new URL(result.url).hostname === new URL(url).hostname,
  );
  return (
    !denied &&
    !visited &&
    !blockedHost &&
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
        text: link.text,
      })),
    );
  }
  return candidates.filter(
    (item) => hasContext(item) && allowed(snapshot, item.decision),
  );
}

/** Interleaves originating searches/pages and hosts so a repetitive domain cannot occupy every model option. */
function diverse(candidates: Candidate[], maximum: number): Candidate[] {
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
        pressure(a)[0] - pressure(b)[0] || pressure(a)[1] - pressure(b)[1],
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
    const parentReview = snapshot.reviews?.find(
      (item) => item.scope === "source" && item.url === document.url,
    );
    return [
      {
        choice: index,
        origin: "source_link",
        text: `${choice.title ?? ""}\nParent page context (not child evidence): ${parentReview?.review.explanation ?? parent.result.text ?? ""}`.slice(
          0,
          1200,
        ),
        parentUrl: parent.result.url,
        query: null,
      },
    ];
  });
}
