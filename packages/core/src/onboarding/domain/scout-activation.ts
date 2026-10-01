import type { DiscoveryStatus } from "../../scouting/domain/discovery.js";
import type { SearchDraft } from "./search-draft.js";

/** Explicit notification choices confirmed separately from signing in. */
export interface ScoutAlerts {
  frequency: "daily" | "weekly" | "dashboard";
  timezone: string;
  deliveryTime: string;
  weekday: string;
  promptAlerts: boolean;
  quietHours?: { start: string; end: string };
  consent: boolean;
  consentVersion: "opportunity-alerts-v1";
}

/** Owner-confirmed activation input; browser approval flags grant no authority. */
export interface ScoutActivation {
  key: string;
  search: SearchDraft;
  alerts: ScoutAlerts;
  confirmed: true;
}

/** Persisted receipt separates saving from downstream discovery execution. */
export interface ActivatedScout {
  id: string;
  name: string;
  status: "active" | "paused";
  discovery: DiscoveryStatus;
  activatedAt: string;
  search: SearchDraft;
  alerts: ScoutAlerts;
}

/** Expected activation failure mapped to a safe HTTP response by presentation. */
export class ActivationError extends Error {
  /** Creates a validation or idempotency conflict without exposing private search content. */
  constructor(
    public readonly code:
      "search_needs_changes" | "invalid_alerts" | "activation_conflict",
    public readonly detail?: string,
  ) {
    super(code);
    this.name = "ActivationError";
  }
}
