import { scoutAlertsSchema } from './scout-alerts.schema.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ActivatedScoutRepository, ActivateScout } from '@repo/core/onboarding';
import { z } from 'zod';
import {
  AccountSessionGuard,
  type AccountRequest,
} from '../../shared/guards/account-session.guard.js';
import { WebRequestGuard } from '../../shared/guards/web-request.guard.js';
import { searchReviewRequestSchema } from './search-review.schema.js';

const activationSchema = z.strictObject({
  key: z.uuid(),
  search: searchReviewRequestSchema.shape.search,
  confirmed: z.literal(true),
  alerts: scoutAlertsSchema,
});

/** Authenticated onboarding activation and owner-scoped receipt recovery. */
@Controller('v1/onboarding/scouts')
@UseGuards(WebRequestGuard, AccountSessionGuard)
export class ScoutActivationController {
  /** Receives the authoritative activation use case and an inward owner-scoped read boundary. */
  constructor(
    @Inject(ActivateScout) private readonly activateScout: ActivateScout,
    @Inject(ActivatedScoutRepository)
    private readonly scouts: ActivatedScoutRepository,
  ) {}

  /** Revalidates confirmed answers and obtains the owner exclusively from the verified session. */
  @Post()
  @HttpCode(200)
  activate(@Body() body: unknown, @Req() request: AccountRequest) {
    const input = activationSchema.safeParse(body);

    if (!input.success) {
      throw new BadRequestException({ code: 'invalid_request' });
    }

    return this.activateScout.execute(
      request.account.id,
      request.get('x-scout-browser')!,
      input.data,
    );
  }

  /** Returns no record when the ID is absent or belongs to another account. */
  @Get(':id')
  async find(@Param('id') id: string, @Req() request: AccountRequest) {
    if (!z.uuid().safeParse(id).success) {
      throw new BadRequestException({ code: 'invalid_request' });
    }

    const scout = await this.scouts.find(request.account.id, id);

    if (!scout) {
      throw new NotFoundException({ code: 'scout_not_found' });
    }

    return scout;
  }
}
