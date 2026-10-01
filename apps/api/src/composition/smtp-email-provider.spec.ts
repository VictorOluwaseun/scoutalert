import { SmtpEmailProvider } from '@repo/adapters/notifications';
import { EmailSubmissionError } from '@repo/core/notifications';

const sender = { address: 'no-reply@scoutalert.test', name: 'ScoutAlert' };
const message = {
  id: 'submission-123',
  recipient: 'email-check@scoutalert.test',
  subject: 'Local check',
  text: 'Local transport check.',
};

describe('SMTP email submission outcomes', () => {
  it('keeps an incomplete acknowledgement uncertain rather than declaring rejection', async () => {
    const client = {
      sendMail: vi
        .fn()
        .mockResolvedValue({
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
});
