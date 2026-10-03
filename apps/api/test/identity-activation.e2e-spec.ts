import { randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { createPostgresClient, migrateDatabase } from '@repo/adapters/database';
import {
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from '@repo/adapters/onboarding';
import { RedisIdentityRateLimits } from '@repo/adapters/identity';
import {
  ActivateScout,
  ReviewSearchDraft,
  ScoutActivationUnitOfWork,
  type ScoutActivationTransaction,
} from '@repo/core/onboarding';
import { IdentityRateLimits } from '@repo/core/identity';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../src/composition/storage.module.js';

const enabled = process.env.IDENTITY_INTEGRATION === '1';
const search = {
  goal: 'Find remote product design jobs.',
  category: 'employment',
  target: 'Product designer',
  name: 'Product design scout',
  arrangement: 'remote',
  arrangementRequired: true,
  residence: 'Lagos, Nigeria',
  workLocations: 'Remote worldwide',
  background: 'Product design experience',
  minimumPay: '50000',
  currency: 'USD',
  payPeriod: 'year',
  unknownEligibility: 'review',
  undisclosedPay: 'include',
} as const;
const alerts = {
  frequency: 'daily',
  timezone: 'Africa/Lagos',
  deliveryTime: '08:00',
  weekday: 'Monday',
  promptAlerts: true,
  consent: true,
  consentVersion: 'opportunity-alerts-v1',
} as const;

/** Reads only the synthetic challenge message identified by this test's random logical email ID. */
async function capturedCode(id: string): Promise<string> {
  const origin = process.env.MAILPIT_HTTP_URL ?? 'http://127.0.0.1:8025';
  const url = new URL('/api/v1/search', origin);
  url.searchParams.set('query', `message-id:${id}@scoutalert.test`);
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const result = (await response.json()) as { messages: { ID: string }[] };
  expect(result.messages).toHaveLength(1);
  const message = await fetch(
    new URL(`/api/v1/message/${result.messages[0]!.ID}`, origin),
    { signal: AbortSignal.timeout(5000) },
  );
  const body = (await message.json()) as { Text: string };
  const code = body.Text.match(/code is (\d{6})/u)?.[1];
  expect(code).toMatch(/^\d{6}$/);

  return code!;
}

/** Inserts a deliberate failure after all activation repositories except the dispatch intent succeed. */
class FailingOutboxUnitOfWork extends ScoutActivationUnitOfWork {
  /** Receives the real transactional implementation to exercise rollback against PostgreSQL. */
  constructor(private readonly actual: ScoutActivationUnitOfWork) {
    super();
  }

  /** Delegates every operation to real transaction repositories and fails only the outbox write. */
  run<T>(
    operation: (records: ScoutActivationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.actual.run((records) =>
      operation({
        lockOwner: (owner) => records.lockOwner(owner),
        findRequest: (owner, key) => records.findRequest(owner, key),
        claimDraft: (...args) => records.claimDraft(...args),
        createScout: (...args) => records.createScout(...args),
        recordConsent: (...args) => records.recordConsent(...args),
        saveRequest: (...args) => records.saveRequest(...args),
        requestDiscovery: () =>
          Promise.reject(
            new Error('Deliberate integration-test outbox failure'),
          ),
      }),
    );
  }
}

describe.skipIf(!enabled)(
  'identity and scout activation with PostgreSQL, Redis and Mailpit',
  () => {
    let app: INestApplication<App>;
    let db: ReturnType<typeof createPostgresClient>;
    let network: string;

    /** Generates a distinct opaque browser and trusted host context for each synthetic flow. */
    function headers(
      browser = randomBytes(32).toString('hex'),
      token?: string,
    ): Record<string, string> {
      return {
        'x-scout-web-key': process.env.WEB_API_SECRET!,
        'x-scout-browser': browser,
        'x-scout-network': network,
        ...(token ? { 'x-scout-session': token } : {}),
      };
    }

    /** Performs the real code request, SMTP capture and proof exchange for a synthetic account. */
    async function signedIn() {
      const context = headers();
      const email = `identity-${randomUUID()}@scoutalert.test`;
      const sent = await request(app.getHttpServer())
        .post('/v1/identity/code')
        .set(context)
        .send({ email })
        .expect(200);
      const code = await capturedCode(sent.body.id as string);
      const verified = await request(app.getHttpServer())
        .post('/v1/identity/verify')
        .set(context)
        .send({ id: sent.body.id, code })
        .expect(200);

      return {
        context,
        email,
        code,
        challengeId: sent.body.id as string,
        account: verified.body.account as { id: string; email: string },
        token: verified.body.token as string,
        authorized: {
          ...context,
          'x-scout-session': verified.body.token as string,
        },
      };
    }

    beforeAll(async () => {
      loadEnvFile(new URL('../.env', import.meta.url));
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = '/scoutalert_test';
      process.env.DATABASE_URL = url.toString();
      db = createPostgresClient(process.env.DATABASE_URL);
      await migrateDatabase(db);
      network = `integration-${randomUUID()}`;
      const fixture = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(IdentityRateLimits)
        .useFactory({
          inject: [REDIS_CLIENT],
          factory: (redis: RedisClient) =>
            new RedisIdentityRateLimits(redis, `scoutalert:test:${network}`),
        })
        .compile();
      app = fixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      await db?.destroy();
    });

    it('creates one recoverable session, activates one scout under concurrent retry, and enforces ownership', async () => {
      const signed = await signedIn();
      const retry = await request(app.getHttpServer())
        .post('/v1/identity/verify')
        .set(signed.context)
        .send({ id: signed.challengeId, code: signed.code })
        .expect(200);
      expect(retry.body.token).toBe(signed.token);
      const sessions = await db
        .selectFrom('auth_sessions')
        .select('challenge_id')
        .where('owner_id', '=', signed.account.id)
        .execute();
      expect(sessions).toHaveLength(1);
      const input = { key: randomUUID(), search, alerts, confirmed: true };
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(app.getHttpServer())
            .post('/v1/onboarding/scouts')
            .set(signed.authorized)
            .send(input)
            .expect(200),
        ),
      );
      const id = responses[0]!.body.id as string;
      expect(responses.every((response) => response.body.id === id)).toBe(true);
      expect(
        await db
          .selectFrom('scouts')
          .select('id')
          .where('owner_id', '=', signed.account.id)
          .execute(),
      ).toHaveLength(1);
      expect(
        await db
          .selectFrom('outbox_events')
          .select('id')
          .where('aggregate_id', '=', id)
          .execute(),
      ).toHaveLength(1);
      expect(
        await db
          .selectFrom('consent_events')
          .select('granted')
          .where('scout_id', '=', id)
          .execute(),
      ).toEqual([{ granted: true }]);
      await request(app.getHttpServer())
        .get(`/v1/onboarding/scouts/${id}`)
        .set(signed.authorized)
        .expect(200);
      const page = await request(app.getHttpServer())
        .get('/v1/scouts')
        .set(signed.authorized)
        .expect(200);
      expect(page.body.account).toEqual(signed.account);
      expect(page.body.items.map((item: { id: string }) => item.id)).toEqual([
        id,
      ]);
      expect(page.body.nextCursor).toBeNull();
      expect(page.headers['cache-control']).toBe('no-store, private');
      await request(app.getHttpServer())
        .post('/v1/onboarding/scouts')
        .set(signed.authorized)
        .send({ ...input, search: { ...search, target: 'Another role' } })
        .expect(409);
      const other = await signedIn();
      const empty = await request(app.getHttpServer())
        .get('/v1/scouts')
        .set(other.authorized)
        .expect(200);
      expect(empty.body.items).toEqual([]);
      expect(empty.body.account).toEqual(other.account);
      const web = await request(app.getHttpServer())
        .get(`/v1/discovery?ownerId=${signed.account.id}`)
        .set(other.authorized)
        .expect(200);
      expect(web.body.account).toEqual(other.account);
      expect(web.body.leads).toEqual([]);
      expect(web.headers['cache-control']).toBe('no-store, private');
      await request(app.getHttpServer()).get('/v1/discovery').set(signed.context).expect(401);
      await request(app.getHttpServer()).get('/v1/discovery').set({ ...signed.authorized, 'x-scout-web-key': 'forged' }).expect(401);
      await request(app.getHttpServer())
        .get('/v1/scouts')
        .set(signed.context)
        .expect(401);
      await request(app.getHttpServer())
        .get('/v1/scouts')
        .set({ ...signed.authorized, 'x-scout-web-key': 'forged' })
        .expect(401);
      await request(app.getHttpServer())
        .get(`/v1/onboarding/scouts/${id}`)
        .set(other.authorized)
        .expect(404);
      await request(app.getHttpServer())
        .post('/v1/onboarding/scouts')
        .set(signed.context)
        .send(input)
        .expect(401);
    });

    it('protects scout changes through trusted session ownership, validation, revisions and retry receipts', async () => {
      const signed = await signedIn();
      const other = await signedIn();
      const saved = await request(app.getHttpServer())
        .post('/v1/onboarding/scouts')
        .set(signed.authorized)
        .send({ key: randomUUID(), search, alerts, confirmed: true })
        .expect(200);
      const id = saved.body.id as string;
      const endpoint = `/v1/scouts/${id}/change`;
      const input = { key: randomUUID(), version: 1, action: 'pause' };
      await request(app.getHttpServer())
        .post(endpoint)
        .set(signed.context)
        .send(input)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/v1/scouts/${id}`)
        .set(other.authorized)
        .expect(404);
      await request(app.getHttpServer())
        .post(endpoint)
        .set(other.authorized)
        .send(input)
        .expect(404);
      await request(app.getHttpServer())
        .post(endpoint)
        .set(signed.authorized)
        .send({ ...input, ownerId: other.account.id })
        .expect(400);
      const paused = await request(app.getHttpServer())
        .post(endpoint)
        .set(signed.authorized)
        .send(input)
        .expect(200);
      expect(paused.body).toMatchObject({ status: 'paused', version: 2 });
      const retry = await request(app.getHttpServer())
        .post(endpoint)
        .set(signed.authorized)
        .send(input)
        .expect(200);
      expect(retry.body).toEqual(paused.body);
      await request(app.getHttpServer())
        .post(endpoint)
        .set(signed.authorized)
        .send({ ...input, key: randomUUID(), action: 'resume' })
        .expect(409);
      const invalid = await request(app.getHttpServer())
        .post(endpoint)
        .set(signed.authorized)
        .send({
          key: randomUUID(),
          version: 2,
          action: 'update',
          search: { ...search, target: '' },
          alerts,
        })
        .expect(422);
      expect(invalid.body.issues[0].field).toBe('target');
      const edited = await request(app.getHttpServer())
        .post(endpoint)
        .set(signed.authorized)
        .send({
          key: randomUUID(),
          version: 2,
          action: 'update',
          search: { ...search, name: 'Revised scout' },
          alerts: {
            ...alerts,
            frequency: 'dashboard',
            consent: false,
            promptAlerts: false,
          },
        })
        .expect(200);
      expect(edited.body).toMatchObject({
        status: 'paused',
        version: 3,
        name: 'Revised scout',
      });
      const resumed = await request(app.getHttpServer())
        .post(endpoint)
        .set(signed.authorized)
        .send({ key: randomUUID(), version: 3, action: 'resume' })
        .expect(200);
      expect(resumed.body).toMatchObject({ status: 'active', version: 4 });
      const current = await request(app.getHttpServer())
        .get(`/v1/scouts/${id}`)
        .set(signed.authorized)
        .expect(200);
      expect(current.body.scout.version).toBe(4);
      expect(current.headers['cache-control']).toBe('no-store, private');
      await request(app.getHttpServer())
        .post('/v1/scouts/feedback')
        .set(signed.context)
        .send({
          key: randomUUID(),
          postingId: 'unrelated:posting',
          version: 0,
          value: 'hidden',
        })
        .expect(401);
      await request(app.getHttpServer())
        .post('/v1/scouts/feedback')
        .set(signed.authorized)
        .send({
          key: randomUUID(),
          postingId: 'unrelated:posting',
          version: 0,
          value: 'hidden',
        })
        .expect(404);
    });

    it('paginates tied activation times without repeating or skipping scouts after a newer insert', async () => {
      const signed = await signedIn();
      const at = new Date(Date.now() - 5000);
      const activate = new ActivateScout(
        new ReviewSearchDraft(),
        new PostgresScoutActivationUnitOfWork(db),
        new NodeScoutActivationIdentity(),
        () => at,
      );
      const ids: string[] = [];

      for (let index = 0; index < 24; index++) {
        const scout = await activate.execute(
          signed.account.id,
          signed.context['x-scout-browser']!,
          { key: randomUUID(), search, alerts, confirmed: true },
        );
        ids.push(scout.id);
      }

      const first = await request(app.getHttpServer())
        .get('/v1/scouts')
        .set(signed.authorized)
        .expect(200);
      expect(first.body.items).toHaveLength(20);
      expect(typeof first.body.nextCursor).toBe('string');
      await request(app.getHttpServer())
        .post('/v1/onboarding/scouts')
        .set(signed.authorized)
        .send({ key: randomUUID(), search, alerts, confirmed: true })
        .expect(200);
      const second = await request(app.getHttpServer())
        .get('/v1/scouts')
        .query({ after: first.body.nextCursor as string })
        .set(signed.authorized)
        .expect(200);
      expect(second.body.items).toHaveLength(4);
      expect(second.body.nextCursor).toBeNull();
      const seen = [...first.body.items, ...second.body.items].map(
        (item: { id: string }) => item.id,
      );
      expect(seen).toEqual(ids.sort((a, b) => (a < b ? 1 : -1)));
      expect(new Set(seen).size).toBe(24);
      await request(app.getHttpServer())
        .get('/v1/scouts')
        .query({ after: 'invalid' })
        .set(signed.authorized)
        .expect(400);
      await request(app.getHttpServer())
        .get('/v1/scouts')
        .query({ ownerId: randomUUID() })
        .set(signed.authorized)
        .expect(400);
      await request(app.getHttpServer())
        .get('/v1/scouts')
        .query({ after: 'a'.repeat(257) })
        .set(signed.authorized)
        .expect(400);
    });

    it('serializes resend, supersedes the previous generation and commits five failed attempts', async () => {
      const context = headers();
      const email = `resend-${randomUUID()}@scoutalert.test`;
      const sent = await request(app.getHttpServer())
        .post('/v1/identity/code')
        .set(context)
        .send({ email })
        .expect(200);
      const firstCode = await capturedCode(sent.body.id as string);
      await request(app.getHttpServer())
        .post('/v1/identity/code')
        .set(context)
        .send({ email })
        .expect(429);
      await db
        .updateTable('email_verification_challenges')
        .set({ created_at: new Date(Date.now() - 61_000) })
        .where('id', '=', sent.body.id as string)
        .execute();
      const results = await Promise.all(
        Array.from({ length: 2 }, () =>
          request(app.getHttpServer())
            .post('/v1/identity/code')
            .set(context)
            .send({ email }),
        ),
      );
      expect(
        results.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([200, 429]);
      const currentId = results.find((response) => response.status === 200)!
        .body.id as string;
      const code = await capturedCode(currentId);
      await request(app.getHttpServer())
        .post('/v1/identity/verify')
        .set(context)
        .send({ id: sent.body.id, code: firstCode })
        .expect(422)
        .expect(({ body }) => expect(body.code).toBe('challenge_changed'));
      const wrong = code === '000000' ? '111111' : '000000';
      const failed = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app.getHttpServer())
            .post('/v1/identity/verify')
            .set(context)
            .send({ id: currentId, code: wrong })
            .expect(422),
        ),
      );
      expect(
        failed.some((response) => response.body.code === 'code_locked'),
      ).toBe(true);
      expect(
        (
          await db
            .selectFrom('email_verification_challenges')
            .select('failed_attempts')
            .where('id', '=', currentId)
            .executeTakeFirstOrThrow()
        ).failed_attempts,
      ).toBe(5);
      await request(app.getHttpServer())
        .post('/v1/identity/verify')
        .set(context)
        .send({ id: currentId, code })
        .expect(422)
        .expect(({ body }) => expect(body.code).toBe('code_locked'));
    });

    it('rejects codes in another browser and after expiry, without minting a session', async () => {
      const context = headers();
      const sent = await request(app.getHttpServer())
        .post('/v1/identity/code')
        .set(context)
        .send({ email: `expiry-${randomUUID()}@scoutalert.test` })
        .expect(200);
      const code = await capturedCode(sent.body.id as string);
      await request(app.getHttpServer())
        .post('/v1/identity/verify')
        .set(headers())
        .send({ id: sent.body.id, code })
        .expect(422);
      await db
        .updateTable('email_verification_challenges')
        .set({
          created_at: new Date(Date.now() - 700_000),
          expires_at: new Date(Date.now() - 1000),
        })
        .where('id', '=', sent.body.id as string)
        .execute();
      await request(app.getHttpServer())
        .post('/v1/identity/verify')
        .set(context)
        .send({ id: sent.body.id, code })
        .expect(422)
        .expect(({ body }) => expect(body.code).toBe('code_expired'));
      expect(
        await db
          .selectFrom('auth_sessions')
          .select('challenge_id')
          .where('challenge_id', '=', sent.body.id as string)
          .execute(),
      ).toHaveLength(0);
    });

    it('keeps dashboard-only email disabled and rejects implicit or contradictory consent', async () => {
      const signed = await signedIn();
      const input = {
        key: randomUUID(),
        search,
        alerts: {
          ...alerts,
          frequency: 'dashboard',
          promptAlerts: false,
          consent: false,
        },
        confirmed: true,
      };
      const result = await request(app.getHttpServer())
        .post('/v1/onboarding/scouts')
        .set(signed.authorized)
        .send(input)
        .expect(200);
      const stored = await db
        .selectFrom('notification_preferences')
        .select('email_enabled')
        .where('scout_id', '=', result.body.id as string)
        .executeTakeFirstOrThrow();
      expect(stored.email_enabled).toBe(false);
      await request(app.getHttpServer())
        .post('/v1/onboarding/scouts')
        .set(signed.authorized)
        .send({
          ...input,
          key: randomUUID(),
          alerts: { ...alerts, consent: false },
        })
        .expect(422);
      await request(app.getHttpServer())
        .post('/v1/onboarding/scouts')
        .set(signed.authorized)
        .send({
          ...input,
          key: randomUUID(),
          alerts: { ...input.alerts, consent: true },
        })
        .expect(422);
      await request(app.getHttpServer())
        .post('/v1/identity/logout')
        .set(signed.authorized)
        .send({})
        .expect(200);
      await request(app.getHttpServer())
        .get(`/v1/onboarding/scouts/${result.body.id}`)
        .set(signed.authorized)
        .expect(401);
      await request(app.getHttpServer())
        .post('/v1/identity/verify')
        .set(signed.context)
        .send({ id: signed.challengeId, code: signed.code })
        .expect(422);
    });

    it('persists quiet hours and rejects invalid or ambiguous intervals before activation', async () => {
      const signed = await signedIn();
      const quietHours = { start: '21:30', end: '07:30' };
      const result = await request(app.getHttpServer())
        .post('/v1/onboarding/scouts')
        .set(signed.authorized)
        .send({
          key: randomUUID(),
          search,
          alerts: { ...alerts, promptAlerts: true, quietHours },
          confirmed: true,
        })
        .expect(200);
      expect(result.body.alerts.quietHours).toEqual(quietHours);
      const receipt = await request(app.getHttpServer())
        .get(`/v1/onboarding/scouts/${result.body.id}`)
        .set(signed.authorized)
        .expect(200);
      expect(receipt.body.alerts.quietHours).toEqual(quietHours);

      for (const invalid of [
        { start: '25:00', end: '08:00' },
        { start: '08:00', end: '08:00' },
      ]) {
        await request(app.getHttpServer())
          .post('/v1/onboarding/scouts')
          .set(signed.authorized)
          .send({
            key: randomUUID(),
            search,
            alerts: { ...alerts, promptAlerts: true, quietHours: invalid },
            confirmed: true,
          })
          .expect(422);
      }
    });

    it('rolls back draft, scout, consent and receipt when the outbox write fails, then permits retry', async () => {
      const signed = await signedIn();
      const input = {
        key: randomUUID(),
        search,
        alerts,
        confirmed: true as const,
      };
      const actual = new PostgresScoutActivationUnitOfWork(db);
      const faulty = new ActivateScout(
        new ReviewSearchDraft(),
        new FailingOutboxUnitOfWork(actual),
        new NodeScoutActivationIdentity(),
        () => new Date(),
      );
      await expect(
        faulty.execute(
          signed.account.id,
          signed.context['x-scout-browser']!,
          input,
        ),
      ).rejects.toThrow('Deliberate integration-test outbox failure');
      expect(
        await db
          .selectFrom('onboarding_drafts')
          .select('id')
          .where('owner_id', '=', signed.account.id)
          .execute(),
      ).toHaveLength(0);
      expect(
        await db
          .selectFrom('scouts')
          .select('id')
          .where('owner_id', '=', signed.account.id)
          .execute(),
      ).toHaveLength(0);
      expect(
        await db
          .selectFrom('consent_events')
          .select('id')
          .where('owner_id', '=', signed.account.id)
          .execute(),
      ).toHaveLength(0);
      expect(
        await db
          .selectFrom('activation_requests')
          .select('request_key')
          .where('owner_id', '=', signed.account.id)
          .execute(),
      ).toHaveLength(0);
      await request(app.getHttpServer())
        .post('/v1/onboarding/scouts')
        .set(signed.authorized)
        .send(input)
        .expect(200);
    });

    it('reserves Redis quotas atomically and rejects forged private host admission', async () => {
      const limits = app.get(IdentityRateLimits);
      const key = randomUUID();
      const attempts = await Promise.all(
        Array.from({ length: 8 }, () =>
          limits.reserve([{ key, maximum: 3, windowSeconds: 60 }]),
        ),
      );
      expect(attempts.filter((retry) => retry === null)).toHaveLength(3);
      expect(attempts.filter((retry) => retry !== null)).toHaveLength(5);
      await request(app.getHttpServer())
        .post('/v1/identity/code')
        .set({ ...headers(), 'x-scout-web-key': 'forged' })
        .send({ email: 'blocked@scoutalert.test' })
        .expect(401);
    });
  },
);
