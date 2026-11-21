export {
  EmailProvider,
  EmailSubmissionError,
  type EmailMessage,
  type EmailSubmission,
} from "./application/ports/email-provider.js";

export { FallbackEmailProvider } from "./application/fallback-email-provider.js";

export {
  EmailTemplates,
  type EmailContent,
  type OpportunityEmailInput,
} from "./application/ports/email-templates.js";

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
