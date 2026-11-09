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
import { EmailProvider, EmailTemplates } from '@repo/core/notifications';

export const EMAIL_CONFIGURATION = Symbol('Email configuration');
export const SMTP_CLIENT = Symbol('SMTP client');

/** Owns the SMTP pool lifecycle in the composition root, outside application services. */
@Injectable()
class EmailTransportLifecycle implements OnApplicationShutdown {
  /** Receives the singleton client constructed by this module. */
  constructor(@Inject(SMTP_CLIENT) private readonly client: SmtpClient) {}

  /** Closes pooled connections when the Nest application or command shuts down. */
  onApplicationShutdown(): void {
    this.client.close();
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
      provide: EmailProvider,
      inject: [SMTP_CLIENT, EMAIL_CONFIGURATION],
      useFactory: (
        client: SmtpClient,
        configuration: EmailConfiguration,
      ): EmailProvider => new SmtpEmailProvider(client, configuration.sender),
    },
    EmailTransportLifecycle,
  ],
  exports: [EmailProvider, EmailTemplates, SMTP_CLIENT, EMAIL_CONFIGURATION],
})
export class EmailModule {}
