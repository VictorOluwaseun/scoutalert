import type { SearchDraft } from "../../onboarding/domain/search-draft.js";

/** Business discovery state, independent of the workflow engine's execution history. */
export type DiscoveryStatus =
  "pending" | "searching" | "completed" | "failed" | "coverage_unavailable";

/** Stable input identity; only the authoritative repository can authorize its revision. */
export interface ScoutRunRequest {
  scoutId: string;
  ownerId: string;
  version: number;
  runId: string;
}

/** A validated public source batch; only complete snapshots may expire absent postings. */
export interface SourceSnapshot {
  source: string;
  /** Windowed feeds never establish that an absent posting is closed. */
  scope?: "complete" | "window";
  kind?: "job" | "client_request";
  checkedAt: string;
  postings: Posting[];
}

/** Public posting variant with evidence retained separately from a person's assessment. */
export interface Posting {
  kind?: "job" | "client_request";
  id: string;
  source: string;
  externalId: string;
  familyId: string;
  company: string | null;
  title: string;
  location: string | null;
  url: string;
  text: string;
  sourceUpdatedAt: string | null;
  fingerprint: string;
  version: number;
}

/** Conservative initial assessment; retrieval relevance is not a probability of being hired. */
export interface Assessment {
  ranking?: { policy: "relevance-feedback-v1"; boost: number; terms: string[] };
  policy: "evidence-v1" | "personal-fit-v1";
  detail?: AssessmentDetail;
  reasons: string[];
  uncertainties: string[];
  rank: number;
}

/** Evidence-linked personal assessment with explicit unresolved research questions. */
export interface AssessmentDetail {
  assessedBy: "ai";
  verificationPolicy?:
    "supported-criteria-v2" | "supported-criteria-v3" | "supported-criteria-v4";
  employerResearch?: Omit<
    import("../research/employer-evidence.js").EmployerResearch,
    "documents"
  > & {
    documents: Omit<
      import("../research/employer-evidence.js").EmployerDocument,
      "text"
    >[];
  };
  criteria: import("../intelligence/contracts.js").FitCriterion[];
  research: { criterion: string; question: string; status: "unresolved" }[];
}

/** Account-owned recommendation with public evidence and current scout contributions. */
export interface OpportunityView {
  /** Web demand must have recent actionable source evidence before any email. */
  requiresFreshSource?: boolean;
  kind?: "job" | "client_request";
  feedback?: import("../../scouts/application/opportunity-feedback.js").OpportunityFeedback;
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  checkedAt: string;
  scouts: string[];
  detail?: AssessmentDetail | null;
  assessmentScout?: string | null;
  availability?:
    import("../research/availability.js").AvailabilityEvidence | null;
  reasons: string[];
  uncertainties: string[];
}

/** Captured version and brief, used only within a bounded discovery run. */
export interface RunContext {
  request: ScoutRunRequest;
  search: SearchDraft;
}

/** Bounded private read model makes coverage, completed checks and uncertain deliveries visible. */
export interface DiscoverySummary {
  sources: {
    id: string;
    checkedAt: string | null;
    failedAt: string | null;
    postingCount: number;
  }[];
  runs: {
    scoutId: string;
    status: string;
    finishedAt: string | null;
    matchCount: number;
  }[];
  email: {
    acceptedAt: string | null;
    uncertainCount: number;
    rejectedCount: number;
  };
}
