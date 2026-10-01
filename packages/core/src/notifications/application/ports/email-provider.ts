/** Provider-independent content for one recipient; callers supply a stable logical message ID. */
export interface EmailMessage {
  /** Stable 1–128 character identifier using letters, digits, underscores, or hyphens; supports tracing, not provider deduplication. */
  readonly id: string;
  /** One normalized plain mailbox address, without display names or address lists. */
  readonly recipient: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/** Provider acceptance is distinct from delivery to the recipient's inbox. */
export interface EmailSubmission {
  readonly status: "accepted";
  readonly providerMessageId: string;
}

/** Normalizes submission failures without exposing a provider SDK to application use cases. */
export class EmailSubmissionError extends Error {
  /** Marks explicit rejection or an uncertain submission; uncertain outcomes require reconciliation before retry. */
  constructor(
    readonly outcome: "rejected" | "unknown",
    options?: { cause: unknown },
  ) {
    super("The email submission was not confirmed.", options);
    this.name = "EmailSubmissionError";
  }
}

/** Outbound email port; identity and notification use cases own authorization, consent, and durable dispatch. */
export abstract class EmailProvider {
  /** Submits one message after caller eligibility checks. Exceptions do not prove that no email was accepted. */
  abstract send(message: EmailMessage): Promise<EmailSubmission>;
}
