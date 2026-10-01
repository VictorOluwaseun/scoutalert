import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ManageScout,
  ScoutManagementRepository,
  RecordOpportunityFeedback,
} from '@repo/core/scouts';
import { z } from 'zod';
import {
  AccountSessionGuard,
  type AccountRequest,
} from '../../shared/guards/account-session.guard.js';
import { WebRequestGuard } from '../../shared/guards/web-request.guard.js';
import { searchReviewRequestSchema } from '../onboarding/search-review.schema.js';
import { scoutAlertsSchema } from '../onboarding/scout-alerts.schema.js';

const revision = {
  key: z.uuid(),
  version: z.number().int().positive().max(2147483646),
};
const changeSchema = z.discriminatedUnion('action', [
  z.strictObject({
    ...revision,
    action: z.literal('update'),
    search: searchReviewRequestSchema.shape.search,
    alerts: scoutAlertsSchema,
  }),
  z.strictObject({ ...revision, action: z.literal('pause') }),
  z.strictObject({ ...revision, action: z.literal('resume') }),
]);
const feedbackSchema = z.strictObject({
  key: z.uuid(),
  version: z.number().int().min(0).max(2147483646),
  postingId: z.string().min(1).max(300),
  value: z.enum(['relevant', 'hidden', 'none']),
});

/** Authenticated controls bind every mutation to the verified session, never a browser-supplied owner. */
@Controller('v1/scouts')
@UseGuards(WebRequestGuard, AccountSessionGuard)
export class ScoutControlsController {
  /** Receives inward use cases and owner-scoped reads from native Nest composition. */
  constructor(
    @Inject(ManageScout) private readonly manage: ManageScout,
    @Inject(ScoutManagementRepository)
    private readonly scouts: ScoutManagementRepository,
    @Inject(RecordOpportunityFeedback)
    private readonly feedback: RecordOpportunityFeedback,
  ) {}

  /** Returns an editable snapshot with its concurrency revision; foreign IDs are indistinguishable from missing ones. */
  @Get(':id')
  @Header('Cache-Control', 'no-store, private')
  async find(@Param('id') id: string, @Req() request: AccountRequest) {
    this.validateId(id);
    const scout = await this.scouts.find(request.account.id, id);
    if (!scout) throw new NotFoundException({ code: 'scout_not_found' });
    return {
      scout,
      account: { id: request.account.id, email: request.account.email },
    };
  }

  /** Revalidates confirmed changes, preserving explicit idempotency and stale-tab protection. */
  @Post(':id/change')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  change(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AccountRequest,
  ) {
    this.validateId(id);
    const parsed = changeSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({ code: 'invalid_request' });
    return this.manage.execute(request.account.id, id, parsed.data);
  }

  /** Records explicit relevance or hiding choices only for opportunities previously recommended to this owner. */
  @Post('feedback')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  recordFeedback(@Body() body: unknown, @Req() request: AccountRequest) {
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({ code: 'invalid_request' });
    const { postingId, ...input } = parsed.data;
    return this.feedback.execute(request.account.id, postingId, input);
  }

  /** Rejects invalid target syntax before repository calls. */
  private validateId(id: string): void {
    if (!z.uuid().safeParse(id).success)
      throw new BadRequestException({ code: 'invalid_request' });
  }
}
