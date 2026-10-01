import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { EmailModule } from './composition/email.module.js';
import { loadLocalEnvironment } from './config/environment.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { ScoutActivationModule } from './modules/onboarding/scout-activation.module.js';
import { ScoutsModule } from './modules/scouts/scouts.module.js';
import { ApplicationErrorFilter } from './shared/filters/application-error.filter.js';

loadLocalEnvironment();

export const { ObserveModule, ObserveInstrument } = createObserveModule();

/** Registers Observe only when both credentials are available outside tests. */
function createObserveImports(): DynamicModule[] {
  if (process.env.NODE_ENV === 'test') return [];

  const appKey = process.env.OBSERVE_APP_KEY?.trim();
  const appSecret = process.env.OBSERVE_APP_SECRET?.trim();

  if (!appKey && !appSecret) return [];
  if (!appKey || !appSecret) {
    throw new Error(
      'OBSERVE_APP_KEY and OBSERVE_APP_SECRET must be set together',
    );
  }

  return [
    ObserveModule.forRoot({
      appKey,
      appSecret,
      serviceId: process.env.OBSERVE_SERVICE_ID?.trim() || 'api',
      http: { capture: false },
    }),
  ];
}

const observeImports = createObserveImports();
export const observeEnabled = observeImports.length > 0;

/** Composes the API starter's HTTP bindings and configured observability integration. */
@Module({
  imports: [
    OnboardingModule,
    EmailModule,
    IdentityModule,
    ScoutActivationModule,
    ScoutsModule,
    ...observeImports,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: ApplicationErrorFilter },
  ],
})
export class AppModule {}
