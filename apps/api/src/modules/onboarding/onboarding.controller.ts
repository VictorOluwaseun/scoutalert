import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ReviewSearchDraft } from '@repo/core/onboarding';
import { searchReviewRequestSchema } from './search-review.schema.js';

/** Exposes the deterministic onboarding review check over HTTP. */
@Controller('v1/onboarding')
export class OnboardingController {
  /** Receives the framework-independent review use case from the API module. */
  constructor(private readonly reviewSearchDraft: ReviewSearchDraft) {}

  /** Validates browser input and returns review readiness without storing or activating a scout. */
  @Post('review')
  @HttpCode(200)
  review(@Body() body: unknown): { status: 'review_ready' } {
    const request = searchReviewRequestSchema.safeParse(body);

    if (!request.success) {
      throw new BadRequestException({
        code: 'invalid_request',
        message: 'Search details are malformed.',
      });
    }

    const result = this.reviewSearchDraft.execute(request.data.search);

    if (!result.ready) {
      throw new UnprocessableEntityException({
        code: 'search_needs_changes',
        issues: result.issues,
      });
    }

    return { status: 'review_ready' };
  }
}
