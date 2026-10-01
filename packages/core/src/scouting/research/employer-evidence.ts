import type { Posting } from "../domain/discovery.js";
import type {
  IntelligenceResult,
  PostingAnalysis,
} from "../intelligence/contracts.js";

export const researchFacts = [
  "location",
  "authorization",
  "sponsorship",
] as const;
export type ResearchFact = (typeof researchFacts)[number];

/** A bounded public employer document captured without account or profile data. */
export interface EmployerDocument {
  url: string;
  text: string;
  checkedAt: string;
  fingerprint: string;
}

/** Role applicability and source provenance remain visible even when research cannot resolve a question. */
export interface ResearchFinding {
  fact: ResearchFact;
  status: "resolved" | "unresolved" | "conflicting";
  applicability: "this_role" | "all_roles" | "unclear";
  explanation: string;
  value: string;
  quotes: string[];
  sourceUrl: string | null;
}

/** Public research expires independently of an unchanged job posting. */
export interface EmployerResearch {
  checkedAt: string;
  expiresAt: string;
  documents: EmployerDocument[];
  findings: ResearchFinding[];
}

/** Shared source access/cache lives behind a repository; private briefs never enter employer fetching. */
export abstract class EmployerEvidenceRepository {
  /** Reads at most two composition-approved pages, with bounded bytes/deadlines and shared refresh leases. */
  abstract read(posting: Posting): Promise<EmployerDocument[]>;
}

/** Research interpretation is separate from user fit; all paid work uses the common durable budget. */
export abstract class EmployerResearchProvider {
  abstract readonly configuration: string;
  /** Investigates missing public facts; general recruiting slogans cannot establish role-specific eligibility. */
  abstract investigate(
    posting: Posting,
    analysis: PostingAnalysis,
  ): Promise<IntelligenceResult & { kind: "research" }>;
}

/** Research only the relevant public gaps of an admitted candidate, never already-supported facts. */
export function needsEmployerResearch(analysis: PostingAnalysis): boolean {
  return (
    !analysis.research &&
    researchFacts.some((name) => analysis.facts[name].status !== "stated")
  );
}

/** Validates dated, bounded provenance and refuses unsupported scope or invented citations. */
export function validResearch(
  research: EmployerResearch,
  now = new Date(),
): boolean {
  const checked = Date.parse(research.checkedAt);
  const expires = Date.parse(research.expiresAt);
  if (
    !Number.isFinite(checked) ||
    !Number.isFinite(expires) ||
    checked > now.getTime() ||
    expires <= now.getTime() ||
    expires - checked > 6 * 60 * 60_000
  )
    return false;
  if (
    research.documents.length > 2 ||
    research.findings.length !== 3 ||
    new Set(research.findings.map((item) => item.fact)).size !== 3
  )
    return false;
  const documentsValid = research.documents.every(
    (doc) =>
      doc.url.startsWith("https://") &&
      doc.text.length <= 16_000 &&
      doc.fingerprint.length > 0 &&
      Number.isFinite(Date.parse(doc.checkedAt)) &&
      Date.parse(doc.checkedAt) <= checked &&
      checked - Date.parse(doc.checkedAt) < 6 * 60 * 60_000,
  );
  if (!documentsValid) return false;
  return research.findings.every((finding) => {
    const document = research.documents.find(
      (doc) => doc.url === finding.sourceUrl,
    );
    if (!researchFacts.includes(finding.fact)) return false;
    if (finding.status === "unresolved")
      return (
        finding.quotes.length === 0 ||
        (!!document &&
          finding.quotes.every(
            (quote) => quote.length >= 3 && document.text.includes(quote),
          ))
      );
    return (
      finding.applicability !== "unclear" &&
      !!document &&
      finding.quotes.length > 0 &&
      finding.quotes.every(
        (quote) => quote.length >= 3 && document.text.includes(quote),
      )
    );
  });
}

/** Preserves posting-specific facts; only supported missing facts may be supplemented by applicable employer evidence. */
export function applyEmployerResearch(
  analysis: PostingAnalysis,
  research: EmployerResearch,
): PostingAnalysis {
  if (!validResearch(research)) throw new Error("invalid_employer_evidence");
  const facts = { ...analysis.facts };
  for (const finding of research.findings) {
    if (
      facts[finding.fact].status !== "unknown" ||
      finding.status === "unresolved" ||
      finding.applicability === "unclear"
    )
      continue;
    facts[finding.fact] = {
      status: finding.status === "conflicting" ? "conflicting" : "stated",
      value: finding.value,
      quotes: finding.quotes,
    };
  }
  return { ...analysis, facts, research };
}

/** Makes source text available for citation validation without replacing the captured posting. */
export function researchText(analysis?: PostingAnalysis): string {
  return analysis?.research?.documents.map((doc) => doc.text).join("\n") ?? "";
}
