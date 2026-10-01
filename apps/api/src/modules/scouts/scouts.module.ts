import {
  PostgresScoutManagementRepository,
  PostgresOpportunityFeedbackRepository,
} from '@repo/adapters/scouts';
import {
  ManageScout,
  ScoutManagementRepository,
  RecordOpportunityFeedback,
  OpportunityFeedbackRepository,
} from '@repo/core/scouts';
import { ReviewSearchDraft } from '@repo/core/onboarding';
import { ScoutControlsController } from './scout-controls.controller.js';
import { Module } from '@nestjs/common';
import { PostgresActivatedScoutRepository } from '@repo/adapters/onboarding';
import { ListScouts, ScoutCatalogRepository } from '@repo/core/scouts';
import { PostgresOpportunityCatalogRepository } from '@repo/adapters/scouting';
import {
  OpportunityCatalogRepository,
  ReadOpportunityFeed,
} from '@repo/core/scouting';
import { SecurityModule } from '../../composition/security.module.js';
import {
  POSTGRES_CLIENT,
  StorageModule,
  type PostgresClient,
} from '../../composition/storage.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ScoutsController } from './scouts.controller.js';

/** Composes authenticated scout catalog reads; storage remains behind an inward repository boundary. */
@Module({
  imports: [SecurityModule, StorageModule, IdentityModule],
  controllers: [ScoutsController, ScoutControlsController],
  providers: [
    {
      provide: ScoutManagementRepository,
      inject: [POSTGRES_CLIENT],
      useFactory: (db: PostgresClient) =>
        new PostgresScoutManagementRepository(db),
    },
    {
      provide: ManageScout,
      inject: [ScoutManagementRepository],
      useFactory: (records: ScoutManagementRepository) =>
        new ManageScout(records, new ReviewSearchDraft(), () => new Date()),
    },
    {
      provide: OpportunityFeedbackRepository,
      inject: [POSTGRES_CLIENT],
      useFactory: (db: PostgresClient) =>
        new PostgresOpportunityFeedbackRepository(db),
    },
    {
      provide: RecordOpportunityFeedback,
      inject: [OpportunityFeedbackRepository],
      useFactory: (records: OpportunityFeedbackRepository) =>
        new RecordOpportunityFeedback(records),
    },
    {
      provide: OpportunityCatalogRepository,
      inject: [POSTGRES_CLIENT],
      useFactory: (db: PostgresClient) =>
        new PostgresOpportunityCatalogRepository(db),
    },
    {
      provide: ReadOpportunityFeed,
      inject: [OpportunityCatalogRepository],
      useFactory: (catalog: OpportunityCatalogRepository) =>
        new ReadOpportunityFeed(catalog),
    },
    {
      provide: ScoutCatalogRepository,
      inject: [POSTGRES_CLIENT],
      useFactory: (db: PostgresClient) =>
        new PostgresActivatedScoutRepository(db),
    },
    {
      provide: ListScouts,
      inject: [ScoutCatalogRepository],
      useFactory: (scouts: ScoutCatalogRepository) => new ListScouts(scouts),
    },
  ],
})
export class ScoutsModule {}
