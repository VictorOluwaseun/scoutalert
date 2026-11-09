# Production email for sign-in codes and opportunity alerts

Both the API and worker now use one validated email configuration and the existing Nodemailer 10.0.12 adapter. The API sends sign-in codes; the worker sends consented opportunity digests and prompt alerts. The durable delivery ledger, current-consent checks and uncertain-outcome holds remain authoritative. This change does not alter model tokens, paid AI budgets, scout quotas or database schema.

## Configure a provider and sender

Choose a transactional email provider with authenticated SMTP. Obtain its SMTP hostname, port, username and password or SMTP API key. Add a domain you control in that provider's dashboard and publish the exact DNS records it supplies for SPF/DKIM verification. Configure [DMARC](https://resend.com/docs/dashboard/domains/dmarc) for the sending domain and check provider verification before sending to users. DNS values are provider/account-specific; use the values provided for your own domain.

For example, [Resend SMTP](https://resend.com/docs/send-with-smtp) uses `smtp.resend.com`, username `resend`, and an API key as the password. Port 587 uses STARTTLS; port 465 uses implicit TLS. Resend requires a [verified sending domain](https://resend.com/docs/dashboard/domains/introduction). This is a supported configuration example, not a provider subscription or an account created by this change.

Supply the following private environment settings to **both deployed API and worker processes**. The local worker already inherits `apps/api/.env`; do not duplicate conflicting settings in `apps/worker/.env`. Hosted services need their own secret/environment injection.

```dotenv
NODE_ENV=production
EMAIL_PROVIDER=smtp
SCOUTALERT_WEB_ORIGIN=https://app.your-domain.com
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=resend
SMTP_PASSWORD=replace-with-your-provider-secret
EMAIL_FROM_ADDRESS=no-reply@your-verified-domain.com
EMAIL_FROM_NAME=ScoutAlert
# Optional: a mailbox you actually monitor; sending-domain verification does not create an inbox.
EMAIL_REPLY_TO=support@your-domain.com
```

Use your provider's host and credentials if you choose another service. `EMAIL_FROM_ADDRESS` must belong to your verified sender identity. API and worker may use different verified sender addresses or provider credentials when deliberately configured. Never put SMTP credentials in `NEXT_PUBLIC_*`, committed files, logs or chat messages. Existing database, identity, web-host, Temporal and discovery settings are still required independently.

`SCOUTALERT_WEB_ORIGIN` is also required in SMTP mode. Set it to the real public HTTPS website origin, without a path, query or credentials. It supplies the dashboard and alert-settings links in the shared HTML and plain-text templates. Local Mailpit defaults to `http://localhost:3030`. A paid mailbox's SMTP service is only appropriate if its provider permits transactional sending; use the provider's transactional SMTP credentials for automated codes and alerts.

`SMTP_PORT` defaults to 587. `SMTP_SECURE` defaults to true on port 465 and false otherwise; set it explicitly for nonstandard TLS ports such as 2465. False always requires a successful STARTTLS upgrade in SMTP mode. Certificates are checked and TLS 1.2 or later is required; there is no insecure production fallback. Missing credentials, local/test sender domains and conflicting 465/587 security settings fail before any connection is created. See [Nodemailer SMTP configuration](https://nodemailer.com/smtp).

Local development defaults to `EMAIL_PROVIDER=mailpit`, which continues using `MAILPIT_HOST`, `MAILPIT_SMTP_PORT` and the `.test` sender. Production refuses Mailpit. A reply address is optional; omit it or leave `EMAIL_REPLY_TO` empty to omit the header.

## Verify and activate

1. Build adapters, API and worker with their package build commands. The API `email:check` command builds its dependencies automatically.
2. From the repository root run `pnpm --filter api email:check` with the intended production environment. It verifies connectivity, TLS and authentication without sending. For an already built deployment run `node apps/api/dist/scripts/check-email.js` from the repository root, or `node dist/scripts/check-email.js` in the API directory. Run the same check with the worker's effective email environment if its credentials differ. Verification does not prove the provider accepts the configured sender.
3. Explicitly send to an inbox you control: `node apps/api/dist/scripts/check-email.js --to=your-real-address`. Check the inbox, spam folder and provider delivery dashboard. The command sends one diagnostic message and prints only the acceptance/message ID. Provider errors and credentials are suppressed.
4. Restart API and worker after configuring their environments. Sign in through the deployed web app and verify the code arrives and works. Activate a test scout with alert consent, then confirm an eligible opportunity alert arrives and that its durable status is accepted. Replaying the same delivery must not produce a second email. Use the existing guarded discovery flow and caps for any model-dependent test.

Connection verification is read-only with respect to email submission. Only `--to` sends a diagnostic message. This implementation pass did not contact an external email provider or send to a real inbox; provider credentials, domain verification and hosted smoke checks remain operator setup.

## Delivery boundaries

SMTP acceptance means the provider accepted the message; it does not prove inbox delivery. Inspect provider delivery/bounce/complaint records and enable its suppression controls before a public beta. Provider webhook ingestion and application-side bounce/complaint reconciliation are not implemented in this SMTP increment. Stable MIME IDs identify attempts but do not provide universal SMTP idempotency. Automatic requeue remains disabled; ambiguous submissions retain their existing hold and must not be blindly resent.

The check command verifies the API's actual Nest binding. Both hosts construct the same bounded SMTP pool and use the same adapter. Logs expose the selected delivery mode, not usernames, passwords or message bodies. The worker prints a Mailpit inbox link only in local mode.

## Verification

The change passed 28 API unit checks, 51 worker configuration/beta checks, five native SMTP integration checks (STARTTLS, implicit TLS, absent TLS, untrusted certificate and rejected authentication), ten sign-in/Mailpit integration checks, and 14 opportunity-delivery database checks. The TLS fixture uses ephemeral certificates and loopback sockets; its messages never leave the machine. Identity tests now use a disposable schema and explicitly select local capture rather than inheriting deployment beta/email settings. Adapters/API/worker builds, API type checking and architectural boundary checks passed.

Reproduce transport verification with `SMTP_INTEGRATION=1 pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts test/smtp-email.e2e-spec.ts`. It requires OpenSSL to generate a temporary local certificate. Existing identity and opportunity integration suites additionally use the isolated test database, Redis and Mailpit. No live AI calls are needed.
