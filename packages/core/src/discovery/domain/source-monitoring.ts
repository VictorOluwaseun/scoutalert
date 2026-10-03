import type { ScoutRunRequest } from "../../scouting/domain/discovery.js";
import type { SourceDocumentResult } from "./contracts.js";
import type { LeadReview, LeadReviewInput } from "./lead-review.js";

/** A captured, reviewed page and its private interest are supplied separately; only the URL is shared. */
export interface MonitorCandidate {
  leadId: string;
  reviewKey: string;
  input: LeadReviewInput;
  review: LeadReview;
  document: SourceDocumentResult;
}

export type MonitorKind = "directory" | "posting" | "probe";
export type MonitorStatus =
  "active" | "deferred" | "pending_review" | "retired";

/** Public scheduling history, without subscriber identities or personal requirements. */
export interface SourceMonitor {
  id: string;
  url: string;
  kind: MonitorKind;
  depth: number;
  fingerprint: string | null;
  unchanged: number;
  failures: number;
}

/** Finite public monitoring work shares the existing document operation ledger and leases. */
export type MonitorClaim =
  | { status: "done" | "waiting" | "progress" }
  | { status: "claimed"; key: string; token: string; url: string }
  | {
      status: "observed";
      monitor: SourceMonitor;
      key: string;
      result: SourceDocumentResult | null;
    };

/** Scheduling decisions remain inspectable and do not equate source changes with personal relevance. */
export interface MonitorOutcome {
  status: MonitorStatus;
  reason: string;
  intervalMinutes: number;
  unchanged: number;
  failures: number;
  changed: boolean;
}

/** Durable shared monitoring, revision-bound subscriptions and recoverable downstream dispatch. */
export abstract class SourceMonitoringRepository {
  /** Reads only current, owned source evidence; snippets never qualify a source for monitoring. */
  abstract candidates(request: ScoutRunRequest): Promise<MonitorCandidate[]>;
  /** Rechecks the exact review and scout revision before adding or retiring a bounded subscription. */
  abstract subscribe(
    request: ScoutRunRequest,
    candidate: MonitorCandidate,
    kind: Exclude<MonitorKind, "probe"> | null,
  ): Promise<void>;
  /** Selects one due source with active interest and reserves from the same document budget as web searches. */
  abstract claim(
    dailyDocuments: number,
    concurrency: number,
  ): Promise<MonitorClaim>;
  /** Applies an operation once, records changes and discovered links, and queues current subscribers atomically. */
  abstract settle(
    claim: Extract<MonitorClaim, { status: "observed" }>,
    outcome: MonitorOutcome,
  ): Promise<void>;
  /** Coalesces pending observations into finite, source-only scout runs through the existing outbox. */
  abstract dispatch(): Promise<number>;
}

/** User-facing, owner-filtered source health; global subscriber counts and other accounts are not exposed. */
export interface SourceMonitorView {
  title: string | null;
  url: string;
  kind: MonitorKind;
  status: MonitorStatus;
  reason: string;
  checkedAt: string | null;
  nextCheckAt: string;
  checks: number;
  changes: number;
  discoveredLinks: number;
  scouts: string[];
}
