import { readEmailConfiguration } from '@repo/adapters/notifications';

const production = {
  NODE_ENV: 'production',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.provider.example',
  SMTP_USER: 'fixture-user',
  SMTP_PASSWORD: 'fixture-password',
  EMAIL_FROM_ADDRESS: 'alerts@scoutalert.dev',
  SCOUTALERT_WEB_ORIGIN: 'https://app.scoutalert.dev',
};

describe('shared email configuration', () => {
  it('keeps existing local Mailpit settings and permits an optional reply address', () => {
    expect(readEmailConfiguration({ EMAIL_REPLY_TO: '' })).toMatchObject({
      provider: 'mailpit',
      transport: { host: '127.0.0.1', port: 1025, secure: false },
      sender: { address: 'no-reply@scoutalert.test', name: 'ScoutAlert' },
      publicOrigin: 'http://localhost:3030',
    });
    expect(
      readEmailConfiguration({
        ...production,
        EMAIL_REPLY_TO: 'support@scoutalert.dev',
      }).sender.replyTo,
    ).toBe('support@scoutalert.dev');
  });

  it('requires explicit production SMTP instead of falling back to local capture', () => {
    expect(() => readEmailConfiguration({ NODE_ENV: 'production' })).toThrow(
      'EMAIL_PROVIDER=smtp',
    );
    expect(() =>
      readEmailConfiguration({ ...production, EMAIL_PROVIDER: 'mailpit' }),
    ).toThrow('local email provider');
    expect(() => readEmailConfiguration({ EMAIL_PROVIDER: 'typo' })).toThrow(
      'EMAIL_PROVIDER',
    );
  });

  it('requires authenticated, certificate-checked STARTTLS on the default submission port', () => {
    expect(readEmailConfiguration(production).transport).toEqual({
      host: production.SMTP_HOST,
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: production.SMTP_USER, pass: production.SMTP_PASSWORD },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    });
  });

  it.each([
    undefined,
    'http://app.scoutalert.dev',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://app.scoutalert.dev/path',
    'https://user:secret@app.scoutalert.dev',
    'https://app.scoutalert.dev/?next=unsafe',
    'javascript:alert(1)',
  ])('rejects an unsafe or missing production website origin: %s', (origin) => {
    expect(() =>
      readEmailConfiguration({ ...production, SCOUTALERT_WEB_ORIGIN: origin }),
    ).toThrow('SCOUTALERT_WEB_ORIGIN');
  });

  it('normalizes the configured website origin and permits local preview URLs only in Mailpit mode', () => {
    expect(
      readEmailConfiguration({
        ...production,
        SCOUTALERT_WEB_ORIGIN: 'https://app.scoutalert.dev/',
      }).publicOrigin,
    ).toBe('https://app.scoutalert.dev');
    expect(
      readEmailConfiguration({ SCOUTALERT_WEB_ORIGIN: 'http://localhost:3031' })
        .publicOrigin,
    ).toBe('http://localhost:3031');
  });

  it('supports implicit TLS and preserves password bytes', () => {
    expect(
      readEmailConfiguration({
        ...production,
        SMTP_PORT: '465',
        SMTP_PASSWORD: ' password with spaces ',
      }).transport,
    ).toMatchObject({
      port: 465,
      secure: true,
      auth: { pass: ' password with spaces ' },
    });
    expect(
      readEmailConfiguration({
        ...production,
        SMTP_PORT: '2465',
        SMTP_SECURE: 'true',
      }).transport.secure,
    ).toBe(true);
  });

  it.each([
    ['SMTP_HOST', 'https://smtp.example.com'],
    ['SMTP_HOST', ''],
    ['SMTP_USER', ''],
    ['SMTP_PASSWORD', ''],
    ['SMTP_SECURE', 'no'],
    ['SMTP_PORT', '0'],
    ['SMTP_PORT', '65536'],
    ['EMAIL_FROM_ADDRESS', ''],
    ['EMAIL_FROM_ADDRESS', 'no-reply@scoutalert.test'],
    ['EMAIL_FROM_ADDRESS', 'no-reply@example.com'],
    ['EMAIL_FROM_NAME', 'ScoutAlert\r\nBcc: other@example.com'],
    ['EMAIL_REPLY_TO', 'one@example.com,two@example.com'],
  ])('rejects invalid %s without exposing its value', (field, value) => {
    expect(() =>
      readEmailConfiguration({ ...production, [field]: value }),
    ).toThrow(field);
  });

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM_ADDRESS'])(
    'requires %s in SMTP mode',
    (field) => {
      expect(() =>
        readEmailConfiguration({ ...production, [field]: undefined }),
      ).toThrow(field);
    },
  );

  it('rejects conflicting TLS ports and malformed local settings', () => {
    expect(() =>
      readEmailConfiguration({
        ...production,
        SMTP_PORT: '465',
        SMTP_SECURE: 'false',
      }),
    ).toThrow('SMTP_SECURE');
    expect(() =>
      readEmailConfiguration({
        ...production,
        SMTP_PORT: '587',
        SMTP_SECURE: 'true',
      }),
    ).toThrow('SMTP_SECURE');
    expect(() => readEmailConfiguration({ MAILPIT_SMTP_PORT: '0' })).toThrow(
      'MAILPIT_SMTP_PORT',
    );
    expect(() =>
      readEmailConfiguration({ EMAIL_FROM_ADDRESS: 'not-an-address' }),
    ).toThrow('EMAIL_FROM_ADDRESS');
  });

  it('redacts invalid credentials even when validation fails', () => {
    let message = '';
    try {
      readEmailConfiguration({
        ...production,
        SMTP_PASSWORD: 'secret-canary\r\n',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(
      'Configure valid email settings. Invalid fields: SMTP_PASSWORD.',
    );
    expect(message).not.toContain('secret-canary');
  });

  it('keeps fallback disabled by default and validates both providers independently when enabled', () => {
    expect(
      readEmailConfiguration(production).fallbackTransport,
    ).toBeUndefined();
    const config = readEmailConfiguration({
      ...production,
      EMAIL_FALLBACK_ENABLED: 'true',
      SMTP_FALLBACK_HOST: 'smtp.backup.example',
      SMTP_FALLBACK_PORT: '465',
      SMTP_FALLBACK_USER: 'backup-user',
      SMTP_FALLBACK_PASSWORD: ' backup password ',
    });
    expect(config.transport.auth).toEqual({
      user: 'fixture-user',
      pass: 'fixture-password',
    });
    expect(config.fallbackTransport).toEqual({
      host: 'smtp.backup.example',
      port: 465,
      secure: true,
      requireTLS: true,
      auth: { user: 'backup-user', pass: ' backup password ' },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    });
    expect(config.sender.address).toBe(production.EMAIL_FROM_ADDRESS);
  });

  it.each([
    ['SMTP_FALLBACK_HOST', undefined],
    ['SMTP_FALLBACK_USER', ''],
    ['SMTP_FALLBACK_PASSWORD', 'secret-canary\r\n'],
    ['SMTP_FALLBACK_PORT', '0'],
    ['SMTP_FALLBACK_SECURE', 'yes'],
  ])(
    'rejects invalid fallback %s without revealing credentials',
    (field, value) => {
      expect(() =>
        readEmailConfiguration({
          ...production,
          EMAIL_FALLBACK_ENABLED: 'true',
          SMTP_FALLBACK_HOST: 'smtp.backup.example',
          SMTP_FALLBACK_USER: 'backup-user',
          SMTP_FALLBACK_PASSWORD: 'backup-password',
          [field]: value,
        }),
      ).toThrow(`Configure valid email settings. Invalid fields: ${field}.`);
    },
  );

  it('refuses unintended real fallback from local capture and rejects conflicting backup TLS settings', () => {
    expect(() =>
      readEmailConfiguration({ EMAIL_FALLBACK_ENABLED: 'true' }),
    ).toThrow('requires EMAIL_PROVIDER=smtp');
    expect(() =>
      readEmailConfiguration({ ...production, EMAIL_FALLBACK_ENABLED: 'yes' }),
    ).toThrow('EMAIL_FALLBACK_ENABLED');
    expect(() =>
      readEmailConfiguration({
        ...production,
        EMAIL_FALLBACK_ENABLED: 'true',
        SMTP_FALLBACK_HOST: 'smtp.backup.example',
        SMTP_FALLBACK_PORT: '587',
        SMTP_FALLBACK_SECURE: 'true',
        SMTP_FALLBACK_USER: 'backup-user',
        SMTP_FALLBACK_PASSWORD: 'backup-password',
      }),
    ).toThrow('SMTP_FALLBACK_SECURE');
  });
});
