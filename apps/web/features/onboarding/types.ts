export type Stage =
  | "goal"
  | "focus"
  | "preferences"
  | "review"
  | "alerts"
  | "email"
  | "verify"
  | "ready"
  | "explore";
export type Category = "employment" | "contracts" | "services";
export type Arrangement = "remote" | "hybrid" | "onsite" | "open" | "unknown";
export type Frequency = "daily" | "weekly" | "dashboard";

/** Browser-only view model; it contains no account, verified identity, or delivery state. */
export interface ScoutDraft {
  goal: string;
  category: Category;
  target: string;
  name: string;
  arrangement: Arrangement;
  arrangementRequired: boolean;
  residence: string;
  workLocations: string;
  background: string;
  authorizationLocations?: string;
  sponsorshipNeed?: "not_needed" | "needed" | "unknown";
  authorizationConfirmed?: boolean;
  minimumPay: string;
  currency: "USD" | "EUR" | "GBP" | "NGN";
  payPeriod: "year" | "month" | "hour" | "project";
  unknownEligibility: "review" | "exclude";
  undisclosedPay: "include" | "exclude";
  frequency: Frequency;
  timezone: string;
  deliveryTime: string;
  weekday: string;
  promptAlerts: boolean;
  quietStart: string;
  quietEnd: string;
  alertConsent: boolean;
}

export interface StepProps {
  draft: ScoutDraft;
  /** Updates presentation state; no interpretation, persistence query, or remote work is performed. */
  update: (patch: Partial<ScoutDraft>) => void;
  /** Advances after the screen's applicable local or server validation succeeds. */
  next: () => void;
  error: string;
}

/** Creates a fresh editable brief without assuming residence, eligibility, or consent. */
export function createDraft(): ScoutDraft {
  return {
    goal: "",
    category: "employment",
    target: "",
    name: "",
    arrangement: "unknown",
    arrangementRequired: false,
    residence: "",
    workLocations: "",
    background: "",
    authorizationLocations: "",
    sponsorshipNeed: "unknown",
    authorizationConfirmed: false,
    minimumPay: "",
    currency: "USD",
    payPeriod: "year",
    unknownEligibility: "review",
    undisclosedPay: "include",
    frequency: "daily",
    timezone: "",
    deliveryTime: "08:00",
    weekday: "Monday",
    promptAlerts: false,
    quietStart: "20:00",
    quietEnd: "08:00",
    alertConsent: false,
  };
}
