import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { EmailProvider } from '@repo/core/notifications';
import { EmailModule } from '../composition/email.module.js';
import { loadLocalEnvironment } from '../config/environment.js';

/** Sends a synthetic local message using the same module binding as the API, then closes its SMTP pool. */
async function checkEmail(): Promise<void> {
  loadLocalEnvironment();
  const app = await NestFactory.createApplicationContext(EmailModule, {
    logger: ['error', 'warn'],
  });

  try {
    const result = await app.get(EmailProvider).send({
      id: randomUUID(),
      recipient: 'email-check@scoutalert.test',
      subject: 'ScoutAlert local email connection check',
      text: 'ScoutAlert is connected to Mailpit. This is a local transport check, not an account verification or opportunity alert.',
      html: '<p>ScoutAlert is connected to Mailpit.</p><p>This is a local transport check, not an account verification or opportunity alert.</p>',
    });
    console.log(`Mailpit accepted the test email: ${result.providerMessageId}`);
  } finally {
    await app.close();
  }
}

await checkEmail();
