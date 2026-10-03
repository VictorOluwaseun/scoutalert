import { Module } from '@nestjs/common';
import { PostgresWebDiscoveryCatalogRepository } from '@repo/adapters/discovery';
import {
  ReadWebDiscovery,
  WebDiscoveryCatalogRepository,
} from '@repo/core/discovery';
import { SecurityModule } from '../../composition/security.module.js';
import {
  POSTGRES_CLIENT,
  StorageModule,
  type PostgresClient,
} from '../../composition/storage.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { DiscoveryController } from './discovery.controller.js';

/** Binds account-scoped discovery reads at the API composition boundary. */
@Module({
  imports: [SecurityModule, StorageModule, IdentityModule],
  controllers: [DiscoveryController],
  providers: [
    {
      provide: WebDiscoveryCatalogRepository,
      inject: [POSTGRES_CLIENT],
      useFactory: (db: PostgresClient) =>
        new PostgresWebDiscoveryCatalogRepository(db),
    },
    {
      provide: ReadWebDiscovery,
      inject: [WebDiscoveryCatalogRepository],
      useFactory: (catalog: WebDiscoveryCatalogRepository) =>
        new ReadWebDiscovery(catalog),
    },
  ],
})
export class DiscoveryModule {}
