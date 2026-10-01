import { Module } from '@nestjs/common';
import {
  NodeIdentityCredentials,
  PostgresIdentityRepository,
  PostgresIdentityUnitOfWork,
  RedisIdentityRateLimits,
} from '@repo/adapters/identity';
import {
  AccountAccess,
  IdentityCredentials,
  IdentityRateLimits,
  IdentityRepository,
  IdentityUnitOfWork,
  RequestEmailCode,
  VerifyEmailCode,
} from '@repo/core/identity';
import { EmailProvider } from '@repo/core/notifications';
import { EmailModule } from '../../composition/email.module.js';
import { SecurityModule } from '../../composition/security.module.js';
import {
  StorageModule,
  POSTGRES_CLIENT,
  REDIS_CLIENT,
  type PostgresClient,
  type RedisClient,
} from '../../composition/storage.module.js';
import {
  IDENTITY_CONFIGURATION,
  type IdentityConfiguration,
} from '../../config/identity.configuration.js';
import { AccountSessionGuard } from '../../shared/guards/account-session.guard.js';
import { IdentityController } from './identity.controller.js';

/** Composes one identity implementation used by every account-scoped product feature. */
@Module({
  imports: [SecurityModule, StorageModule, EmailModule],
  controllers: [IdentityController],
  providers: [
    {
      provide: IdentityCredentials,
      inject: [IDENTITY_CONFIGURATION],
      useFactory: (config: IdentityConfiguration) =>
        new NodeIdentityCredentials(config.IDENTITY_SECRET),
    },
    {
      provide: IdentityRepository,
      inject: [POSTGRES_CLIENT],
      useFactory: (db: PostgresClient) => new PostgresIdentityRepository(db),
    },
    {
      provide: IdentityUnitOfWork,
      inject: [POSTGRES_CLIENT],
      useFactory: (db: PostgresClient) => new PostgresIdentityUnitOfWork(db),
    },
    {
      provide: IdentityRateLimits,
      inject: [REDIS_CLIENT],
      useFactory: (redis: RedisClient) => new RedisIdentityRateLimits(redis),
    },
    {
      provide: RequestEmailCode,
      inject: [
        IdentityUnitOfWork,
        IdentityRepository,
        IdentityRateLimits,
        IdentityCredentials,
        EmailProvider,
      ],
      useFactory: (
        uow: IdentityUnitOfWork,
        records: IdentityRepository,
        limits: IdentityRateLimits,
        credentials: IdentityCredentials,
        email: EmailProvider,
      ) =>
        new RequestEmailCode(
          uow,
          records,
          limits,
          credentials,
          email,
          () => new Date(),
        ),
    },
    {
      provide: VerifyEmailCode,
      inject: [IdentityUnitOfWork, IdentityRateLimits, IdentityCredentials],
      useFactory: (
        uow: IdentityUnitOfWork,
        limits: IdentityRateLimits,
        credentials: IdentityCredentials,
      ) => new VerifyEmailCode(uow, limits, credentials, () => new Date()),
    },
    {
      provide: AccountAccess,
      inject: [IdentityRepository, IdentityCredentials],
      useFactory: (
        records: IdentityRepository,
        credentials: IdentityCredentials,
      ) => new AccountAccess(records, credentials, () => new Date()),
    },
    AccountSessionGuard,
  ],
  exports: [AccountAccess, AccountSessionGuard],
})
export class IdentityModule {}
