# Local email with Mailpit

Mailpit is the local email capture destination for ScoutAlert. The API uses the same SMTP adapter boundary intended for identity emails and opportunity notifications; Mailpit remains a development dependency. A production provider is still a separate adoption decision.

## Current local instance

The existing Docker container on the current development machine is `immureg-e2e-mailpit`. Its SMTP port is published on `1025`, and its inbox/API on `8025`. ScoutAlert reuses it without replacing the container or clearing its mailbox.

```sh
docker start immureg-e2e-mailpit
```

Open [the local inbox](http://localhost:8025). Sign-in codes captured there now verify local development accounts when submitted through the initiating onboarding browser. A successful code exchange establishes identity; scout activation remains a separate confirmed action.

## API configuration

The API loads `apps/api/.env`. Its committed `.env.example` contains these settings:

```dotenv
MAILPIT_HOST=127.0.0.1
MAILPIT_SMTP_PORT=1025
EMAIL_FROM_ADDRESS=no-reply@scoutalert.test
EMAIL_FROM_NAME=ScoutAlert
```

Mailpit's default listener uses neither authentication nor TLS. The API currently runs on the host and uses the published port. If the API later runs in Docker, configure `MAILPIT_HOST` to a reachable container/service name on a shared network; container loopback points back to the API container. [Mailpit SMTP documentation](https://mailpit.axllent.org/docs/configuration/smtp/).

Configuration is validated before client construction. Mailpit composition is refused under `NODE_ENV=production`; a real provider must be composed deliberately for deployment.

## Verify local delivery

From the repository root:

```sh
pnpm --filter api email:check
```

The command builds the relevant packages, uses the API's NestJS email composition, submits a synthetic text/HTML message to `email-check@scoutalert.test`, prints its MIME message ID, and closes the connection pool. Find the message with subject **ScoutAlert local email connection check** in Mailpit.

For a real SMTP and inbox integration test:

```sh
pnpm --filter @repo/core build
pnpm --filter @repo/adapters build
MAILPIT_INTEGRATION=1 pnpm --filter api test:e2e
```

The optional integration test reads only its own synthetic message by Message-ID and checks the sender, recipient, subject, text, and HTML. Set `MAILPIT_HTTP_URL` when the inbox/API uses another address. Test configuration comes from the process environment, rather than the API's local `.env`. Ordinary tests skip the Mailpit integration when the flag is absent.

## Architectural ownership

- `@repo/core/notifications` owns the `EmailProvider` contract and provider-independent submission outcomes.
- `@repo/adapters/notifications` implements that contract using Nodemailer SMTP.
- The API's `composition/email.module.ts` validates configuration, constructs one shared pool, binds the port through NestJS DI, and closes it on shutdown.
- Identity use cases own challenges, expiry, attempts, browser binding, and session creation. Notification use cases will own eligibility, durable dispatch, and delivery reconciliation; activation already records the separate opportunity-alert consent decision.

The pool has bounded connection/greeting/socket waits, two connections by default, and automatic requeue disabled. Message IDs support tracing; they do not deduplicate SMTP deliveries. An accepted SMTP submission does not establish recipient delivery, and an uncertain failure must not be blindly retried. [Nodemailer pooled transport documentation](https://nodemailer.com/smtp/pooled).

The onboarding email/code screens use actual Mailpit codes. The old demonstration code has been removed. The API exposes no arbitrary email-send HTTP route. See [connected onboarding](scoutalert-connected-onboarding.md) for identity, session, database migration, activation and test details.
