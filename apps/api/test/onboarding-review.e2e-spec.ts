import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { OnboardingModule } from '../src/modules/onboarding/onboarding.module.js';

const search = {
  goal: 'Find remote product design work.',
  category: 'employment',
  target: 'Product designer',
  name: '',
  arrangement: 'remote',
  arrangementRequired: true,
  residence: 'Lagos, Nigeria',
  workLocations: 'Europe or remote',
  background: 'I design digital products.',
  minimumPay: '50000',
  currency: 'USD',
  payPeriod: 'year',
  unknownEligibility: 'review',
  undisclosedPay: 'include',
} as const;

describe('onboarding search review', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [OnboardingModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows an explicit, valid brief without creating state', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/review')
      .send({ search })
      .expect(200)
      .expect({ status: 'review_ready' });
  });

  it('returns field-specific corrections for contradictory and invalid answers', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/onboarding/review')
      .send({
        search: {
          ...search,
          goal: '',
          arrangement: 'unknown',
          minimumPay: '-50',
        },
      })
      .expect(422);

    expect(response.body.code).toBe('search_needs_changes');
    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'goal' }),
        expect.objectContaining({ field: 'arrangementRequired' }),
        expect.objectContaining({ field: 'minimumPay' }),
      ]),
    );
  });

  it('requires explicit complete authorization declarations without deriving them from residence', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/review')
      .send({ search: { ...search, authorizationConfirmed: true } })
      .expect(422);
    await request(app.getHttpServer())
      .post('/v1/onboarding/review')
      .send({
        search: {
          ...search,
          authorizationLocations: 'Nigeria',
          sponsorshipNeed: 'not_needed',
          authorizationConfirmed: true,
        },
      })
      .expect(200);
    await request(app.getHttpServer())
      .post('/v1/onboarding/review')
      .send({ search: { ...search, sponsorshipNeed: 'verified' } })
      .expect(400);
  });

  it('rejects unknown transport fields and never treats them as approved state', async () => {
    await request(app.getHttpServer())
      .post('/v1/onboarding/review')
      .send({ search: { ...search, verified: true } })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('invalid_request');
      });
  });
});
