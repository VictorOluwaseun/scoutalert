import type { ScoutRunRequest } from "../../scouting/public.js";
import type {
  DiscoveryPlan,
  DiscoveryExploration,
  DiscoveryDecision,
} from "../domain/contracts.js";
import {
  DiscoveryReasoningProvider,
  DiscoveryReasoningRepository,
  validReasoning,
  normalizeReasoning,
  type DiscoveryReasoningInput,
  type DiscoveryReasoningOutput,
} from "../domain/reasoning.js";
import { explorationChoices, planExploration } from "./plan-exploration.js";
import { contextualCandidateHints } from "./contextual-candidates.js";
import {
  clientRequestQueries,
  clientRequestFreshness,
} from "./client-request-search.js";

/** Adds model understanding and evidence-led action selection without giving the model control over constraints, URLs or budgets. */
export class PlanScoutSearch {
  /** Uses inward ports; persistence admission and SDK calls belong in adapters. */
  constructor(
    private readonly records: DiscoveryReasoningRepository,
    private readonly provider: DiscoveryReasoningProvider,
  ) {}

  /** Separates alternative public targets, preserving the complete private brief for later assessment. */
  async prepare(
    request: ScoutRunRequest,
    plan: DiscoveryPlan,
  ): Promise<DiscoveryPlan | "progress" | "waiting"> {
    if (!plan.exploration || plan.blockedReason) {
      return plan;
    }
    const input: DiscoveryReasoningInput = {
      kind: "strategy",
      intent: {
        target: plan.exploration.target,
        category: plan.category,
        remote: plan.exploration.remote,
      },
    };
    const result = await this.resolve(request, "strategy", input);
    if (result === "progress" || result === "waiting") {
      return result;
    }
    const targets =
      result?.kind === "strategy"
        ? result.strategy.targets
        : [input.intent.target];
    const initial = plan.queries[0]!;
    const demand =
      plan.category === "employment" ? "jobs" : '"hiring" freelance';
    const suffix = input.intent.remote ? " remote" : "";
    const queries = (
      plan.category === "services"
        ? clientRequestQueries(
            targets,
            plan.exploration.queryPolicy ?? "client-demand-v1",
          )
        : [
            ...targets.map((target) => `${target}${suffix} ${demand}`),
            `site:x.com ${targets[0]} ${demand}`,
            `site:linkedin.com/posts ${targets.at(-1)} ${demand}`,
          ]
    )
      .slice(0, 4)
      .map((query) => ({
        ...initial,
        query,
        freshness:
          plan.category === "services"
            ? clientRequestFreshness(query, plan.exploration?.queryPolicy)
            : initial.freshness,
      }));
    return {
      ...plan,
      policy: "public-intent-v3",
      exploration: { ...plan.exploration, candidatePolicy: "contextual-v1" },
      queries,
      strategy: {
        targets,
        explanation:
          result?.kind === "strategy"
            ? result.strategy.explanation
            : "Using the confirmed target; model planning was unavailable.",
      },
    };
  }

  /** Chooses a finite observed action after reviews settle; failed reasoning keeps the conservative keyword fallback. */
  async next(
    request: ScoutRunRequest,
    snapshot: DiscoveryExploration,
  ): Promise<DiscoveryDecision | "progress" | "waiting"> {
    const choices = explorationChoices(snapshot);
    if (choices.length === 1) {
      return choices[0]!;
    }
    const settings = snapshot.plan.exploration!;
    const input: DiscoveryReasoningInput = {
      kind: "choice",
      intent: {
        target: settings.target,
        category: snapshot.plan.category,
        remote: settings.remote,
      },
      choices,
      ...(settings.candidatePolicy === "contextual-v1"
        ? { candidates: contextualCandidateHints(snapshot, choices) }
        : {}),
      evidence: [
        ...snapshot.operations
          .flatMap(({ result }) =>
            result?.kind === "document" &&
            (result.status !== "fetched" || result.truncated)
              ? [
                  {
                    url: result.url,
                    scope: "source_access",
                    label: result.status,
                    explanation: `Source capture could not provide complete evidence: ${result.reason ?? "incomplete"}.`,
                    unknowns: ["demand and availability remain unverified"],
                  },
                ]
              : [],
          )
          .slice(-6),
        ...(snapshot.reviews ?? [])
          .slice(0, 12)
          .map(({ url, review, scope }) => ({
            url,
            scope,
            label: review.label,
            explanation:
              `${review.explanation} Subject: ${review.analysis.facts.role.value}. Evidence: ${review.quotes[0] ?? ""}`.slice(
                0,
                1200,
              ),
            unknowns: Object.entries(review.analysis.facts)
              .filter(([, fact]) => fact.status !== "stated")
              .map(([name]) => name),
          })),
        ...snapshot.operations
          .flatMap(({ result }) =>
            result?.kind === "search" ? result.observations : [],
          )
          .filter(
            (item) =>
              choices.some(
                (choice) =>
                  choice.action?.kind === "document" &&
                  choice.action.url === item.url,
              ) && !snapshot.reviews?.some((review) => review.url === item.url),
          )
          .slice(0, 12)
          .map((item) => ({
            url: item.url,
            scope: "search_excerpt",
            label: "unreviewed",
            explanation: `${item.title ?? ""} ${item.snippet ?? ""}`.slice(
              0,
              600,
            ),
            unknowns: ["source evidence not yet checked"],
          })),
      ],
    };
    const result = await this.resolve(
      request,
      `choice:${snapshot.round}`,
      input,
    );
    if (result === "progress" || result === "waiting") {
      return result;
    }
    if (result?.kind === "choice") {
      return choices[result.index]!;
    }
    // The keyword fallback can select a duplicate URL with a different parent/title.
    // Return the current admitted choice so durable validation cannot silently reject it forever.
    const fallback = planExploration(snapshot);
    return (
      choices.find((choice) => sameAction(choice, fallback)) ??
      choices.find((choice) => !choice.action)!
    );
  }

  /** Performs at most one paid model call per activity; ready results and unavailable attempts never repeat it. */
  private async resolve(
    request: ScoutRunRequest,
    phase: string,
    input: DiscoveryReasoningInput,
  ): Promise<DiscoveryReasoningOutput | null | "progress" | "waiting"> {
    const claim = await this.records.claim(
      request,
      phase,
      this.provider.configuration,
      input,
    );
    if (claim.status === "ready") {
      return validReasoning(input, claim.output) ? claim.output : null;
    }
    if (claim.status === "unavailable") {
      return null;
    }
    if (claim.status === "waiting") {
      return "waiting";
    }
    try {
      const result = await this.provider.reason(input);
      const output = normalizeReasoning(input, result.output);
      if (!validReasoning(input, output)) {
        await this.records.complete(claim.token, output, result.usage);
        return "progress";
      }
      await this.records.complete(claim.token, output, result.usage);
    } catch {
      await this.records.fail(claim.token);
    }
    return "progress";
  }
}

/** Reconciles a conservative fallback with the current grounded menu without copying stale provenance or expanding its bounds. */
function sameAction(
  left: DiscoveryDecision,
  right: DiscoveryDecision,
): boolean {
  if (!left.action || !right.action) {
    return left.action === right.action;
  }
  if (left.action.kind === "document" && right.action.kind === "document") {
    return left.action.url === right.action.url;
  }
  if (left.action.kind !== "search" || right.action.kind !== "search") {
    return false;
  }
  const query = right.action.query;
  return Object.entries(left.action.query).every(
    ([key, value]) => query[key as keyof typeof query] === value,
  );
}
