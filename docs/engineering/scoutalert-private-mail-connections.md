# Private email connections

## What this adds

Gmail is the first account-based source. “Job alerts” means ordinary emails from job websites and newsletters, not a separate Google product. A person signs into ScoutAlert, connects Gmail through Google's consent screen, chooses a user-created Gmail label and requests an import. A label is Gmail's folder-like way to group messages. Gmail filters can apply a label to incoming alerts automatically; this release imports only when requested in ScoutAlert.

This extends discovery to email content the user chooses to share. It does not provide access to login-only websites linked from those emails, platform-wide LinkedIn access, or private communities. Public web and social discovery remain independent.

## Implemented status — 5 October 2026

- Connections page at `/dashboard/connections`, linked from dashboard navigation.
- Official Google OAuth client (`google-auth-library` 11.1.0), authorization code flow, S256 PKCE, browser/owner-bound ten-minute single-use state and offline readonly grant.
- Explicit user-label selection after consent. Connecting alone never imports message content.
- Durable, requested imports in the `scout-private-mail-v1` worker pool. A one-minute Temporal schedule is registered only with complete Gmail configuration.
- Owner-isolated encrypted grants and private email evidence, plain-text previews, replay deduplication and disconnect/label-change fencing.
- Disconnect deletes local imported content and credentials before attempting provider revocation. If remote revocation fails, the UI tells the user to remove ScoutAlert from Google account connections. Local erasure still works if the encryption key has been lost.
- Configuration is absent locally. No Gmail account has been connected and no real mailbox has been read.

Private imports are **unassessed source emails**. They do not enter the public posting catalog, shared cache, public model extraction, recommendations or outgoing opportunity emails. Private AI extraction, matching, research, notification eligibility, automatic ongoing mailbox checks and other account sources remain follow-up work. The UI says so explicitly.

## Local Google setup

Follow Google's [server-side Gmail authorization guide](https://developers.google.com/workspace/gmail/api/auth/web-server) and [web application OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

1. Choose a Google Cloud project for ScoutAlert and enable the Gmail API.
2. Configure the OAuth consent screen and audience. For local external testing, add the Gmail account that will connect as a test user.
3. Create an OAuth client of type **Web application**. Register the exact redirect URI `http://localhost:3030/api/connections/gmail/callback`. Use the same hostname for the ScoutAlert sign-in session and callback; `localhost` and `127.0.0.1` do not share host-only cookies.
4. Set all four private values below in `apps/api/.env`. The worker already loads this file. Do not place values in chat, browser configuration, committed files or `NEXT_PUBLIC_` variables.

```dotenv
GMAIL_CLIENT_ID=your-google-client-id
GMAIL_CLIENT_SECRET=your-google-client-secret
GMAIL_REDIRECT_URI=http://localhost:3030/api/connections/gmail/callback
CONNECTIONS_ENCRYPTION_KEY=independent-64-character-hex-key
```

Generate the encryption key locally using a cryptographic random generator, for example `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store it securely alongside the deployment configuration and retain it across restarts. Do not reuse `IDENTITY_SECRET` or `WEB_API_SECRET`. Key rotation needs an explicit re-encryption procedure; changing the key by itself makes existing grants/evidence unreadable.

5. Run the API migration and rebuild/restart API and worker processes. Keep `SCOUTALERT_WEB_ORIGIN` in the web environment equal to the callback's origin. Production callbacks require HTTPS.
6. Visit Connections, choose **Connect Gmail**, sign in on Google's screen and approve the requested scope. Create a Gmail label such as **ScoutAlert**, apply it to chosen alert messages, load/select that label in ScoutAlert, save it and choose **Import emails**.

The requested scope is `https://www.googleapis.com/auth/gmail.readonly`. Google grants mailbox-wide read access; Gmail does not grant a token restricted to a particular label. ScoutAlert's adapter enforces the narrower label selection. The UI explains that distinction before consent. No sending or modifying scope is requested. Google's [scope documentation](https://developers.google.com/workspace/gmail/api/auth/scopes) classifies this as restricted; complete the applicable verification/security assessment requirements before a public rollout. Test-mode grant expiry and provider revocation require reconnecting; local consent is never treated as proof that provider access remains valid.

## Architecture and invariants

Core `connections` defines application use cases and repository contracts. Adapters own PostgreSQL queries, Google API access, MIME parsing and authenticated encryption. Nest composes the API and guards, Next handles server-only transport/callback redirects, and the worker owns import execution. The API never performs message imports during an HTTP request.

State is hashed at rest, scoped to the current owner and initiating HttpOnly browser handle, expires after ten minutes and is consumed atomically. Consent generations fence callbacks that race with another connection attempt or disconnect. All transport mutations use existing origin/CSRF protection; Google's external callback uses the single-use state plus the existing account/browser session. Callback errors are fixed codes, never reflected provider text. Configure proxy/access logs to omit callback query values and authorization headers.

Grants, PKCE verifiers and message content use AES-256-GCM with fresh nonces and owner/purpose-associated data. No provider tokens enter client components, transport responses, model calls or Temporal arguments/results. All mailbox API destinations are fixed Google endpoints. Attachments, images and links in messages are never fetched, and rendered previews are text rather than executable HTML.

The three tables are `mail_connections`, `mail_oauth_states` and `private_mail_items`. No private record is linked into shared public discovery. The import lease is acquired with `FOR UPDATE SKIP LOCKED`; completion locks the same owner and verifies the exact revision, lease and deadline before storing anything. Label changes or disconnect invalidate the lease and remove prior imports transactionally. An already-running provider request may finish after revocation, but its response cannot recreate deleted records. New work cannot be claimed after disconnect.

## Bounds, recovery and known limits

- Each manual scan freezes the preceding 90-day window and follows Gmail's returned page token. A new requested scan covers the full window again so adding a label to an older email is not missed. It deduplicates saved records, but currently re-reads provider content; Gmail History/delta processing is a future efficiency improvement.
- At most five messages per admitted page and 100 pages per owner per UTC day. Admissions are retained on failure. Exhausted scans stay queued until midnight UTC. These are local read bounds; Google quota, availability and response ordering still apply.
- Ten activity invocations at most per finite workflow, ten seconds between pages, two simultaneous activities in the dedicated pool, two-minute persistence leases and thirty-second provider-operation deadline.
- Metadata is checked before reading a body; label membership, spam/trash state and time bounds are checked again on the full result. Messages removed from the label during access are discarded. Future removal after import is not tracked yet; label change/disconnect/retention remove saved copies.
- At most four MB per provider response, 50 MIME parts, eight nesting levels, 16,000 text characters per saved message and 20 previews per dashboard read. Oversized/attachment-only/malformed/deleted messages can be skipped or shortened; no availability or relevance is inferred from an email.
- Failed pages back off for five minutes. Five consecutive failures stop that scan until another request. Expired grants require reconnecting. A manually retried stopped scan resets the cursor, avoiding permanent reuse of an expired provider token.
- Evidence is hidden after 30 days and deleted in batches of 200 by configured import-worker ticks; physical cleanup may lag during worker downtime. Disconnect and label change delete immediately. Production backup retention must follow the same access/revocation policy.
- No independent recommendation-quality or scale claim is established by this increment. Live Google consent, real mailbox import and private matching remain unverified/unimplemented as described above.

## Verification

24 focused checks pass: 12 provider/application checks, eight real PostgreSQL isolation/recovery checks and four Nest HTTP boundary checks. Tests use synthetic identities/content and fake Google responses; they do not contact a real mailbox. They cover state replay/expiry/wrong owner/wrong browser, scope validation, readonly labels, MIME handling, movement out of scope, expired access, encrypted storage, stale leases, duplicate delivery, pagination, daily allowance, label change, disconnect races and erasure after key loss.

Core, adapters, workflows, API and worker builds pass; API, worker and web type checks and repository architecture checks pass. Migration `20261005-private-mail` is applied locally. The local web/API servers start; the browser tool reported a connection failure, so visual and real-browser consent verification is still open.

```sh
pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/connections.e2e-spec.ts
PRIVATE_MAIL_INTEGRATION=1 pnpm --filter worker exec vitest run test/private-mail.spec.ts test/private-mail.integration.spec.ts --no-file-parallelism --hookTimeout=30000
```
