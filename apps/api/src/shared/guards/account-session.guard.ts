import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AccountAccess, type Account } from '@repo/core/identity';
import type { Request } from 'express';

export type AccountRequest = Request & { account: Account };

/** Resolves the current durable session through core before exposing any owner-scoped operation. */
@Injectable()
export class AccountSessionGuard implements CanActivate {
  /** Receives shared identity use cases, never a datasource or concrete repository. */
  constructor(@Inject(AccountAccess) private readonly access: AccountAccess) {}

  /** Stores only the verified owner in request context; browser-provided owner IDs are ignored. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AccountRequest>();
    const session = await this.access.require(
      request.get('x-scout-session') ?? null,
    );
    request.account = session.account;

    return true;
  }
}
