import { Module } from '@nestjs/common';
import {
  createGmailClient,
  GmailSourceRepository,
  MailSecrets,
  PostgresMailConnectionRepository,
  readGmailConfiguration,
} from '@repo/adapters/connections';
import { ManageMailConnection } from '@repo/core/connections';
import { SecurityModule } from '../../composition/security.module.js';
import {
  POSTGRES_CLIENT,
  StorageModule,
  type PostgresClient,
} from '../../composition/storage.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ConnectionsController } from './connections.controller.js';

/** Composes optional Gmail access separately from public discovery and identity sign-in. */
@Module({
  imports: [SecurityModule, StorageModule, IdentityModule],
  controllers: [ConnectionsController],
  providers: [
    {
      provide: ManageMailConnection,
      inject: [POSTGRES_CLIENT],
      useFactory: (db: PostgresClient) => {
        const config = readGmailConfiguration(process.env);
        return new ManageMailConnection(
          new PostgresMailConnectionRepository(
            db,
            config ? new MailSecrets(config.encryptionKey) : null,
          ),
          config
            ? new GmailSourceRepository(() => createGmailClient(config))
            : null,
        );
      },
    },
  ],
})
export class ConnectionsModule {}
