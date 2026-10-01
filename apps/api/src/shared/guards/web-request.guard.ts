import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import {
  IDENTITY_CONFIGURATION,
  type IdentityConfiguration,
} from '../../config/identity.configuration.js';

/** Admits only the trusted Next.js host; browser identity/rate-limit context cannot be forged publicly. */
@Injectable()
export class WebRequestGuard implements CanActivate {
  /** Receives the private shared transport key through the security composition module. */
  constructor(
    @Inject(IDENTITY_CONFIGURATION)
    private readonly config: IdentityConfiguration,
  ) {}
  /** Checks admission and a bounded opaque browser handle before any use case executes. */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const candidate = Buffer.from(request.get('x-scout-web-key') ?? '');
    const expected = Buffer.from(this.config.WEB_API_SECRET);
    if (
      candidate.length !== expected.length ||
      !timingSafeEqual(candidate, expected)
    )
      throw new UnauthorizedException({ code: 'unauthorized_client' });
    if (!/^[a-f0-9]{64}$/.test(request.get('x-scout-browser') ?? ''))
      throw new UnauthorizedException({ code: 'invalid_browser' });
    return true;
  }
}
