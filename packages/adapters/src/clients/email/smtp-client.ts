import {
  createTransport,
  type SMTPPoolOptions,
  type SMTPPoolSentMessageInfo,
  type Transporter,
} from "nodemailer";

/** Infrastructure-only pooled SMTP client, owned and closed by a composition root. */
export type SmtpClient = Transporter<SMTPPoolSentMessageInfo, SMTPPoolOptions>;

/** Creates a reusable SMTP pool with bounded waits and no automatic requeue of uncertain submissions. */
export function createSmtpClient(options: SMTPPoolOptions): SmtpClient {
  return createTransport({
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    ...options,
    pool: true,
    maxRequeues: 0,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
