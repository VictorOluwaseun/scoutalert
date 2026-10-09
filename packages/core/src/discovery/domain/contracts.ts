import type { SearchDraft } from "../../onboarding/domain/search-draft.js";
import type {
  Posting,
  ScoutRunRequest,
} from "../../scouting/domain/discovery.js";

/** Provider capabilities describe the access actually enabled, independently of vendor identity. */
export interface SearchCapability {
  id: string;
  configuration: string;
  access: "public_index";
  language: string;
  country: string | null;
  requestCostMicros: number;
}

/** Public intent only: no account identifiers, private profile, residence or full brief is sent to search. */
export interface WebSearchQuery {
  query: string;
  language: string;
  country: string | null;
  freshness: "month";
  page: number;
  limit: number;
}

/** A search observation is a discovery hint; a snippet is never proof of eligibility or availability. */
export interface SearchObservation {
  url: string;
  title: string | null;
  snippet: string | null;
  rank: number;
}

/** Bounded provider results preserve truncation and pagination instead of claiming exhaustive coverage. */
export interface WebSearchResult {
  kind: "search";
  observations: SearchObservation[];
  checkedAt: string;
  completeness: "window";
  nextPage: number | null;
}

/** Captured public content is separate from both private fit and a normalized formal opportunity. */
export interface SourceDocumentResult {
  nativePost?: import("./social-discovery.js").NativePost;
  nativeContext?: import("./social-context.js").NativeContext;
  /** Incomplete text, native context or browser captures cannot authorize publication as complete evidence. */
  truncated?: boolean;
  kind: "document";
  url: string;
  checkedAt: string;
  status: "fetched" | "access_limited" | "unavailable" | "blocked";
  reason: string | null;
  text: string | null;
  fingerprint: string | null;
  /** A formal listing is promoted only when its required fields are explicitly present in source evidence. */
  posting: Posting | null;
  hostDelaySeconds: number;
  /** Bounded observed anchors, never model-invented destinations; absent on older captures. */
  links?: { url: string; text: string }[];
  /** Observed public GET search forms; only the frozen public target may fill the named field. */
  searchForms?: {
    action: string;
    field: string;
    parameters: [string, string][];
  }[];
  /** Observed source pagination with a stable result signature for loop detection. */
  pagination?: { next: string[]; contentFingerprint: string };
  /** Exact public API used for this source observation; provider data is never relabeled as an HTML capture. */
  publicApi?: { provider: "ashby"; url: string; snapshotFingerprint: string };
  /** Bounded page-bundle accounting, including robots and browser resources; absent on older captures. */
  capture?: {
    method: "http" | "browser" | "public_api";
    cacheHit?: boolean;
    requests: number;
    bytes: number;
    complete: boolean;
  };
}

export type DiscoveryOperation =
  { kind: "search"; query: WebSearchQuery } | { kind: "document"; url: string };
export type DiscoveryOperationResult = WebSearchResult | SourceDocumentResult;

/** Finite, revision-bound plan; mandatory requirements remain in the confirmed private brief. */
export interface DiscoveryPlan {
  origin?: "source_monitor" | "native_social";
  policy: "public-intent-v1" | "public-intent-v2" | "public-intent-v3";
  strategy?: import("./reasoning.js").ScoutSearchStrategy;
  scoutVersion: number;
  category: SearchDraft["category"];
  queries: WebSearchQuery[];
  maximumDocuments: number;
  deadlineSeconds: number;
  continuation: "explore_on_next_run";
  blockedReason: "public_intent_required" | null;
  /** Frozen public intent and finite exploration bounds; absent on historical fixed plans. */
  exploration?: {
    target: string;
    remote: boolean;
    maximumRounds: number;
    maximumSearches: number;
    maximumDepth: number;
    maximumSourcePages?: number;
  };
}

/** Operational limits bound attempts and shared spending; failed and ambiguous calls retain reservations. */
export interface DiscoveryLimits {
  dailySearchRequests: number;
  dailySearchMicros: number;
  dailyDocumentRequests: number;
  maximumConcurrentSearches: number;
  maximumDocuments: number;
  exploration?: {
    maximumDepth: number;
    maximumRounds: number;
    maximumSourcePages: number;
  };
}

/** Thin search boundary preserves provider semantics while keeping HTTP clients out of core services. */
export abstract class WebSearchProvider {
  abstract readonly capability: SearchCapability;
  /** Executes one explicitly admitted page with bounded time, size and result count. */
  abstract search(query: WebSearchQuery): Promise<WebSearchResult>;
}

/** Source retrieval includes network admission and crawl policy before any newly discovered content is read. */
export abstract class SourceDocumentRepository {
  /** Returns an explicit unresolved result for denied, redirected or inaccessible sources. */
  abstract read(url: string): Promise<SourceDocumentResult>;
}

export type DiscoveryClaim =
  | { status: "done" | "waiting" | "progress" }
  | { status: "planning"; snapshot: DiscoveryExploration }
  | {
      status: "claimed";
      key: string;
      token: string;
      operation: DiscoveryOperation;
    };

/** Owns all durable admission, shared reuse, fencing, provenance and owner-scoped publication. */
export abstract class WebDiscoveryRepository {
  /** Returns a current active brief only for the requested owner and revision. */
  abstract context(request: ScoutRunRequest): Promise<SearchDraft | null>;
  /** Returns the frozen plan for this owned revision, avoiding repeated planning after completion. */
  async preparedPlan(_request: ScoutRunRequest): Promise<DiscoveryPlan | null> {
    return null;
  }
  /** Idempotently freezes the plan; disabled access is recorded rather than presented as a completed search. */
  abstract open(
    request: ScoutRunRequest,
    plan: DiscoveryPlan,
    capability: SearchCapability | null,
  ): Promise<void>;
  /** Applies reusable results before admitting at most one paid or network operation under durable limits. */
  abstract claim(
    request: ScoutRunRequest,
    limits: DiscoveryLimits,
  ): Promise<DiscoveryClaim>;
  /** Completes only an unexpired lease; public results are linked to a scout on its next current-revision step. */
  abstract complete(
    key: string,
    token: string,
    result: DiscoveryOperationResult,
  ): Promise<void>;
  /** Preserves the spending reservation and records a bounded failure; retries do not repeat the same paid operation. */
  abstract fail(key: string, token: string): Promise<void>;
  /** Appends one evidence-linked decision only if its current case snapshot still matches. */
  abstract extend(
    request: ScoutRunRequest,
    snapshot: DiscoveryExploration,
    decision: DiscoveryDecision,
  ): Promise<void>;
}

/** Immutable operation history offered to a pure policy after all admitted steps have settled. */
export interface DiscoveryExploration {
  plan: DiscoveryPlan;
  round: number;
  /** Current public reviews only; excerpts remain routing hints, never facts. */
  reviews?: {
    url: string;
    scope: "source" | "search_excerpt";
    review: import("./lead-review.js").LeadReview;
  }[];
  operations: {
    key: string;
    depth: number;
    input: DiscoveryOperation;
    result: DiscoveryOperationResult | null;
  }[];
}

/** A single next action with an observed parent, or an explicit stopping reason. */
export interface DiscoveryDecision {
  reason:
    | "follow_source_link"
    | "search_source_site"
    | "continue_source_page"
    | "check_promising_result"
    | "continue_result_page"
    | "refine_demand_query"
    | "broaden_query_wording"
    | "exploration_limit"
    | "no_further_action";
  action: DiscoveryOperation | null;
  parentKey: string | null;
  depth: number;
  title: string | null;
}

/** Public leads may be incomplete and remain separate from assessed recommendations. */
export interface DiscoveryLeadView {
  nativePost?: import("./social-discovery.js").NativePost | null;
  nativeContext?: import("./social-context.js").NativeContext | null;
  review: {
    label:
      | "job_opening"
      | "client_request"
      | "service_offer"
      | "discussion"
      | "directory"
      | "closed"
      | "unclear";
    scope: "source" | "search_excerpt";
    explanation: string;
    quotes: string[];
    reviewedAt: string;
    facts: Record<
      string,
      { status: "stated" | "unknown" | "conflicting"; value: string }
    >;
  } | null;

  id: string;
  url: string;
  title: string | null;
  snippet: string | null;
  source: string;
  firstSeenAt: string;
  lastSeenAt: string;
  checkedAt: string | null;
  contentStatus: string;
  content: string | null;
  postingId: string | null;
  scouts: string[];
}

/** Activity states explain partial discovery and disabled access without implying whole-internet completeness. */
export interface DiscoveryCaseView {
  strategy?: import("./reasoning.js").ScoutSearchStrategy | null;
  /** Latest bounded planning decisions; omitted by historical API responses. */
  exploration?: {
    reason: string;
    kind: string | null;
    target: string | null;
  }[];
  reviewStatus: string | null;
  reviewReason: string | null;
  id: string;
  scoutId: string;
  scoutName: string;
  scoutVersion: number;
  provider: string | null;
  status: string;
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
  searchesCompleted: number;
  documentsChecked: number;
  leadCount: number;
}

export interface WebDiscoveryView {
  monitors?: import("./source-monitoring.js").SourceMonitorView[];
  cases: DiscoveryCaseView[];
  leads: DiscoveryLeadView[];
}

/** Private read contracts bind discovery observations to current, owned scout revisions. */
export abstract class WebDiscoveryCatalogRepository {
  /** Returns bounded recent activity and provisional leads for one verified account. */
  abstract read(ownerId: string): Promise<WebDiscoveryView>;
}
