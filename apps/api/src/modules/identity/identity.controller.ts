import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccountAccess,
  RequestEmailCode,
  VerifyEmailCode,
} from '@repo/core/identity';
import type { Request } from 'express';
import { z } from 'zod';
import { WebRequestGuard } from '../../shared/guards/web-request.guard.js';

const emailSchema = z.strictObject({ email: z.string().max(254) });
const codeSchema = z.strictObject({
  id: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
});

/** Shared passwordless identity transport for onboarding and future account experiences. */
@Controller('v1/identity')
@UseGuards(WebRequestGuard)
export class IdentityController {
  /** Receives pure use cases through Nest providers; all datasource details remain in adapters. */
  constructor(
    @Inject(RequestEmailCode) private readonly requestCode: RequestEmailCode,
    @Inject(VerifyEmailCode) private readonly verifyCode: VerifyEmailCode,
    @Inject(AccountAccess) private readonly access: AccountAccess,
  ) {}
  /** Returns browser-scoped proof recovery and current authorized account, never session secrets. */
  @Get('context')
  context(@Req() request: Request) {
    return this.access.context(
      request.get('x-scout-browser')!,
      request.get('x-scout-session') ?? null,
    );
  }
  /** Uses the same neutral receipt for a new or existing email owner. */
  @Post('code')
  @HttpCode(200)
  request(@Body() body: unknown, @Req() request: Request) {
    const input = emailSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException({ code: 'invalid_request' });
    return this.requestCode.execute({
      email: input.data.email,
      browser: request.get('x-scout-browser')!,
      network: request.get('x-scout-network') ?? 'unattributed',
    });
  }
  /** Returns the session secret only over the private host boundary; Next.js places it in an HttpOnly cookie. */
  @Post('verify')
  @HttpCode(200)
  async verify(@Body() body: unknown, @Req() request: Request) {
    const input = codeSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException({ code: 'invalid_request' });
    const result = await this.verifyCode.execute({
      ...input.data,
      browser: request.get('x-scout-browser')!,
      network: request.get('x-scout-network') ?? 'unattributed',
      previousSession: request.get('x-scout-session') ?? null,
    });
    return {
      account: result.account,
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
    };
  }
  /** Revokes the durable session before the web host expires the browser cookie. */
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() request: Request) {
    await this.access.logout(request.get('x-scout-session') ?? null);
    return { status: 'signed_out' };
  }
}
