import {
  EmailProvider,
  EmailSubmissionError,
  type EmailMessage,
  type EmailSubmission,
} from "./ports/email-provider.js";

/** Tries a secondary delivery port only when the primary explicitly proves that a safe fallback is possible. */
export class FallbackEmailProvider extends EmailProvider {
  /** Receives two configured providers; consent, durable reservations and message creation remain with the caller. */
  constructor(
    private readonly primary: EmailProvider,
    private readonly fallback: EmailProvider,
  ) {
    super();
  }

  /** Makes at most one attempt per provider, preserving the exact code, content and logical ID. Unknown outcomes never fail over. */
  async send(message: EmailMessage): Promise<EmailSubmission> {
    try {
      return await this.primary.send(message);
    } catch (error) {
      if (!(error instanceof EmailSubmissionError) || !error.fallbackAllowed) {
        throw error;
      }
    }

    return this.fallback.send(message);
  }
}
