import {
  EmailProvider,
  EmailSubmissionError,
  type EmailMessage,
  type EmailSubmission,
} from "@repo/core/notifications";
import type { SmtpClient } from "../../clients/email/smtp-client.js";

/** Sender identity supplied by validated composition configuration. */
export interface EmailSender {
  readonly address: string;
  readonly name: string;
}

/** Implements the core email port through SMTP; Mailpit captures this transport during local development. */
export class SmtpEmailProvider extends EmailProvider {
  /** Receives the shared client and sender; does not create connections or own product delivery policy. */
  constructor(
    private readonly client: Pick<SmtpClient, "sendMail">,
    private readonly sender: EmailSender,
  ) {
    super();
  }

  /** Submits one recipient with a stable MIME ID. No retries are performed and acceptance is not inbox delivery. */
  async send(message: EmailMessage): Promise<EmailSubmission> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(message.id)) {
      throw new TypeError(
        "Email message IDs must contain 1–128 letters, digits, underscores, or hyphens.",
      );
    }

    if (!/^[^\s@<>,;]+@[^\s@<>,;]+$/.test(message.recipient)) {
      throw new TypeError(
        "Email messages require one plain recipient address.",
      );
    }

    const domain = this.sender.address.split("@")[1];
    const result = await this.client
      .sendMail({
        from: this.sender,
        to: { address: message.recipient, name: "" },
        envelope: { from: this.sender.address, to: [message.recipient] },
        messageId: `<${message.id}@${domain}>`,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
      .catch((cause: unknown) => {
        throw new EmailSubmissionError("unknown", { cause });
      });

    if (result.rejected.length > 0) {
      throw new EmailSubmissionError("rejected");
    }

    if (result.accepted.length !== 1) {
      throw new EmailSubmissionError("unknown");
    }

    return { status: "accepted", providerMessageId: result.messageId };
  }
}
