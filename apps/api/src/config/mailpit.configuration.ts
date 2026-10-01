import { z } from 'zod';

/** Validates local SMTP settings once before clients are constructed by the API composition root. */
const mailpitConfigurationSchema = z.object({
  MAILPIT_HOST: z.string().trim().min(1).default('127.0.0.1'),
  MAILPIT_SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  EMAIL_FROM_ADDRESS: z.email().default('no-reply@scoutalert.test'),
  EMAIL_FROM_NAME: z.string().trim().min(1).default('ScoutAlert'),
});

export type MailpitConfiguration = z.infer<typeof mailpitConfigurationSchema>;

/** Reads local Mailpit settings; production must deliberately compose a real delivery provider. */
export function readMailpitConfiguration(
  environment: Record<string, string | undefined> = process.env,
): MailpitConfiguration {
  if (environment.NODE_ENV === 'production') {
    throw new Error(
      'Mailpit is a local email provider. Configure a production email provider before deploying.',
    );
  }

  return mailpitConfigurationSchema.parse(environment);
}
