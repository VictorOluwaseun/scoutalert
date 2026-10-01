import { Module } from '@nestjs/common';
import {
  PostgresActivatedScoutRepository,
  PostgresScoutActivationUnitOfWork,
  NodeScoutActivationIdentity,
} from '@repo/adapters/onboarding';
import {
  ActivatedScoutRepository,
  ActivateScout,
  ReviewSearchDraft,
  ScoutActivationIdentity,
  ScoutActivationUnitOfWork,
} from '@repo/core/onboarding';
import { SecurityModule } from '../../composition/security.module.js';
import {
  StorageModule,
  POSTGRES_CLIENT,
  type PostgresClient,
} from '../../composition/storage.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ScoutActivationController } from './scout-activation.controller.js';

/** Binds transactional activation without making stateless search review depend on storage. */
@Module({
  imports: [SecurityModule, StorageModule, IdentityModule],
  controllers: [ScoutActivationController],
  providers: [
    ReviewSearchDraft,
    { provide: ScoutActivationIdentity, useClass: NodeScoutActivationIdentity },
    {
      provide: ScoutActivationUnitOfWork,
      inject: [POSTGRES_CLIENT],
      useFactory: (db: PostgresClient) =>
        new PostgresScoutActivationUnitOfWork(db),
    },
    {
      provide: ActivatedScoutRepository,
      inject: [POSTGRES_CLIENT],
      useFactory: (db: PostgresClient) =>
        new PostgresActivatedScoutRepository(db),
    },
    {
      provide: ActivateScout,
      inject: [
        ReviewSearchDraft,
        ScoutActivationUnitOfWork,
        ScoutActivationIdentity,
      ],
      useFactory: (
        review: ReviewSearchDraft,
        uow: ScoutActivationUnitOfWork,
        identity: ScoutActivationIdentity,
      ) => new ActivateScout(review, uow, identity, () => new Date()),
    },
  ],
})
export class ScoutActivationModule {}
