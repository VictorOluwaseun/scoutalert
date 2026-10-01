import { Module } from '@nestjs/common';
import { ReviewSearchDraft } from '@repo/core/onboarding';
import { OnboardingController } from './onboarding.controller.js';

/** Binds onboarding HTTP transport to its dependency-free application use case. */
@Module({
  controllers: [OnboardingController],
  providers: [ReviewSearchDraft],
})
export class OnboardingModule {}
