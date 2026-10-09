import { Test } from '@nestjs/testing';
import { APP_FILTER } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AccountAccess, IdentityError } from '@repo/core/identity';
import {
  MailConnectionError,
  ManageMailConnection,
} from '@repo/core/connections';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { ConnectionsController } from '../src/modules/connections/connections.controller.js';
import { IDENTITY_CONFIGURATION } from '../src/config/identity.configuration.js';
import { AccountSessionGuard } from '../src/shared/guards/account-session.guard.js';
import { WebRequestGuard } from '../src/shared/guards/web-request.guard.js';
import { ApplicationErrorFilter } from '../src/shared/filters/application-error.filter.js';

describe('private connection HTTP boundaries', () => {
  let app: INestApplication<App>;
  const browser = 'b'.repeat(64);
  const key = 'a'.repeat(64);
  const headers = {
    'x-scout-web-key': key,
    'x-scout-browser': browser,
    'x-scout-session': 'valid-test-session',
  };
  const mail = {
    read: vi.fn(async () => ({
      available: false,
      connection: { status: 'disconnected' },
      items: [],
    })),
    begin: vi.fn(async () => {
      throw new MailConnectionError('connection_unavailable');
    }),
    finish: vi.fn(async () => {}),
    select: vi.fn(async () => {}),
    import: vi.fn(async () => {}),
    disconnect: vi.fn(async () => ({
      disconnected: true,
      providerRevoked: true,
    })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ConnectionsController],
      providers: [
        { provide: ManageMailConnection, useValue: mail },
        { provide: IDENTITY_CONFIGURATION, useValue: { WEB_API_SECRET: key } },
        {
          provide: AccountAccess,
          useValue: {
            require: async (token: string) => {
              if (token !== 'valid-test-session') {
                throw new IdentityError('unauthenticated');
              }
              return {
                account: { id: 'verified-owner', email: 'test@example.test' },
              };
            },
          },
        },
        WebRequestGuard,
        AccountSessionGuard,
        { provide: APP_FILTER, useClass: ApplicationErrorFilter },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated and untrusted callers before private use cases', async () => {
    await request(app.getHttpServer()).get('/v1/connections/gmail').expect(401);
    await request(app.getHttpServer())
      .get('/v1/connections/gmail')
      .set({ ...headers, 'x-scout-session': 'expired' })
      .expect(401);
    expect(mail.read).not.toHaveBeenCalled();
  });
  it('binds reads and commands to the verified owner and prevents private response caching', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/connections/gmail?owner=someone-else')
      .set(headers)
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(mail.read).toHaveBeenCalledWith('verified-owner');
    await request(app.getHttpServer())
      .post('/v1/connections/gmail/import')
      .set(headers)
      .send({ ownerId: 'someone-else' })
      .expect(200);
    expect(mail.import).toHaveBeenCalledWith('verified-owner');
  });
  it('validates callback payloads and forwards only session-derived owner and browser binding', async () => {
    await request(app.getHttpServer())
      .post('/v1/connections/gmail/finish')
      .set(headers)
      .send({ state: 'invalid', code: 'code' })
      .expect(400);
    expect(mail.finish).not.toHaveBeenCalled();
    const body = { state: 's'.repeat(43), code: 'test-code' };
    await request(app.getHttpServer())
      .post('/v1/connections/gmail/finish')
      .set(headers)
      .send({ ...body, ownerId: 'other' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/v1/connections/gmail/finish')
      .set(headers)
      .send(body)
      .expect(200);
    expect(mail.finish).toHaveBeenCalledWith(
      'verified-owner',
      browser,
      body.state,
      body.code,
    );
  });
  it('returns explicit unavailable configuration without a made-up authorization URL', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/connections/gmail/begin')
      .set(headers)
      .send({})
      .expect(503);
    expect(response.body).toEqual({ code: 'connection_unavailable' });
  });
});
