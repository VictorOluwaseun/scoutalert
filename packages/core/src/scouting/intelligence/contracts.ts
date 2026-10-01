import type { SearchDraft } from "../../onboarding/domain/search-draft.js";
import type { Assessment, Posting, RunContext } from "../domain/discovery.js";

/** Every stated public fact carries verbatim evidence from the captured posting version. */
export interface PostingFact {
  status: "stated" | "unknown" | "conflicting";
  value: string;
  quotes: string[];
}
export const factNames = [
  "role",
  "arrangement",
  "category",
  "location",
  "requirements",
  "authorization",
  "sponsorship",
  "compensation",
] as const;
export type FactName = (typeof factNames)[number];
/** Public extraction can be reused across accounts; compensation never silently converts currency or periods. */
export interface PostingAnalysis {
  research?: import("../research/employer-evidence.js").EmployerResearch;
  facts: Record<FactName, PostingFact>;
  pay: {
    minimum: number | null;
    maximum: number | null;
    currency: string | null;
    period: "year" | "month" | "hour" | "project" | null;
  };
}
export const criterionNames = [
  "role",
  "category",
  "arrangement",
  "location",
  "experience",
  "authorization",
  "compensation",
] as const;
export type CriterionName = (typeof criterionNames)[number];
/** A personal interpretation must cite both posting evidence and the relevant confirmed brief. */
export interface FitCriterion {
  criterion: CriterionName;
  status: "meets" | "conflicts" | "unknown";
  explanation: string;
  quotes: string[];
  briefQuotes: string[];
}
/** Private model output is a proposal; domain policies retain the final publication decision. */
export interface PersonalFit {
  criteria: FitCriterion[];
}
/** Provider telemetry is retained without logging prompts, profiles or credentials. */
export interface AnalysisUsage {
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  durationMs: number;
  responseId: string;
}
export type IntelligenceResult =
  | { kind: "extraction"; analysis: PostingAnalysis; usage: AnalysisUsage }
  | { kind: "research"; analysis: PostingAnalysis; usage: AnalysisUsage }
  | {
      kind: "fit";
      fit: PersonalFit;
      analysis?: PostingAnalysis;
      usage: AnalysisUsage;
    };
/** Exact immutable inputs determine cache identity, including provider/model/prompt/schema configuration. */
export interface IntelligenceTask {
  kind: "extraction" | "research" | "fit";
  /** Admission epoch allows another bounded attempt after expired evidence; fresh public research is shared across epochs. */
  evidenceEpoch?: string;
  configuration: string;
  posting: Posting;
  context?: RunContext;
  analysis?: PostingAnalysis;
}
export type TaskClaim =
  | { status: "ready"; result: IntelligenceResult }
  | { status: "claimed"; token: string }
  | { status: "waiting" | "unavailable" };
/** Durable caching, fenced leases and global daily request admission live behind this inward port. */
export abstract class IntelligenceRepository {
  /** Freezes eight unassessed candidates per logical run and returns reusable private verdicts for all retrieved candidates. */
  abstract plan(
    context: RunContext,
    postings: Posting[],
    configuration: string,
  ): Promise<{
    selected: string[];
    results: {
      postingId: string;
      result: IntelligenceResult & { kind: "fit" };
      analysis: PostingAnalysis;
    }[];
  }>;
  /** Reuses exact inputs or reserves one model attempt under a shared daily limit; private tasks require current owner/revision. */
  abstract claim(task: IntelligenceTask): Promise<TaskClaim>;
  /** Stores a validated result only for the unexpired lease and current input versions. */
  abstract complete(token: string, result: IntelligenceResult): Promise<void>;
  /** Retains a bounded failure code; retry cooldown prevents failures from causing spending loops. */
  abstract fail(
    token: string,
    code: "provider_unavailable" | "invalid_evidence",
  ): Promise<void>;
}
/** Versioned intelligence tasks use native provider capabilities only inside their adapter. */
export abstract class IntelligenceProvider {
  abstract readonly configuration: string;
  /** Extracts public claims with strict output shape and bounded response time/size. */
  abstract extract(
    posting: Posting,
  ): Promise<IntelligenceResult & { kind: "extraction" }>;
  /** Evaluates only the supplied brief and cited posting; no account identity or email is needed. */
  abstract assess(
    posting: Posting,
    search: SearchDraft,
    analysis: PostingAnalysis,
  ): Promise<IntelligenceResult & { kind: "fit" }>;
}
/** A bounded run can yield while persistent tasks finish, without keeping activity memory alive. */
export abstract class CandidateEvaluator {
  /** Returns progress after one paid step or waiting for another lease; a returned list is ready for authoritative publication. */
  abstract evaluate(
    context: RunContext,
    postings: Posting[],
  ): Promise<
    { posting: Posting; assessment: Assessment }[] | "progress" | "waiting"
  >;
}
