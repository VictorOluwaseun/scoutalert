import {
  Inject,
  Injectable,
  Module,
  type OnModuleInit,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  createPostgresClient,
  createRedisClient,
} from '@repo/adapters/database';
import {
  IDENTITY_CONFIGURATION,
  type IdentityConfiguration,
} from '../config/identity.configuration.js';
import { SecurityModule } from './security.module.js';

export const POSTGRES_CLIENT = Symbol('POSTGRES_CLIENT');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export type PostgresClient = ReturnType<typeof createPostgresClient>;
export type RedisClient = ReturnType<typeof createRedisClient>;

/** Owns native client lifecycle at the composition boundary, without executing business queries. */
@Injectable()
class StorageLifecycle implements OnModuleInit, OnApplicationShutdown {
  /** Receives the singleton clients whose lifecycle this host owns. */
  constructor(
    @Inject(POSTGRES_CLIENT) private readonly postgres: PostgresClient,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}
  /** Connects Redis before accepting identity requests, so abuse protection cannot be skipped. */
  async onModuleInit(): Promise<void> {
    await this.redis.connect();
  }
  /** Closes the pool and Redis connection when Nest stops accepting requests. */
  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
    await this.postgres.destroy();
  }
}

/** Constructs bounded native clients once; repositories own all data-access operations. */
@Module({
  imports: [SecurityModule],
  providers: [
    {
      provide: POSTGRES_CLIENT,
      inject: [IDENTITY_CONFIGURATION],
      useFactory: (config: IdentityConfiguration) =>
        createPostgresClient(config.DATABASE_URL),
    },
    {
      provide: REDIS_CLIENT,
      inject: [IDENTITY_CONFIGURATION],
      useFactory: (config: IdentityConfiguration) =>
        createRedisClient(config.REDIS_URL),
    },
    StorageLifecycle,
  ],
  exports: [POSTGRES_CLIENT, REDIS_CLIENT],
})
export class StorageModule {}
