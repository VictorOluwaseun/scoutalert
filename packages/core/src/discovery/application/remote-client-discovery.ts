import type {
  DiscoveryExploration,
  DiscoveryPlan,
} from "../domain/contracts.js";

/** Enables remote-aware retrieval only for new buyer cases; frozen older plans retain their routing. */
export function prefersRemoteClientRequests(plan: DiscoveryPlan): boolean {
  return (
    plan.category === "services" &&
    plan.exploration?.queryPolicy === "client-demand-v8" &&
    plan.exploration.remote
  );
}

/** Mixes remote-focused searches with broad buyer coverage, using only the approved public words. Older listings must still pass current source availability checks. */
export function remoteClientQueries(
  targets: readonly string[],
  broad: string[],
): string[] {
  const topics = targets.map((target) => {
    const words = target.match(/[\p{L}\p{N}+#.-]+/gu) ?? [];
    // Keep short deliverables intact, but do not require a long skill stack as one indexed phrase.
    return words.length <= 2 ? `"${words.join(" ")}"` : words.join(" ");
  });
  const first = topics[0]!;
  return [
    ...new Set([
      `${first} site:peopleperhour.com/freelance-jobs "remote"`,
      `${first} "remote" ("freelance" OR "proposals" OR "bids")`,
      broad[1]!,
      broad[2]!,
      ...topics.map(
        (topic) =>
          `${topic} "remote" ("open for proposals" OR "open for bidding")`,
      ),
      ...topics.map(
        (topic) => `${topic} site:freelancer.com/projects "remote"`,
      ),
      ...broad,
    ]),
  ];
}

/** Scores observed wording for routing only; neither a snippet nor a remote query establishes source evidence. */
export function remoteClientHint(text: string): number {
  if (
    /\b(?:not remote|no remote|remote (?:work )?(?:is )?not|on[ -]?site only|archived|awarded|expired|paused|closed)\b/iu.test(
      text,
    )
  ) {
    return -8;
  }
  return /\b(?:remote|remotely|work from home|work from anywhere)\b/iu.test(
    text,
  )
    ? 8
    : 0;
}

/** Changes query family after two consecutive reviewed buyer briefs fail to establish remote work. A new search resets this bounded recovery opportunity. */
export function remoteClientNeedsSearch(
  snapshot: DiscoveryExploration,
): boolean {
  if (!prefersRemoteClientRequests(snapshot.plan)) {
    return false;
  }
  const latest = snapshot.operations.slice(-2);
  return (
    latest.length === 2 &&
    latest.every(({ input, result }) => {
      if (input.kind !== "document" || result?.kind !== "document") {
        return false;
      }
      const review = snapshot.reviews?.find(
        (item) => item.url === input.url && item.scope === "source",
      )?.review;
      if (review?.label !== "client_request") {
        return false;
      }
      const arrangement = review.analysis.facts.arrangement;
      return (
        arrangement.status !== "stated" ||
        remoteClientHint(arrangement.value) <= 0
      );
    })
  );
}
