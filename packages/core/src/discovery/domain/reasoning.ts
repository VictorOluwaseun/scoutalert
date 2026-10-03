import type { AnalysisUsage, ScoutRunRequest } from "../../scouting/public.js";
import type { DiscoveryDecision } from "./contracts.js";

/** Public search intent only; confirmed private constraints remain exclusively in personal matching. */
export interface PublicScoutIntent {
  target: string;
  category: "employment" | "contracts" | "services";
  remote: boolean;
}

/** A model may separate role alternatives using words already supplied in the public target. */
export interface ScoutSearchStrategy {
  targets: string[];
  explanation: string;
}

/** Model routing selects only policy-approved actions and receives bounded public evidence summaries. */
export type DiscoveryReasoningInput =
  | { kind: "strategy"; intent: PublicScoutIntent }
  | {
      kind: "choice";
      intent: PublicScoutIntent;
      choices: DiscoveryDecision[];
      evidence: {
        url: string;
        label: string;
        scope: string;
        explanation: string;
        unknowns: string[];
      }[];
    };

export type DiscoveryReasoningOutput =
  | { kind: "strategy"; strategy: ScoutSearchStrategy }
  | { kind: "choice"; index: number; explanation: string };

export type DiscoveryReasoningClaim =
  | { status: "ready"; output: DiscoveryReasoningOutput }
  | { status: "waiting" }
  | { status: "unavailable" }
  | { status: "claimed"; token: string };

/** Shares public reasoning while fencing each request against its owner's current scout and finite run. */
export abstract class DiscoveryReasoningRepository {
  /** Binds a run/phase once and reserves one attempt using the global AI ledger. */
  abstract claim(
    request: ScoutRunRequest,
    phase: string,
    configuration: string,
    input: DiscoveryReasoningInput,
  ): Promise<DiscoveryReasoningClaim>;
  /** Accepts an unexpired attempt and stores its measured usage without refunding reservations. */
  abstract complete(
    token: string,
    output: DiscoveryReasoningOutput,
    usage: AnalysisUsage,
  ): Promise<void>;
  /** Keeps a failed or ambiguous attempt terminal for its immutable public input window. */
  abstract fail(token: string): Promise<void>;
}

/** Structured model implementation cannot execute searches or invent fetch destinations. */
export abstract class DiscoveryReasoningProvider {
  abstract readonly configuration: string;
  /** Returns bounded public strategy or the index of a supplied action, plus provider usage. */
  abstract reason(
    input: DiscoveryReasoningInput,
  ): Promise<{ output: DiscoveryReasoningOutput; usage: AnalysisUsage }>;
}

/** Normalizes role words for exact public-vocabulary checks; no private search fields participate. */
function words(value: string): string[] {
  return value.toLocaleLowerCase("en").match(/[\p{L}\p{N}+#.-]+/gu) ?? [];
}

/** Prevents query expansion from inventing roles or exporting new identifiers; model uncertainty falls back to the original target. */
export function validReasoning(
  input: DiscoveryReasoningInput,
  output: DiscoveryReasoningOutput,
): boolean {
  if (input.kind === "choice" && output.kind === "choice") {
    return (
      Number.isInteger(output.index) &&
      output.index >= 0 &&
      output.index < input.choices.length &&
      output.explanation.length > 0 &&
      output.explanation.length <= 600
    );
  }
  if (input.kind !== "strategy" || output.kind !== "strategy") {
    return false;
  }
  const targets = output.strategy.targets;
  const vocabulary = new Set(words(input.intent.target));
  const targetWords = targets.flatMap(words);
  const ignored = new Set(["and", "or", "both", "a", "an", "the", "for"]);
  return (
    targets.length > 0 &&
    targets.length <= 3 &&
    new Set(targets).size === targets.length &&
    output.strategy.explanation.length > 0 &&
    output.strategy.explanation.length <= 600 &&
    targets.every(
      (target) =>
        target.length >= 3 &&
        target.length <= 160 &&
        !/[@/:]|\d{6,}|[\r\n]/u.test(target) &&
        words(target).some((word) => !ignored.has(word)),
    ) &&
    targetWords.every((word) => vocabulary.has(word)) &&
    [...vocabulary]
      .filter((word) => !ignored.has(word))
      .every((word) => targetWords.includes(word))
  );
}

/** Removes a redundant model-added remote qualifier only when that public preference is already explicit; search templates reapply it. */
export function normalizeReasoning(
  input: DiscoveryReasoningInput,
  output: DiscoveryReasoningOutput,
): DiscoveryReasoningOutput {
  if (
    input.kind !== "strategy" ||
    output.kind !== "strategy" ||
    !input.intent.remote ||
    /\bremote\b/iu.test(input.intent.target)
  ) {
    return output;
  }
  return {
    ...output,
    strategy: {
      ...output.strategy,
      targets: output.strategy.targets.map((target) =>
        target
          .replace(/\bremote\b/giu, "")
          .replace(/\s+/gu, " ")
          .trim(),
      ),
    },
  };
}
