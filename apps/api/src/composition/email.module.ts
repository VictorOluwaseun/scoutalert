import {
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  createSmtpClient,
  SmtpEmailProvider,
  ScoutEmailTemplates,
  readEmailConfiguration,
  type EmailConfiguration,
  type SmtpClient,
} from '@repo/adapters/notifications';
import {
  EmailProvider,
  EmailTemplates,
  FallbackEmailProvider,
} from '@repo/core/notifications';

export const EMAIL_CONFIGURATION = Symbol('Email configuration');
export const SMTP_CLIENT = Symbol('SMTP client');
export const FALLBACK_SMTP_CLIENT = Symbol('Fallback SMTP client');

/** Owns the SMTP pool lifecycle in the composition root, outside application services. */
@Injectable()
class EmailTransportLifecycle implements OnApplicationShutdown {
  /** Receives the singleton client constructed by this module. */
  constructor(
    @Inject(SMTP_CLIENT) private readonly client: SmtpClient,
    @Inject(FALLBACK_SMTP_CLIENT) private readonly fallback: SmtpClient | null,
  ) {}

  /** Closes pooled connections when the Nest application or command shuts down. */
  onApplicationShutdown(): void {
    this.client.close();
    this.fallback?.close();
  }
}

/** Composes local capture or production SMTP behind the same framework-independent email port. */
@Module({
  providers: [
    { provide: EMAIL_CONFIGURATION, useFactory: readEmailConfiguration },
    {
      provide: EmailTemplates,
      inject: [EMAIL_CONFIGURATION],
      useFactory: (configuration: EmailConfiguration): EmailTemplates =>
        new ScoutEmailTemplates(configuration.publicOrigin),
    },
    {
      provide: SMTP_CLIENT,
      inject: [EMAIL_CONFIGURATION],
      useFactory: (configuration: EmailConfiguration): SmtpClient =>
        createSmtpClient(configuration.transport),
    },
    {
      provide: FALLBACK_SMTP_CLIENT,
      inject: [EMAIL_CONFIGURATION],
      useFactory: (configuration: EmailConfiguration): SmtpClient | null =>
        configuration.fallbackTransport
          ? createSmtpClient(configuration.fallbackTransport)
          : null,
    },
    {
      provide: EmailProvider,
      inject: [SMTP_CLIENT, FALLBACK_SMTP_CLIENT, EMAIL_CONFIGURATION],
      useFactory: (
        client: SmtpClient,
        fallback: SmtpClient | null,
        configuration: EmailConfiguration,
      ): EmailProvider => {
        const primary = new SmtpEmailProvider(client, configuration.sender);
        return fallback
          ? new FallbackEmailProvider(
              primary,
              new SmtpEmailProvider(fallback, configuration.sender),
            )
          : primary;
      },
    },
    EmailTransportLifecycle,
  ],
  exports: [
    EmailProvider,
    EmailTemplates,
    SMTP_CLIENT,
    FALLBACK_SMTP_CLIENT,
    EMAIL_CONFIGURATION,
  ],
})
export class EmailModule {}
