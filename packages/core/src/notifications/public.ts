export {
  EmailProvider,
  EmailSubmissionError,
  type EmailMessage,
  type EmailSubmission,
} from "./application/ports/email-provider.js";

export {
  OpportunityDeliveryRepository,
  DeliverOpportunityDigests,
  digestWindow,
} from "./application/opportunity-digest.js";
export type {
  DigestCandidate,
  PreparedDigest,
} from "./application/opportunity-digest.js";

export {
  promptWindow,
  isPromptMatch,
  hasUnavailablePosting,
  hasOutdatedAssessment,
} from "./application/prompt-policy.js";
