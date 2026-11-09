import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import type {
  EmailConfiguration,
  SmtpClient,
} from '@repo/adapters/notifications';
import { EmailProvider, EmailTemplates } from '@repo/core/notifications';
import {
  EmailModule,
  EMAIL_CONFIGURATION,
  SMTP_CLIENT,
} from '../composition/email.module.js';
import { loadLocalEnvironment } from '../config/environment.js';

/** Verifies connectivity without sending; an explicit --to address authorizes one diagnostic email through the API binding. */
async function checkEmail(): Promise<void> {
  loadLocalEnvironment();
  const { values } = parseArgs({ options: { to: { type: 'string' } } });
  if (values.to !== undefined && !z.email().safeParse(values.to).success) {
    throw new Error('Provide one valid recipient with --to.');
  }
  const app = await NestFactory.createApplicationContext(EmailModule, {
    logger: false,
    abortOnError: false,
  });

  try {
    const configuration = app.get<EmailConfiguration>(EMAIL_CONFIGURATION);
    await app.get<SmtpClient>(SMTP_CLIENT).verify();
    console.log(
      `${configuration.provider === 'smtp' ? 'Authenticated TLS SMTP' : 'Mailpit'} connection verified.`,
    );
    if (!values.to) {
      console.log(
        'No message sent. Use --to=your-address to test sender acceptance and inbox arrival.',
      );
      return;
    }
    const result = await app.get(EmailProvider).send({
      id: randomUUID(),
      recipient: values.to,
      ...app.get(EmailTemplates).connectionCheck(),
    });
    console.log(
      `SMTP accepted the test email: ${result.providerMessageId}. Check the recipient inbox; acceptance does not prove delivery.`,
    );
  } finally {
    await app.close();
  }
}

await checkEmail().catch(() => {
  console.error(
    'Email check failed. Check email settings, recipient syntax, provider access and verified sender status. Provider errors and credentials are not printed.',
  );
  process.exitCode = 1;
});
