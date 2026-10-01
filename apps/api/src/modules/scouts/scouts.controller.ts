import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ListScouts, type ScoutCursor } from '@repo/core/scouts';
import { ReadOpportunityFeed } from '@repo/core/scouting';
import { z } from 'zod';
import {
  AccountSessionGuard,
  type AccountRequest,
} from '../../shared/guards/account-session.guard.js';
import { WebRequestGuard } from '../../shared/guards/web-request.guard.js';

const cursorSchema = z.strictObject({
  activatedAt: z.iso.datetime(),
  id: z.uuid(),
});
const querySchema = z.strictObject({
  after: z
    .string()
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});

/** Decodes only bounded, canonical keyset markers; cursors never grant account access. */
function decodeCursor(value: string | undefined): ScoutCursor | null {
  if (!value) {
    return null;
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    const parsed = cursorSchema.safeParse(decoded);

    if (!parsed.success) {
      throw new Error('invalid_cursor');
    }

    if (
      new Date(parsed.data.activatedAt).toISOString() !==
      parsed.data.activatedAt
    ) {
      throw new Error('invalid_cursor');
    }

    return parsed.data;
  } catch {
    throw new BadRequestException({ code: 'invalid_cursor' });
  }
}

/** Presents the authenticated account's saved scouts independently of onboarding routes. */
@Controller('v1/scouts')
@UseGuards(WebRequestGuard, AccountSessionGuard)
export class ScoutsController {
  /** Receives the framework-independent list use case through Nest composition. */
  constructor(
    @Inject(ListScouts) private readonly listScouts: ListScouts,
    @Inject(ReadOpportunityFeed) private readonly feed: ReadOpportunityFeed,
  ) {}

  /** Binds the owner to the verified session and returns a private, bounded page with safe account markers. */
  @Get()
  @Header('Cache-Control', 'no-store, private')
  async list(@Query() query: unknown, @Req() request: AccountRequest) {
    const parsed = querySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException({ code: 'invalid_cursor' });
    }

    const page = await this.listScouts.execute(
      request.account.id,
      decodeCursor(parsed.data.after),
    );

    return {
      ...(await this.feed.execute(
        request.account.id,
        page.items.map((scout) => scout.id),
      )),
      account: { id: request.account.id, email: request.account.email },
      items: page.items,
      nextCursor: page.next
        ? Buffer.from(JSON.stringify(page.next)).toString('base64url')
        : null,
    };
  }
}
