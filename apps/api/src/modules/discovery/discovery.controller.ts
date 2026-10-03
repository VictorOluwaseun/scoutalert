import {
  Controller,
  Get,
  Header,
  Inject,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReadWebDiscovery } from '@repo/core/discovery';
import {
  AccountSessionGuard,
  type AccountRequest,
} from '../../shared/guards/account-session.guard.js';
import { WebRequestGuard } from '../../shared/guards/web-request.guard.js';

/** Exposes private discovery associations through verified sessions without disclosing shared query keys or other accounts. */
@Controller('v1/discovery')
@UseGuards(WebRequestGuard, AccountSessionGuard)
export class DiscoveryController {
  /** Receives the framework-independent read use case through Nest injection. */
  constructor(
    @Inject(ReadWebDiscovery) private readonly read: ReadWebDiscovery,
  ) {}

  /** Returns current-revision activity, monitored pages, bounded excerpts and native post provenance; private responses are never publicly cached. */
  @Get()
  @Header('Cache-Control', 'no-store, private')
  async list(@Req() request: AccountRequest) {
    return {
      ...(await this.read.execute(request.account.id)),
      account: { id: request.account.id, email: request.account.email },
    };
  }
}
