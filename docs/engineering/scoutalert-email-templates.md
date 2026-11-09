# ScoutAlert email templates

The API and worker use `ScoutEmailTemplates` through the core `EmailTemplates` presentation port. The API composes the renderer in `EmailModule`; the worker composes it alongside the existing SMTP provider. Use cases choose the message type and supply authorized data. They do not contain HTML or read configuration, SMTP clients or data sources.

## Current messages

| Message            | Trigger                                         | Essential content                                                                                                                                    |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in code       | Existing browser-bound verification request     | Selectable six-digit code, actual expiry duration, latest-code instruction, browser binding, unsolicited-request guidance and separate alert consent |
| Opportunity digest | Existing daily or weekly delivery window        | All reserved postings, supporting reasons, unresolved questions, dated evidence, source links, dashboard and alert settings                          |
| Prompt match alert | Existing strict strong-match eligibility policy | The same evidence layout with distinct alert wording; presentation cannot authorize a prompt alert                                                   |
| Delivery test      | Explicit `email:check --to`                     | Clearly identified diagnostic with no sign-in code, account creation or subscription effect                                                          |

No welcome, marketing, empty-results or billing messages are introduced. Those workflows do not currently send email. Cadence, recipient reservations, consent checks, duplicate prevention and ambiguous SMTP outcomes retain their existing application rules.

## Design and client behavior

The collection follows the web product's ink (`#191c22`), lime (`#d9ef70`), pale green (`#f1f5df`), white and cool gray palette. A 600px content column, generous spacing, a large selectable code and evidence-first opportunity summaries create a consistent hierarchy. The wordmark is text, so blocked images never hide the brand or essential content. Arial/Helvetica are deliberate system-font fallbacks for email; no web-font downloads, scripts, tracking pixels or external assets are required.

HTML uses presentation tables, inline styles, Outlook width/spacing fallbacks, responsive adjustments and optional dark-mode styles. Plain text contains the same actionable information. Sign-in codes appear only in the body, not in the subject or explicit preheader. Client preview generation is outside our control.

Dynamic text is HTML-escaped, and source links are limited to HTTP(S) without embedded credentials or control characters. Public employer evidence retains its dates and citations. Private background text and criterion-level brief quotes are not included. No missing salary, company, location, date or availability is invented.

Digests over 90KB of rendered HTML switch to compact summaries of every reserved opportunity (the repository currently caps a digest at 20). Each summary retains its uncertainty count and clearly directs the reader to the full evidence. Complete reasons, uncertainties and research remain in plain text and on the dashboard. This reduces clipping risk while keeping alert settings visible; individual email clients may apply their own limits.

The footer's **Manage alerts** link opens `/dashboard/scouts`, where the user can edit alert frequency or disable email. It is not a one-click unsubscribe endpoint. Sign-in emails have no sign-in link because the code is bound to the requesting browser.

## Configure and preview

Set `SCOUTALERT_WEB_ORIGIN` on both hosts to the deployed website origin, such as `https://app.your-domain.com`. SMTP mode refuses a missing, non-HTTPS, local/test, IP-address or credential-bearing origin. Mailpit defaults to `http://localhost:3030`. This setting already names the public origin in the web app; keep it consistent across hosts.

From the repository root:

```sh
pnpm email:preview
```

Open `dist/email-previews/index.html`. Select a message, switch between mobile and desktop widths, or open its HTML/plain-text file. Examples are fictional and never load real users, generate live sign-in codes, call models or submit SMTP messages. Generated files are ignored build output. To write elsewhere after building, use `node scripts/preview-emails.mjs --out=/absolute/preview-directory`.

## Verification

Focused presentation tests cover code handling, expiry and consent wording, both text alternatives, hostile source content, unsafe links, missing fields, private-brief exclusion, employer citations and large digests. Existing identity and worker integration tests check the rendered HTML as part of the real request/reservation flow. Mailpit checks compare the full HTML and text captured by SMTP for all four types.

```sh
pnpm --filter api exec vitest run src/composition/email-templates.spec.ts src/config/email.configuration.spec.ts src/composition/smtp-email-provider.spec.ts
IDENTITY_INTEGRATION=1 MAILPIT_INTEGRATION=1 SMTP_INTEGRATION=1 pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/identity-activation.e2e-spec.ts test/mailpit-email.e2e-spec.ts test/smtp-email.e2e-spec.ts
SCOUTING_INTEGRATION=1 pnpm --filter worker exec vitest run test/scouting.integration.spec.ts test/research-delivery.integration.spec.ts
```

Integration tests need the local test database, Redis and Mailpit; TLS tests also need OpenSSL. They use synthetic accounts and local capture, without model usage. Browser previews cover desktop, 375px and 320px widths, dark-mode styling and removal of head styles. Browser rendering and Mailpit do not replace inbox checks in actual Gmail, Outlook and Apple Mail. Perform those through the selected provider before launch.
