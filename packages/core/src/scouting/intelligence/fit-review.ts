import type { SearchDraft } from "../../onboarding/domain/search-draft.js";
import type { Posting } from "../domain/discovery.js";
import {
  assessPersonalFit,
  postingEvidence,
  validFit,
} from "./evidence-policy.js";
import type {
  IntelligenceResult,
  PersonalFit,
  PostingAnalysis,
} from "./contracts.js";

export type FitReviewReason =
  | "conflicting_evidence"
  | "conditional_requirements"
  | "complex_client_request"
  | "sample_audit";

/** Compact original evidence accompanies the mini verdict; omitted source text remains explicitly incomplete. */
export interface FitReviewRequest {
  reason: FitReviewReason;
  baseline: PersonalFit;
  sources: {
    url: string;
    observedAt: string | null;
    text: string;
    complete: boolean;
  }[];
}

/** Independent private review cannot fetch sources or waive the domain's evidence requirements. */
export abstract class FitReviewProvider {
  abstract readonly configuration: string;
  /** Returns a cited correction or confirms the baseline; the application validates it before publication. */
  abstract review(
    search: SearchDraft,
    analysis: PostingAnalysis,
    request: FitReviewRequest,
  ): Promise<IntelligenceResult & { kind: "fit" }>;
}

const conditional =
  /\b(?:only if|provided that|subject to|unless|except for|must (?:reside|be based|hold|have)|required to (?:attend|travel)|eligible only|conditional on)\b/iu;
const procurement =
  /\b(?:mandatory requirements|supplier registration|professional indemnity|liability insurance|security clearance|evaluation criteria|subcontracting|data residency|procurement eligibility)\b/giu;

/** Routes on observable evidence problems, never model confidence; missing source facts alone do not justify escalation. */
export function fitReviewReason(
  posting: Posting,
  search: SearchDraft,
  analysis: PostingAnalysis,
  fit: PersonalFit,
  auditPercent: number,
): FitReviewReason | null {
  if (!validFit(posting, search, fit, analysis)) {
    return null;
  }
  if (
    Object.values(analysis.facts).some(
      (fact) => fact.status === "conflicting" && fact.quotes.length > 1,
    )
  ) {
    return "conflicting_evidence";
  }
  const text = [
    postingEvidence(posting),
    ...(analysis.research?.documents.map((doc) => doc.text) ?? []),
  ].join("\n");
  if (conditional.test(text)) {
    return "conditional_requirements";
  }
  if (
    posting.kind === "client_request" &&
    new Set((text.match(procurement) ?? []).map((term) => term.toLowerCase()))
      .size >= 2
  ) {
    return "complex_client_request";
  }
  const accepted = assessPersonalFit(search, analysis, fit) !== null;
  // Include the baseline outcome so accepted and rejected cases each receive a deterministic sample.
  const identity = JSON.stringify([
    posting.id,
    posting.version,
    posting.fingerprint,
    search,
    accepted,
  ]);
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index++) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619) >>> 0;
  }
  return hash % 100 < auditPercent ? "sample_audit" : null;
}

/** Retains exact paragraphs containing cited evidence or consequential conditions. Partial packets cannot upgrade a baseline criterion. */
function compactEvidence(
  text: string,
  quotes: string[],
): { text: string; complete: boolean } {
  if (text.length <= 6_000) {
    return { text, complete: true };
  }
  const selected = text
    .split(/\n+/u)
    .filter(
      (paragraph) =>
        conditional.test(paragraph) ||
        /\b(?:remote|onsite|on-site|restricted|must|required|deadline|eligible|insurance|residen|authorization)\b/iu.test(
          paragraph,
        ) ||
        quotes.some((quote) => paragraph.includes(quote)),
    );
  let captured = "";
  for (const paragraph of selected) {
    if (captured.length + paragraph.length + 1 > 6_000) {
      continue;
    }
    captured += `${paragraph}\n`;
  }
  return { text: captured.trim(), complete: false };
}

/** Builds a private review packet from immutable source text; summaries never substitute for original quotations. */
export function fitReviewRequest(
  posting: Posting,
  analysis: PostingAnalysis,
  baseline: PersonalFit,
  reason: FitReviewReason,
): FitReviewRequest {
  const quotes = [
    ...Object.values(analysis.facts).flatMap((fact) => fact.quotes),
    ...baseline.criteria.flatMap((item) => item.quotes),
  ];
  return {
    reason,
    baseline,
    sources: [
      {
        url: posting.url,
        observedAt: posting.sourceUpdatedAt,
        ...compactEvidence(postingEvidence(posting), quotes),
      },
      ...(analysis.research?.documents.map((doc) => ({
        url: doc.url,
        observedAt: doc.checkedAt,
        ...compactEvidence(doc.text, quotes),
      })) ?? []),
    ],
  };
}

/** Applies the existing evidence rules and refuses new positive conclusions from a packet that omitted source content. */
export function validReviewedFit(
  posting: Posting,
  search: SearchDraft,
  analysis: PostingAnalysis,
  request: FitReviewRequest,
  fit: PersonalFit,
): boolean {
  if (!validFit(posting, search, fit, analysis)) {
    return false;
  }
  if (request.sources.every((source) => source.complete)) {
    return true;
  }
  return fit.criteria.every(
    (item) =>
      item.status !== "meets" ||
      request.baseline.criteria.find(
        (baseline) => baseline.criterion === item.criterion,
      )?.status === "meets",
  );
}
