import { MailConnectionError } from '@repo/core/connections';
import { ScoutManagementError, FeedbackError } from '@repo/core/scouts';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  type ExceptionFilter,
} from '@nestjs/common';
import { IdentityError } from '@repo/core/identity';
import { ActivationError } from '@repo/core/onboarding';
import type { Response } from 'express';

/** Presents safe application failures and suppresses private provider/database payloads in error output. */
@Catch()
export class ApplicationErrorFilter implements ExceptionFilter {
  /** Maps expected failures; unexpected errors expose only a neutral availability code. */
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (error instanceof IdentityError && error.retryAfter !== undefined) {
      response.setHeader('Retry-After', error.retryAfter);
    }

    if (error instanceof IdentityError) {
      const status =
        error.code === 'rate_limited'
          ? 429
          : error.code === 'unauthenticated'
            ? 401
            : error.code === 'email_unavailable'
              ? 503
              : 422;
      response
        .status(status)
        .json({ code: error.code, retryAfter: error.retryAfter });

      return;
    }

    if (error instanceof ActivationError) {
      response
        .status(error.code === 'activation_conflict' ? 409 : 422)
        .json({ code: error.code, message: error.detail });

      return;
    }

    if (
      error instanceof ScoutManagementError ||
      error instanceof FeedbackError
    ) {
      const missing =
        error.code === 'scout_not_found' ||
        error.code === 'opportunity_not_found';
      const issues =
        error instanceof ScoutManagementError ? error.issues : undefined;
      response
        .status(
          missing ? 404 : error.code === 'search_needs_changes' ? 422 : 409,
        )
        .json({ code: error.code, issues });

      return;
    }

    if (error instanceof MailConnectionError) {
      response
        .status(
          error.code === 'connection_unavailable'
            ? 503
            : error.code === 'import_limited'
              ? 429
              : 409,
        )
        .json({ code: error.code });
      return;
    }

    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());

      return;
    }

    console.error(
      'ScoutAlert request failed with an unexpected application error.',
    );
    response.status(503).json({ code: 'service_unavailable' });
  }
}
