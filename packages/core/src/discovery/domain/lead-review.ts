import type {
  AnalysisUsage,
  PostingAnalysis,
  PostingFact,
  ScoutRunRequest,
} from "../../scouting/public.js";

export const leadLabels = [
  "job_opening",
  "client_request",
  "service_offer",
  "discussion",
  "directory",
  "closed",
  "unclear",
] as const;
export type LeadLabel = (typeof leadLabels)[number];

/** Immutable public input; search excerpts cannot establish source facts or authorize opportunity publication. */
export interface LeadReviewInput {
  nativePost?: import("./social-discovery.js").NativePost;
  nativeContext?: import("./social-context.js").NativeContext;
  id: string;
  url: string;
  fingerprint: string;
  scope: "source" | "search_excerpt";
  truncated: boolean;
  text: string;
  observedAt: string;
  documentFingerprint: string | null;
}

/** Public demand interpretation and extracted facts remain distinct from private fit and current availability. */
export interface LeadReview {
  label: LeadLabel;
  explanation: string;
  quotes: string[];
  company: PostingFact;
  deadline: PostingFact;
  application: PostingFact;
  analysis: PostingAnalysis;
}

/** One bounded provider call may classify several excerpts or extract one complete source document. */
export interface LeadReviewResult {
  reviews: { id: string; review: LeadReview }[];
  usage: AnalysisUsage;
}

export type LeadReviewClaim =
  | { status: "done" | "waiting" }
  | { status: "claimed"; token: string; inputs: LeadReviewInput[] };

/** Owns shared review reuse, budget admission, current-revision checks and publication transactions. */
export abstract class LeadReviewRepository {
  /** Freezes a bounded case batch and reserves at most one provider call under the shared AI budget. */
  abstract claim(
    request: ScoutRunRequest,
    configuration: string,
  ): Promise<LeadReviewClaim>;
  /** Accepts only the exact unexpired input lease; snippets and stale documents cannot promote postings. */
  abstract complete(token: string, result: LeadReviewResult): Promise<void>;
  /** Retains the reserved budget and a bounded failure code; no raw provider error or prompt is stored. */
  abstract fail(
    token: string,
    reason: "provider_unavailable" | "invalid_evidence",
  ): Promise<void>;
}

/** Structured model access is isolated from core decisions and durable admission. */
export abstract class LeadReviewProvider {
  abstract readonly configuration: string;
  /** Returns passage-grounded public reviews without receiving an account or personal brief. */
  abstract review(inputs: LeadReviewInput[]): Promise<LeadReviewResult>;
}
