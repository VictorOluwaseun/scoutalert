import { Module } from '@nestjs/common';
import {
  IDENTITY_CONFIGURATION,
  readIdentityConfiguration,
} from '../config/identity.configuration.js';
import { WebRequestGuard } from '../shared/guards/web-request.guard.js';

/** Composes private HTTP admission and validated secrets independently of database lifecycle. */
@Module({
  providers: [
    { provide: IDENTITY_CONFIGURATION, useFactory: readIdentityConfiguration },
    WebRequestGuard,
  ],
  exports: [IDENTITY_CONFIGURATION, WebRequestGuard],
})
export class SecurityModule {}
