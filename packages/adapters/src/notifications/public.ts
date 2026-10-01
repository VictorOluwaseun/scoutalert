export {
  createSmtpClient,
  type SmtpClient,
} from "../clients/email/smtp-client.js";
export {
  SmtpEmailProvider,
  type EmailSender,
} from "./delivery/smtp-email-provider.js";

export { PostgresOpportunityDeliveryRepository } from "./persistence/postgres-opportunity-delivery.js";
