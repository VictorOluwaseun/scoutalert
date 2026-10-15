export { GreenhouseSourceConnector } from "./connectors/greenhouse-source.js";
export { PostgresSourceRepository } from "./persistence/postgres-sources.js";
export { PostgresScoutingRepository } from "./persistence/postgres-scouting.js";
export { PostgresDiscoveryIntentRepository } from "./persistence/postgres-intents.js";
export { PostgresOpportunityCatalogRepository } from "./persistence/postgres-opportunities.js";

export {
  OpenAIIntelligenceProvider,
  createIntelligenceClient,
} from "./intelligence/openai-intelligence.js";
export { PostgresIntelligenceRepository } from "./intelligence/postgres-intelligence.js";

export { PostgresAvailabilityRepository } from "./research/postgres-availability.js";
export { GreenhouseAvailabilitySource } from "./research/greenhouse-availability.js";

export { PostgresEmployerEvidenceRepository } from "./research/postgres-employer-evidence.js";
export { OpenAIEmployerResearchProvider } from "./research/openai-employer-research.js";
export { estimateIntelligenceCost } from "./intelligence/usage-cost.js";

export {
  FreelancerSourceConnector,
  FreelancerAvailabilitySource,
  normalizeFreelancerProject,
} from "./connectors/freelancer-source.js";
export {
  SourceConnectorRouter,
  AvailabilitySourceRouter,
} from "./connectors/source-router.js";
export { PostgresRelevanceFeedbackRepository } from "./persistence/postgres-relevance-feedback.js";
export { evidencePassages } from "./intelligence/evidence-passages.js";
