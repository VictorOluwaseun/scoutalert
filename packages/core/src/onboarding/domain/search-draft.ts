/** The explicit search answers a person can review before any scout is activated. */
export interface SearchDraft {
  goal: string;
  category: "employment" | "contracts" | "services";
  target: string;
  name: string;
  arrangement: "remote" | "hybrid" | "onsite" | "open" | "unknown";
  arrangementRequired: boolean;
  residence: string;
  workLocations: string;
  background: string;
  /** Explicit self-declaration, never inferred from residence or independently verified by ScoutAlert. */
  authorizationLocations?: string;
  sponsorshipNeed?: "not_needed" | "needed" | "unknown";
  authorizationConfirmed?: boolean;
  minimumPay: string;
  currency: "USD" | "EUR" | "GBP" | "NGN";
  payPeriod: "year" | "month" | "hour" | "project";
  unknownEligibility: "review" | "exclude";
  undisclosedPay: "include" | "exclude";
}

/** A change the person must make before their search details can be reviewed. */
export interface SearchIssue {
  field: keyof SearchDraft;
  code: "required" | "too_long" | "invalid_value";
  message: string;
}

/** A deterministic review decision; it does not imply interpretation or activation. */
export type SearchReview =
  { ready: true } | { ready: false; issues: SearchIssue[] };
