import { SmtpEmailProvider } from '@repo/adapters/notifications';
import {
  EmailSubmissionError,
  FallbackEmailProvider,
} from '@repo/core/notifications';

const sender = { address: 'no-reply@scoutalert.test', name: 'ScoutAlert' };
const message = {
  id: 'submission-123',
  recipient: 'email-check@scoutalert.test',
  subject: 'Local check',
  text: 'Local transport check.',
};

describe('SMTP email submission outcomes', () => {
  it('uses the verified sender, reply address and stable identity without adding credentials to messages', async () => {
    const client = {
      sendMail: vi.fn().mockResolvedValue({
        accepted: [message.recipient],
        rejected: [],
        messageId: '<submission-123@scoutalert.dev>',
      }),
    };
    const provider = new SmtpEmailProvider(client, {
      address: 'alerts@scoutalert.dev',
      name: 'ScoutAlert',
      replyTo: 'support@scoutalert.dev',
    });
    await expect(provider.send(message)).resolves.toEqual({
      status: 'accepted',
      providerMessageId: '<submission-123@scoutalert.dev>',
    });
    expect(client.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { address: 'alerts@scoutalert.dev', name: 'ScoutAlert' },
        replyTo: 'support@scoutalert.dev',
        envelope: { from: 'alerts@scoutalert.dev', to: [message.recipient] },
        messageId: '<submission-123@scoutalert.dev>',
      }),
    );
  });

  it('keeps an incomplete acknowledgement uncertain rather than declaring rejection', async () => {
    const client = {
      sendMail: vi.fn().mockResolvedValue({
        accepted: [],
        rejected: [],
        messageId: '<submission-123@scoutalert.test>',
      }),
    };
    const provider = new SmtpEmailProvider(client, sender);

    await expect(provider.send(message)).rejects.toMatchObject({
      outcome: 'unknown',
    });
  });

  it('does not report a rejected recipient as accepted', async () => {
    const client = {
      sendMail: vi.fn().mockResolvedValue({
        accepted: [],
        rejected: [message.recipient],
        messageId: '<submission-123@scoutalert.test>',
      }),
    };
    const provider = new SmtpEmailProvider(client, sender);

    await expect(provider.send(message)).rejects.toMatchObject({
      outcome: 'rejected',
    });
  });

  it('preserves uncertainty after a connection failure and performs no automatic second send', async () => {
    const cause = new Error('Connection ended before acknowledgement.');
    const client = { sendMail: vi.fn().mockRejectedValue(cause) };
    const provider = new SmtpEmailProvider(client, sender);

    await expect(provider.send(message)).rejects.toMatchObject({
      name: EmailSubmissionError.name,
      outcome: 'unknown',
      cause,
    });
    expect(client.sendMail).toHaveBeenCalledTimes(1);
  });

  it('rejects multiple recipients or invalid logical IDs before sending', async () => {
    const client = { sendMail: vi.fn() };
    const provider = new SmtpEmailProvider(client, sender);

    await expect(
      provider.send({
        ...message,
        recipient: 'one@example.test,two@example.test',
      }),
    ).rejects.toThrow(TypeError);
    await expect(
      provider.send({ ...message, id: 'invalid\r\nheader' }),
    ).rejects.toThrow(TypeError);
    expect(client.sendMail).not.toHaveBeenCalled();
  });

  it.each([
    { code: 'EDNS', command: 'CONN' },
    { code: 'ESOCKET', command: 'CONN', syscall: 'connect' },
    { code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535 },
    { code: 'ETLS', command: 'STARTTLS' },
    { code: 'EENVELOPE', command: 'MAIL FROM', responseCode: 550 },
    { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 451 },
    { code: 'EENVELOPE', command: 'DATA', responseCode: 452 },
    { code: 'EMESSAGE', command: 'DATA', responseCode: 451 },
  ])(
    'permits one fallback for a proven safe provider failure: %j',
    async (failure) => {
      const primary = new SmtpEmailProvider(
        { sendMail: vi.fn().mockRejectedValue(failure) },
        sender,
      );
      const fallback = {
        send: vi
          .fn()
          .mockResolvedValue({
            status: 'accepted',
            providerMessageId: 'backup-id',
          }),
      };
      const provider = new FallbackEmailProvider(primary, fallback);
      await expect(provider.send(message)).resolves.toMatchObject({
        providerMessageId: 'backup-id',
      });
      expect(fallback.send).toHaveBeenCalledExactlyOnceWith(message);
    },
  );

  it.each([
    { code: 'ECONNECTION', command: 'CONN' },
    { code: 'ESOCKET', command: 'CONN', syscall: 'read' },
    { code: 'ETIMEDOUT', command: 'CONN' },
    { code: 'ETIMEDOUT', command: 'DATA' },
    { code: 'ESTREAM', command: 'DATA' },
    { code: 'EMESSAGE', command: 'DATA', responseCode: 250 },
    { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 },
    { code: 'EMESSAGE', command: 'DATA', responseCode: 554 },
    new TypeError('Invalid message'),
  ])(
    'never retries uncertain acceptance or permanent recipient/content failure: %j',
    async (failure) => {
      const primary = new SmtpEmailProvider(
        { sendMail: vi.fn().mockRejectedValue(failure) },
        sender,
      );
      const fallback = { send: vi.fn() };
      await expect(
        new FallbackEmailProvider(primary, fallback).send(message),
      ).rejects.toMatchObject({ fallbackAllowed: false });
      expect(fallback.send).not.toHaveBeenCalled();
    },
  );

  it('returns primary acceptance without using the backup and returns to the primary on the next message', async () => {
    const primary = {
      send: vi
        .fn()
        .mockRejectedValueOnce(
          new EmailSubmissionError('rejected', { fallbackAllowed: true }),
        )
        .mockResolvedValue({
          status: 'accepted',
          providerMessageId: 'primary-id',
        }),
    };
    const fallback = {
      send: vi
        .fn()
        .mockResolvedValue({
          status: 'accepted',
          providerMessageId: 'backup-id',
        }),
    };
    const provider = new FallbackEmailProvider(primary, fallback);
    await expect(provider.send(message)).resolves.toMatchObject({
      providerMessageId: 'backup-id',
    });
    await expect(
      provider.send({ ...message, id: 'second-message' }),
    ).resolves.toMatchObject({ providerMessageId: 'primary-id' });
    expect(primary.send).toHaveBeenCalledTimes(2);
    expect(fallback.send).toHaveBeenCalledTimes(1);
  });

  it('propagates backup uncertainty without looping back or losing the unknown outcome', async () => {
    const uncertain = new EmailSubmissionError('unknown', {
      fallbackAllowed: true,
    });
    const primary = {
      send: vi
        .fn()
        .mockRejectedValue(
          new EmailSubmissionError('rejected', { fallbackAllowed: true }),
        ),
    };
    const fallback = { send: vi.fn().mockRejectedValue(uncertain) };
    await expect(
      new FallbackEmailProvider(primary, fallback).send(message),
    ).rejects.toBe(uncertain);
    expect(uncertain.fallbackAllowed).toBe(false);
    expect(primary.send).toHaveBeenCalledTimes(1);
    expect(fallback.send).toHaveBeenCalledTimes(1);
  });
});
