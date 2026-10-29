export type {
  DiscoveryStatus,
  DiscoverySummary,
  ScoutRunRequest,
  SourceSnapshot,
  Posting,
  Assessment,
  OpportunityView,
  RunContext,
} from "./domain/discovery.js";
export { roleTerms, assessPosting } from "./domain/assess-posting.js";
export {
  SourceRepository,
  SourceConnector,
  ScoutingRepository,
  DiscoveryIntentRepository,
  OpportunityCatalogRepository,
} from "./application/ports.js";
export {
  RefreshSource,
  ScoutOpportunities,
} from "./application/scout-opportunities.js";
export { ReadOpportunityFeed } from "./application/read-opportunity-feed.js";

export * from "./intelligence/contracts.js";
export * from "./intelligence/token-budget.js";
export {
  validAnalysis,
  validFit,
  assessPersonalFit,
  postingEvidence,
  briefEvidence,
} from "./intelligence/evidence-policy.js";
export { EvaluateCandidates } from "./intelligence/evaluate-candidates.js";
export type { AssessmentDetail } from "./domain/discovery.js";

export { normalizeCompensation } from "./intelligence/compensation.js";

export {
  AvailabilityRepository,
  AvailabilitySource,
  ResearchAvailability,
} from "./research/availability.js";
export type { AvailabilityEvidence } from "./research/availability.js";

export * from "./research/employer-evidence.js";

export * from "./ranking/relevance-feedback.js";
export { normalizeArrangement } from "./intelligence/arrangement-policy.js";
