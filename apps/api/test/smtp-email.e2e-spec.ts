import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  readEmailConfiguration,
  type SmtpClient,
} from '@repo/adapters/notifications';
import { EmailProvider } from '@repo/core/notifications';
import {
  EmailModule,
  EMAIL_CONFIGURATION,
  SMTP_CLIENT,
} from '../src/composition/email.module.js';
import { SmtpFixture } from './fixtures/smtp-server.js';

describe.skipIf(process.env.SMTP_INTEGRATION !== '1')(
  'production SMTP composition on loopback',
  () => {
    let directory: string;
    let certificate: { key: string; cert: string };
    let fixture: SmtpFixture;
    let backup: SmtpFixture | undefined;
    let app: INestApplicationContext | undefined;

    beforeAll(() => {
      directory = mkdtempSync(join(tmpdir(), 'scoutalert-smtp-'));
      writeFileSync(
        join(directory, 'openssl.cnf'),
        '[req]\ndistinguished_name=dn\nx509_extensions=extensions\nprompt=no\n[dn]\nCN=localhost\n[extensions]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\n',
      );
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-config',
          join(directory, 'openssl.cnf'),
          '-keyout',
          join(directory, 'key.pem'),
          '-out',
          join(directory, 'cert.pem'),
        ],
        { stdio: 'ignore' },
      );
      certificate = {
        key: readFileSync(join(directory, 'key.pem'), 'utf8'),
        cert: readFileSync(join(directory, 'cert.pem'), 'utf8'),
      };
    });

    afterEach(async () => {
      await app?.close();
      app = undefined;
      await fixture?.close();
      await backup?.close();
      backup = undefined;
    });

    afterAll(() => {
      rmSync(directory, { recursive: true, force: true });
    });

    /** Uses production validation and Nest binding; only a fixture CA is added for the ephemeral loopback server. */
    async function compose(
      mode: 'starttls' | 'implicit' | 'plaintext',
      trustCertificate = true,
      rejectAuthentication = false,
      failure:
        'none' | 'temporary' | 'recipient' | 'disconnect-after-data' = 'none',
      fallback: 'none' | 'enabled' | 'disconnect-after-data' = 'none',
    ): Promise<SmtpClient> {
      fixture = new SmtpFixture(
        mode,
        certificate,
        rejectAuthentication,
        failure,
      );
      const port = await fixture.listen();
      const config = readEmailConfiguration({
        NODE_ENV: 'production',
        EMAIL_PROVIDER: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(port),
        SMTP_SECURE: String(mode === 'implicit'),
        SMTP_USER: 'fixture-user',
        SMTP_PASSWORD: 'fixture-password',
        EMAIL_FROM_ADDRESS: 'alerts@scoutalert.dev',
        SCOUTALERT_WEB_ORIGIN: 'https://app.scoutalert.dev',
        EMAIL_REPLY_TO: 'support@scoutalert.dev',
      });
      config.transport.tls = {
        ...config.transport.tls,
        servername: 'localhost',
        ...(trustCertificate ? { ca: certificate.cert } : {}),
      };
      if (fallback !== 'none') {
        backup = new SmtpFixture(
          'starttls',
          certificate,
          false,
          fallback === 'disconnect-after-data' ? fallback : 'none',
        );
        config.fallbackTransport = {
          ...config.transport,
          port: await backup.listen(),
          secure: false,
          tls: { ...config.transport.tls, ca: certificate.cert },
        };
      }
      app = await Test.createTestingModule({ imports: [EmailModule] })
        .overrideProvider(EMAIL_CONFIGURATION)
        .useValue(config)
        .compile();
      await app.init();
      return app.get<SmtpClient>(SMTP_CLIENT);
    }

    it.each(['starttls', 'implicit'] as const)(
      'verifies without sending and submits sign-in and alert content using %s',
      async (mode) => {
        const smtp = await compose(mode);
        await expect(smtp.verify()).resolves.toBe(true);
        expect(fixture.messages).toHaveLength(0);
        for (const [id, subject, text] of [
          [
            'sign-in',
            'Your ScoutAlert sign-in code',
            'Your ScoutAlert code is 123456.',
          ],
          [
            'opportunity',
            'ScoutAlert: 1 opportunity to review',
            'A remote project matching your scout.',
          ],
        ]) {
          await expect(
            app!.get(EmailProvider).send({
              id: id!,
              recipient: 'recipient@scoutalert.test',
              subject: subject!,
              text: text!,
            }),
          ).resolves.toMatchObject({ status: 'accepted' });
        }
        expect(fixture.messages).toHaveLength(2);
        expect(fixture.messages[0]).toContain('123456');
        expect(fixture.messages[1]).toContain('A remote project');
        expect(fixture.messages.join('\n')).toContain(
          'Reply-To: support@scoutalert.dev',
        );
        expect(fixture.messages.join('\n')).not.toContain('fixture-password');
        expect(fixture.authenticationEncrypted.length).toBeGreaterThan(0);
        expect(fixture.authenticationEncrypted.every(Boolean)).toBe(true);
        expect(smtp.options).toMatchObject({
          maxRequeues: 0,
          logger: false,
          debug: false,
        });
      },
    );

    it('refuses a server without STARTTLS before authenticating or sending', async () => {
      const smtp = await compose('plaintext');
      await expect(smtp.verify()).rejects.toThrow();
      expect(fixture.authenticationEncrypted).toEqual([]);
      expect(fixture.messages).toEqual([]);
    });

    it('refuses an untrusted certificate before exposing credentials', async () => {
      const smtp = await compose('implicit', false);
      await expect(smtp.verify()).rejects.toThrow();
      expect(fixture.authenticationEncrypted).toEqual([]);
      expect(fixture.messages).toEqual([]);
    });

    it('does not fall back to unauthenticated delivery after rejected credentials', async () => {
      const smtp = await compose('starttls', true, true);
      await expect(smtp.verify()).rejects.toMatchObject({ code: 'EAUTH' });
      expect(fixture.authenticationEncrypted).toEqual([true]);
      expect(fixture.messages).toEqual([]);
    });

    const message = {
      id: 'fallback-signin',
      recipient: 'recipient@scoutalert.test',
      subject: 'Your ScoutAlert sign-in code',
      text: 'Your ScoutAlert code is 123456.',
    };

    it('uses only the primary when both authenticated providers are available', async () => {
      await compose('starttls', true, false, 'none', 'enabled');
      await expect(
        app!.get(EmailProvider).send(message),
      ).resolves.toMatchObject({ status: 'accepted' });
      expect(fixture.messages).toHaveLength(1);
      expect(backup!.messages).toHaveLength(0);
      expect(backup!.authenticationEncrypted).toHaveLength(0);
    });

    it.each(['authentication', 'quota', 'connection'] as const)(
      'uses backup once after primary %s failure and preserves the code and message ID',
      async (reason) => {
        await compose(
          'starttls',
          true,
          reason === 'authentication',
          reason === 'quota' ? 'temporary' : 'none',
          'enabled',
        );
        if (reason === 'connection') {
          await fixture.close();
        }
        await expect(
          app!.get(EmailProvider).send(message),
        ).resolves.toMatchObject({ status: 'accepted' });
        expect(fixture.messages).toHaveLength(0);
        expect(backup!.messages).toHaveLength(1);
        expect(backup!.messages[0]).toContain(
          'Your ScoutAlert code is 123456.',
        );
        expect(backup!.messages[0]).toContain(
          '<fallback-signin@scoutalert.dev>',
        );
        expect(backup!.authenticationEncrypted.every(Boolean)).toBe(true);
      },
    );

    it('does not try a second provider for an invalid recipient', async () => {
      await compose('starttls', true, false, 'recipient', 'enabled');
      await expect(app!.get(EmailProvider).send(message)).rejects.toMatchObject(
        { outcome: 'rejected', fallbackAllowed: false },
      );
      expect(fixture.messages).toHaveLength(0);
      expect(backup!.messages).toHaveLength(0);
    });

    it('holds a lost primary DATA acknowledgement and never duplicates the accepted message on backup', async () => {
      await compose(
        'starttls',
        true,
        false,
        'disconnect-after-data',
        'enabled',
      );
      await expect(app!.get(EmailProvider).send(message)).rejects.toMatchObject(
        { outcome: 'unknown', fallbackAllowed: false },
      );
      expect(fixture.messages).toHaveLength(1);
      expect(backup!.messages).toHaveLength(0);
    });

    it('preserves an uncertain backup outcome without a third attempt', async () => {
      await compose(
        'starttls',
        true,
        false,
        'temporary',
        'disconnect-after-data',
      );
      await expect(app!.get(EmailProvider).send(message)).rejects.toMatchObject(
        { outcome: 'unknown', fallbackAllowed: false },
      );
      expect(fixture.messages).toHaveLength(0);
      expect(backup!.messages).toHaveLength(1);
    });
  },
);
