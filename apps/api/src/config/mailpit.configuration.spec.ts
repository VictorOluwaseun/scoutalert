import { readMailpitConfiguration } from './mailpit.configuration.js';

describe('Mailpit composition configuration', () => {
  it('rejects invalid listener ports and sender addresses before constructing clients', () => {
    expect(() =>
      readMailpitConfiguration({ MAILPIT_SMTP_PORT: '0' }),
    ).toThrow();
    expect(() =>
      readMailpitConfiguration({ MAILPIT_SMTP_PORT: '70000' }),
    ).toThrow();
    expect(() =>
      readMailpitConfiguration({ EMAIL_FROM_ADDRESS: 'not-an-address' }),
    ).toThrow();
  });

  it('refuses to compose a capture-only provider in production', () => {
    expect(() => readMailpitConfiguration({ NODE_ENV: 'production' })).toThrow(
      'local email provider',
    );
  });
});
