import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ManageMailConnection } from '@repo/core/connections';
import { z } from 'zod';
import {
  AccountSessionGuard,
  type AccountRequest,
} from '../../shared/guards/account-session.guard.js';
import { WebRequestGuard } from '../../shared/guards/web-request.guard.js';

/** Exposes private mail controls exclusively through a verified ScoutAlert account and trusted web host. */
@Controller('v1/connections/gmail')
@UseGuards(WebRequestGuard, AccountSessionGuard)
export class ConnectionsController {
  /** Receives the framework-independent application use case. */
  constructor(
    @Inject(ManageMailConnection) private readonly mail: ManageMailConnection,
  ) {}

  /** Returns safe status and bounded private imports, with no grant or provider cursor. */
  @Header('Cache-Control', 'no-store, private')
  @Get()
  async read(@Req() request: AccountRequest) {
    return {
      ...(await this.mail.read(request.account.id)),
      account: { id: request.account.id, email: request.account.email },
    };
  }

  /** Creates a state bound to the current owner and initiating browser. */
  @Header('Cache-Control', 'no-store, private')
  @Post('begin')
  @HttpCode(200)
  begin(@Req() request: AccountRequest) {
    return this.mail.begin(request.account.id, request.get('x-scout-browser')!);
  }

  /** The trusted web callback relays an authorization code; core validates browser-bound, single-use state. */
  @Header('Cache-Control', 'no-store, private')
  @Post('finish')
  @HttpCode(200)
  async finish(@Req() request: AccountRequest, @Body() body: unknown) {
    const parsed = z
      .strictObject({
        state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        code: z.string().min(1).max(4096),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'invalid_request' });
    }
    await this.mail.finish(
      request.account.id,
      request.get('x-scout-browser')!,
      parsed.data.state,
      parsed.data.code,
    );
    return { connected: true };
  }

  /** Returns user-created labels for explicit scope selection without reading messages. */
  @Header('Cache-Control', 'no-store, private')
  @Get('labels')
  labels(@Req() request: AccountRequest) {
    return this.mail.labels(request.account.id);
  }

  /** Saves the provider-verified label and removes evidence from any previous label. */
  @Header('Cache-Control', 'no-store, private')
  @Post('label')
  @HttpCode(200)
  async label(@Req() request: AccountRequest, @Body() body: unknown) {
    const parsed = z
      .strictObject({ id: z.string().min(1).max(200) })
      .safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'invalid_request' });
    }
    await this.mail.select(request.account.id, parsed.data.id);
    return { saved: true };
  }

  /** Durably schedules bounded processing outside the HTTP request. */
  @Header('Cache-Control', 'no-store, private')
  @Post('import')
  @HttpCode(200)
  async import(@Req() request: AccountRequest) {
    await this.mail.import(request.account.id);
    return { queued: true };
  }

  /** Revokes local access and deletes imported content before attempting remote grant revocation. */
  @Header('Cache-Control', 'no-store, private')
  @Post('disconnect')
  @HttpCode(200)
  disconnect(@Req() request: AccountRequest) {
    return this.mail.disconnect(request.account.id);
  }
}
