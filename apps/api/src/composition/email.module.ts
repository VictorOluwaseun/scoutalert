import {
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  createSmtpClient,
  SmtpEmailProvider,
  type SmtpClient,
} from '@repo/adapters/notifications';
import { EmailProvider } from '@repo/core/notifications';
import {
  readMailpitConfiguration,
  type MailpitConfiguration,
} from '../config/mailpit.configuration.js';

const mailpitConfiguration = Symbol('Mailpit configuration');
const smtpClient = Symbol('SMTP client');

/** Owns the SMTP pool lifecycle in the composition root, outside application services. */
@Injectable()
class EmailTransportLifecycle implements OnApplicationShutdown {
  /** Receives the singleton client constructed by this module. */
  constructor(@Inject(smtpClient) private readonly client: SmtpClient) {}

  /** Closes pooled connections when the Nest application or command shuts down. */
  onApplicationShutdown(): void {
    this.client.close();
  }
}

/** Composes local Mailpit email delivery behind the framework-independent email port. */
@Module({
  providers: [
    { provide: mailpitConfiguration, useFactory: readMailpitConfiguration },
    {
      provide: smtpClient,
      inject: [mailpitConfiguration],
      useFactory: (configuration: MailpitConfiguration): SmtpClient =>
        createSmtpClient({
          host: configuration.MAILPIT_HOST,
          port: configuration.MAILPIT_SMTP_PORT,
          secure: false,
        }),
    },
    {
      provide: EmailProvider,
      inject: [smtpClient, mailpitConfiguration],
      useFactory: (
        client: SmtpClient,
        configuration: MailpitConfiguration,
      ): EmailProvider =>
        new SmtpEmailProvider(client, {
          address: configuration.EMAIL_FROM_ADDRESS,
          name: configuration.EMAIL_FROM_NAME,
        }),
    },
    EmailTransportLifecycle,
  ],
  exports: [EmailProvider],
})
export class EmailModule {}
