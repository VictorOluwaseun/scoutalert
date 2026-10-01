import type { ColumnType, Generated } from "kysely";
import type {
  ActivatedScout,
  ScoutAlerts,
  SearchDraft,
} from "@repo/core/onboarding";
import type { Assessment, OpportunityView } from "@repo/core/scouting";

type Timestamp = ColumnType<Date, Date | string, Date | string>;

/** Typed relational persistence shape; query and mapping details remain in adapters. */
export interface ScoutAlertDatabase {
  scout_change_requests: {
    owner_id: string;
    request_key: string;
    fingerprint: string;
    scout_id: string;
    receipt: import("@repo/core/scouts").ManagedScout;
    created_at: Timestamp;
  };
  opportunity_feedback: {
    owner_id: string;
    posting_id: string;
    value: import("@repo/core/scouts").OpportunityFeedback["value"];
    version: number;
    snapshot: OpportunityView;
    updated_at: Timestamp;
  };
  opportunity_feedback_events: {
    owner_id: string;
    request_key: string;
    posting_id: string;
    fingerprint: string;
    receipt: import("@repo/core/scouts").OpportunityFeedback;
    context: unknown;
    created_at: Generated<Timestamp>;
  };
  users: {
    id: string;
    email: string;
    verified_at: Timestamp;
    created_at: Generated<Timestamp>;
  };
  verification_flows: {
    browser_hash: string;
    current_id: string | null;
    updated_at: Timestamp;
  };
  email_verification_challenges: {
    id: string;
    browser_hash: string;
    email: string;
    code_digest: string;
    created_at: Timestamp;
    expires_at: Timestamp;
    failed_attempts: number;
    delivery: "pending" | "accepted" | "unknown" | "failed";
    consumed_at: Timestamp | null;
  };
  auth_sessions: {
    challenge_id: string;
    owner_id: string;
    token_hash: string;
    expires_at: Timestamp;
    revoked_at: Timestamp | null;
    created_at: Generated<Timestamp>;
  };
  onboarding_drafts: {
    id: string;
    owner_id: string;
    browser_hash: string;
    search: SearchDraft;
    revision: number;
    approved_revision: number;
    created_at: Timestamp;
  };
  scouts: {
    id: string;
    owner_id: string;
    draft_id: string;
    name: string;
    search: SearchDraft;
    version: number;
    status: "active" | "paused";
    discovery_status: import("@repo/core/scouting").DiscoveryStatus;
    activated_at: Timestamp;
    discovery_requested_at: ColumnType<
      Date,
      Date | string | undefined,
      Date | string
    >;
  };
  notification_preferences: {
    scout_id: string;
    owner_id: string;
    preferences: ScoutAlerts;
    email_enabled: boolean;
    version: number;
  };
  consent_events: {
    id: string;
    owner_id: string;
    scout_id: string;
    purpose: "opportunity_alerts";
    granted: boolean;
    wording_version: string;
    created_at: Timestamp;
  };
  activation_requests: {
    owner_id: string;
    request_key: string;
    fingerprint: string;
    scout_id: string;
    receipt: ActivatedScout;
    created_at: Timestamp;
  };
  outbox_events: {
    id: string;
    owner_id: string;
    aggregate_id: string;
    aggregate_version: number;
    event_type: "scout.initial_discovery_requested" | "scout.refresh_requested";
    deduplication_key: string;
    payload: { scoutId: string; ownerId: string; version: number };
    created_at: Timestamp;
    published_at: Timestamp | null;
    lease_token: Generated<string | null>;
    lease_until: Generated<Timestamp | null>;
    attempts: Generated<number>;
  };
  opportunity_sources: {
    kind: Generated<"job" | "client_request">;
    scope: Generated<"complete" | "window">;
    id: string;
    checked_at: Timestamp | null;
    last_error_at: Timestamp | null;
    lease_token: string | null;
    lease_until: Timestamp | null;
    posting_count: Generated<number>;
  };
  opportunity_postings: {
    kind: Generated<"job" | "client_request">;
    id: string;
    source_id: string;
    external_id: string;
    family_id: string;
    company: string;
    title: string;
    location: string;
    url: string;
    content: string;
    fingerprint: string;
    version: number;
    source_updated_at: Timestamp;
    checked_at: Timestamp;
    open: boolean;
    search_document: ColumnType<string, never, never>;
  };
  opportunity_evidence: {
    posting_id: string;
    version: number;
    snapshot: Record<string, unknown>;
    recorded_at: Timestamp;
  };
  discovery_runs: {
    id: string;
    scout_id: string;
    owner_id: string;
    scout_version: number;
    status:
      | "searching"
      | "completed"
      | "failed"
      | "cancelled"
      | "coverage_unavailable";
    started_at: Generated<Timestamp>;
    finished_at: Timestamp | null;
    match_count: Generated<number>;
  };
  scout_recommendations: {
    scout_id: string;
    owner_id: string;
    scout_version: number;
    posting_id: string;
    posting_version: number;
    assessment: Assessment;
    rank: number;
    created_at: Generated<Timestamp>;
  };
  opportunity_deliveries: {
    id: string;
    owner_id: string;
    window_key: string;
    recipient: string;
    contents: {
      opportunities: OpportunityView[];
      contributions: {
        scoutId: string;
        scoutVersion: number;
        preferenceVersion: number;
        postingId: string;
        postingVersion: number;
      }[];
    };
    status: "submitting" | "accepted" | "rejected" | "unknown";
    provider_message_id: string | null;
    created_at: Generated<Timestamp>;
    finished_at: Timestamp | null;
  };
  opportunity_delivery_items: {
    owner_id: string;
    posting_id: string;
    delivery_id: string;
  };
  delivery_scan_cursor: {
    id: 1;
    after_owner: string | null;
  };
  intelligence_run_batches: {
    run_id: string;
    configuration: string;
    selected: string[];
  };
  intelligence_tasks: {
    id: string;
    kind: "extraction" | "research" | "fit";
    analysis_task_id: Generated<string | null>;
    configuration: string;
    posting_id: string;
    posting_version: number;
    owner_id: string | null;
    scout_id: string | null;
    scout_version: number | null;
    status: Generated<"pending" | "running" | "ready" | "failed">;
    result: import("@repo/core/scouting").IntelligenceResult | null;
    lease_token: string | null;
    lease_until: Timestamp | null;
    retry_at: Timestamp | null;
    attempts: Generated<number>;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
  };
  intelligence_daily_budget: {
    day: string;
    requests: number;
    reserved_microusd: Generated<string>;
  };
  intelligence_attempts: {
    id: string;
    task_id: string;
    started_at: Generated<Timestamp>;
    finished_at: ColumnType<
      Date | null,
      Date | string | null | undefined,
      Date | string | null
    >;
    outcome: Generated<
      | "ready"
      | "provider_unavailable"
      | "invalid_evidence"
      | "superseded"
      | null
    >;
    usage: Generated<import("@repo/core/scouting").AnalysisUsage | null>;
    cost: Generated<{
      currency: "USD";
      pricingVersion: string;
      source: string;
      estimatedMicrousd: number;
    } | null>;
  };
}
