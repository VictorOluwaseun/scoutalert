import { randomUUID } from 'node:crypto';
import { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EmailProvider, EmailTemplates } from '@repo/core/notifications';
import { EmailModule } from '../src/composition/email.module.js';

interface CapturedMessage {
  ID: string;
}

/** Restricts inbox inspection to the synthetic message submitted by this integration test. */
async function findCapturedMessage(
  messageId: string,
): Promise<CapturedMessage> {
  const origin = process.env.MAILPIT_HTTP_URL ?? 'http://127.0.0.1:8025';
  const url = new URL('/api/v1/search', origin);
  url.searchParams.set('query', `message-id:${messageId.replace(/[<>]/g, '')}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  expect(response.ok).toBe(true);
  const body = (await response.json()) as { messages: CapturedMessage[] };
  expect(body.messages).toHaveLength(1);

  return body.messages[0]!;
}

describe.skipIf(process.env.MAILPIT_INTEGRATION !== '1')(
  'Mailpit email integration',
  () => {
    let app: INestApplicationContext;

    beforeAll(async () => {
      vi.stubEnv('EMAIL_PROVIDER', 'mailpit');
      app = await Test.createTestingModule({
        imports: [EmailModule],
      }).compile();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
      vi.unstubAllEnvs();
    });

    it('captures the configured sender, single recipient, and both text and HTML through the real SMTP adapter', async () => {
      const text = `Local transport check ${randomUUID()}`;
      const recipient = 'integration-check@scoutalert.test';
      const submission = await app.get(EmailProvider).send({
        id: randomUUID(),
        recipient,
        subject: 'ScoutAlert Mailpit integration check',
        text,
        html: `<p>${text}</p>`,
      });
      expect(submission.status).toBe('accepted');

      const captured = await findCapturedMessage(submission.providerMessageId);
      const origin = process.env.MAILPIT_HTTP_URL ?? 'http://127.0.0.1:8025';
      const response = await fetch(
        new URL(`/api/v1/message/${captured.ID}`, origin),
        {
          signal: AbortSignal.timeout(5_000),
        },
      );
      expect(response.ok).toBe(true);
      const details = (await response.json()) as {
        From: { Address: string; Name: string };
        To: { Address: string }[];
        Subject: string;
        Text: string;
        HTML: string;
      };
      expect(details.From).toMatchObject({
        Address: process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@scoutalert.test',
        Name: process.env.EMAIL_FROM_NAME ?? 'ScoutAlert',
      });
      expect(details.To).toHaveLength(1);
      expect(details.To[0]?.Address).toBe(recipient);
      expect(details.Subject).toBe('ScoutAlert Mailpit integration check');
      expect(details.Text.trim()).toBe(text);
      expect(details.HTML.trim()).toBe(`<p>${text}</p>`);
    });

    it.each(['sign-in', 'digest', 'prompt', 'connection'] as const)(
      'captures the complete %s template as alternative MIME bodies',
      async (kind) => {
        const templates = app.get(EmailTemplates);
        const opportunity = {
          id: 'template-check',
          title: 'Remote design project',
          company: 'Example Studio',
          location: 'Remote',
          checkedAt: '2026-11-09T09:30:00Z',
          url: 'https://example.com/project',
          scouts: ['Design projects'],
          reasons: ['Remote delivery is explicitly supported.'],
          uncertainties: ['Confirm the project budget.'],
        };
        const content = {
          'sign-in': () =>
            templates.signInCode({ code: '123456', expiresInMinutes: 10 }),
          digest: () =>
            templates.opportunities({
              kind: 'digest',
              opportunities: [opportunity],
            }),
          prompt: () =>
            templates.opportunities({
              kind: 'prompt',
              opportunities: [opportunity],
            }),
          connection: () => templates.connectionCheck(),
        }[kind]();
        const submission = await app.get(EmailProvider).send({
          id: randomUUID(),
          recipient: 'template-check@scoutalert.test',
          ...content,
        });
        const captured = await findCapturedMessage(
          submission.providerMessageId,
        );
        const origin = process.env.MAILPIT_HTTP_URL ?? 'http://127.0.0.1:8025';
        const response = await fetch(
          new URL(`/api/v1/message/${captured.ID}`, origin),
          { signal: AbortSignal.timeout(5_000) },
        );
        expect(response.ok).toBe(true);
        const message = (await response.json()) as {
          Text: string;
          HTML: string;
          Subject: string;
        };
        expect(message.Subject).toBe(content.subject);
        expect(message.Text.trim().replaceAll('\r\n', '\n')).toBe(content.text);
        expect(message.HTML.trim().replaceAll('\r\n', '\n')).toBe(content.html);
      },
    );
  },
);
