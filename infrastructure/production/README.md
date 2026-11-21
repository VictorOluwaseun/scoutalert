# ScoutAlert AWS beta

This is a single-server beta deployment, with a fresh PostgreSQL database, Redis,
durable Temporal, the Nest API, Next.js and the discovery worker. Public traffic
enters through Caddy; database, Redis, Temporal and API ports stay private.
It is not highly available: a host outage interrupts all services until recovery.

Current status, 17 November 2026: public sign-in is open, SendPulse delivers
transactional email, and cloud discovery is running. The local worker and
Temporal are stopped. The completed launch test scout is paused, with its
email preferences preserved. See the launch verification record below for
the remaining X access limitation and measured token usage.

## Verified small-server configuration

- Region: `eu-north-1`; instance: ARM `t4g.small`, 2 GiB RAM.
- 32 GiB encrypted gp3 storage, 2 GiB swap, SSM administration, no SSH ingress.
- CPU credit mode is `standard`, preventing surplus CPU charges. Sustained load
  can be throttled after burst credits run out.
- Build images on a development machine or CI, not the small production host.
- Use `SCOUT_WEB_CONCURRENCY=1`. The full local smoke stack used approximately
  660 MiB at rest; large Chromium pages reached the worker's 768 MiB cgroup limit,
  used a little swap, and completed without OOM kills. This is a smoke result,
  not proof of capacity for 50 simultaneous users or many heavy pages.
- Approximate monthly base at 730 hours: compute $12.56, storage $2.68 and one
  public IPv4 address $3.65. Allow roughly $20–23 total for light beta use,
  private images, a runtime secret and small backups. Traffic, storage growth
  and taxes can add cost. A $25 AWS cost budget is a monitor, not a hard stop.

## Build and infrastructure

Push-to-`main` application deployment is defined in
[the automatic deployment guide](auto-deployment.md), including the one-time
GitHub OIDC role setup, release health checks and recovery behavior.

Build from the repository root using `infrastructure/production/Dockerfile` and
targets `api`, `web`, and `worker`. Images run compiled packages as a non-root
user. The build context excludes environment files and secret directories.
The worker image contains the matching Playwright Chromium headless shell.

`aws.yaml` provisions the host, private ECR repositories, a Secrets Manager
secret and an encrypted S3 bucket. Supply the existing VPC, public subnet and
an Amazon Linux 2023 ARM AMI for the region. Review a CloudFormation change set
before executing it. No model budget is configured by this infrastructure file.

The instance role can pull these three images, read its one runtime secret,
read release artifacts, and write backups. Instance metadata requires IMDSv2
and a hop limit of one. Termination protection is enabled. The root EBS volume,
backup bucket and runtime secret are retained on deletion; review retained
resources during an intentional teardown to avoid ongoing charges.

## Runtime secrets and initialization

Deploy configuration files to `/opt/scoutalert`. Its `.env` contains only immutable
image references and `SCOUTALERT_HOST`. Secrets Manager stores a JSON object with
exactly `postgres.env`, `temporal.env`, `api.env`, `web.env`, `worker.env` and
`redis-password`. Pipe its `SecretString` to `python3 load-secrets.py`; do not
print the secret or put credentials in SSM commands, user data, Git or images.
The installer writes owner-only files into `secrets/`. Compose reads env files
in raw mode so `$` characters in credentials are preserved.

PostgreSQL receives `POSTGRES_USER=postgres`, an independent `POSTGRES_PASSWORD`,
`SCOUTALERT_DB_PASSWORD` and `TEMPORAL_DB_PASSWORD`. The SQL initialization file
creates separate non-superuser application and Temporal owners. API and worker
use the `scoutalert` role, not the bootstrap superuser. `temporal.env` supplies
`SQL_HOST=postgres`, `SQL_PORT=5432`, `SQL_USER=temporal`, `SQL_PASSWORD`, and
`SQL_PLUGIN=postgres12_pgx`.

Run these explicit steps on the host after installing the runtime secret:

```sh
docker compose up -d --wait postgres redis
docker compose run --rm temporal-schema
docker compose run --rm migrate
docker compose up -d temporal
docker compose run --rm temporal-admin operator cluster health
docker compose run --rm temporal-admin operator namespace create --namespace scoutalert --retention 3d
```

Create the namespace only once. Describe it on subsequent deployments; do not
delete or reset workflow state. Application and Temporal schema migrations are
repeatable and do not run implicitly on every service restart. History shard
count is fixed at initialization. Never use `docker compose down --volumes`
against the production deployment.

## Public launch and worker handoff

Production API and worker require verified SMTP credentials in both env files:
`EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS`, and `SCOUTALERT_WEB_ORIGIN=https://scoutalert.app`.
Missing SMTP prevents startup. Mailpit is used only in an isolated local test
override; it must not be enabled on the public deployment.

The public website can open before SMTP or discovery. Publish the introduction
and fictional workspace with the website override:

```sh
docker compose -f compose.yaml -f compose.website.yaml up -d --wait web caddy
```

This sets `SCOUTALERT_WEBSITE_ONLY=true` at runtime and removes the web service's
API startup dependency. Onboarding and sign-in show the beta preview without
mounting account forms or calling identity services. The API and worker remain
stopped. The same web image supports the full beta after the override is removed.

Point the root A record to the instance's current public IP, and `www` CNAME to
the root. Caddy obtains HTTPS certificates and redirects `www` to the root.
Use DNS-only records: Caddy overwrites forwarding headers and web trusts that
edge. If enabling a CDN proxy later, explicitly configure and test the trusted
proxy chain and per-network rate limiting first. The current EC2 public IPv4
can change after a stop/start; update DNS if it changes or allocate a stable
address before relying on stop/start recovery.

After SMTP verification, start `api`, test actual email delivery, then use
`docker compose -f compose.yaml up -d --wait api web caddy` to remove website-only
mode. Keep the worker separate until its allowance handoff below is complete.

The worker is a separate Compose profile and remains stopped during staging.
Its `SCOUT_AI_ENABLED`, `SCOUT_WEB_ENABLED` and `SCOUT_X_ENABLED` start as `false`.
Preserve the existing 2,400,000 mini and 250,000 full-model daily token caps,
2,650,000 aggregate ceiling, 40,000 audit allocation inside the full cap,
pacing settings, and approved $40/30-day paid allocation. Do not reset the
paid-period anchor when moving hosts.

A fresh database has no previous provider usage ledger. Before enabling cloud
discovery, stop the local worker and reconcile all current UTC-day reservations
and the ongoing 30-day paid allowance. Starting at a UTC day reset alone does
not reset an already-started paid period. Keep paid admission disabled until
its carryover is reconciled if that history is not transferred. Only then
enable the chosen providers and start the `worker` service. Never run local and
cloud workers against separate ledgers while sharing provider allowances.

## Backups and recovery

Install `scoutalert-backup.service` and `.timer` into systemd and enable the timer.
`backup.sh` writes transactionally consistent dumps for the three databases to
the private S3 bucket, with 30-day retention. It uses the host's IAM role and
never includes plaintext credentials. Check backup success and practice restore;
a successful upload alone does not prove that recovery works.

Database dumps are separate snapshots. Restore with the worker stopped, reconcile
Temporal visibility and application workflow state, and account for provider
spend since the backup before re-enabling discovery. Redis sessions and cache
may be recreated; PostgreSQL is the durable authority. S3 protects against a
host failure, but this setup does not provide automatic failover or zero data
loss between daily backups.

## Validation performed

The ARM builds, fresh migrations and migration re-run passed. The existing
`scripts/check-onboarding-connection.mjs` passed against the isolated containers,
covering email codes, cookies, CSRF rejection, account isolation, activation
retries, dashboard rendering, edits, pauses and logout. Temporal completed
maintenance workflows, and Chromium rendered synthetic large pages with paid
provider flags off and worker external networking disabled. Caddy configuration
validation passed. No paid model tokens were consumed by these checks.

Fresh cloud AI recommendation quality and production inbox delivery remain
separate launch checks; local captured emails are not production inbox delivery.
Public HTTPS verification is recorded below.

## Initial AWS staging — 11 November 2026

Stack `scoutalert-beta` is deployed in account `109837541388`, region `eu-north-1`.
Instance `i-00bb71bd8438888e5` runs the verified ARM images tagged `20261111-1` in
the three private `scoutalert/*` ECR repositories. Runtime credentials were stored
in Secrets Manager with explicit approval. No original accounts or scouts were
migrated: the cloud database has zero users, scouts and AI reservations.

PostgreSQL, Redis and Temporal are healthy. All three database dump restores
passed in disposable verification databases on EC2. The first versioned,
AES256-encrypted S3 backup succeeded, and the daily systemd timer is enabled.
Chromium rendered successfully on the actual 2 GiB ARM host. At initial staging,
API, web, Caddy and the long-running worker were not started. The website was
published separately afterward, as recorded below.

Zoho CPaaS still rejects adding `scoutalert.app` with “Domain name could not be
edited. Please contact support-as@zohocorp.com.” Production SMTP credentials and
actual inbox delivery remain blocked. Complete this provider setup, domain/TLS
checks and the usage-ledger handoff before opening the beta.

AWS displayed $120 remaining Free-plan credits after the $20 cost-budget award.
The EC2 $20 reward was still in progress. The Free-plan deadline is 10 May 2027;
credits and costs must be checked again before relying on that balance.

## Public website — 11 November 2026

`https://scoutalert.app` serves the beta introduction and fictional example
workspace from web image `scoutalert/web:20261111-2`. The server runs
`compose.yaml` with `compose.website.yaml`. Cloudflare has a DNS-only root A
record for `16.16.202.38` and a DNS-only `www` CNAME to `scoutalert.app`.
Existing mail records were preserved. Caddy obtained valid Let's Encrypt
certificates for both hostnames; HTTP redirects to HTTPS and `www` redirects
to the root domain.

The homepage, sign-in preview, example workspace and 12 referenced assets passed
live HTTPS checks. The introduction and example workspace were also checked in
Chrome. Web type checking, lint, ARM production build and both runtime launch
modes passed. The web and Caddy containers had zero restarts or OOM kills;
the server had approximately 1 GiB available memory with no swap in use.

API and worker remain stopped, and all three paid discovery flags remain false.
No model calls were made, token caps were not changed, and the usage-ledger
handoff remains required before discovery can start.

The configuration archive and an image recovery archive are in the private S3
bucket under `releases/website-config-20261111-2.tar.gz` and
`releases/web-image-20261111-2.tar.gz`. The image was loaded from S3 after a
registry upload timed out, then the immutable ECR release was completed from
the deployment computer. The server role retains pull-only ECR permissions.

## Zoho transactional SMTP — 12–13 November 2026

Zoho Accounts support removed the original restriction under ticket `170865987`.
The `scoutalert.app` domain was then added to the ScoutAlert CPaaS account and
associated with `mail_agent_1`. With explicit approval, Cloudflare received the
generated `12144431._domainkey` TXT record and a DNS-only `bounce-zem` CNAME to
`cluster89.zeptomail.com`. Existing MX, mailbox DKIM, SPF and DMARC records were
preserved. Both new records resolve publicly and through Zoho Toolkit.

The existing agent SMTP credential is stored in the AWS runtime secret and
installed in both `api.env` and `worker.env`. The shared configuration is
`smtp.zeptomail.com:587`, required STARTTLS, username `emailapikey`, sender
`ScoutAlert <info@scoutalert.app>`, reply-to `info@scoutalert.app`, and public
origin `https://scoutalert.app`. No credential is stored in this repository.

Authenticated TLS checks passed from both deployed API and worker images.
A non-sending SMTP-envelope check also accepted the sender and test recipient.
Actual diagnostic submission to the designated test inbox failed at `DATA`
with `550 5.7.1 Sender is not allowed to relay emails`. No message arrived in
the recipient inbox or spam search. CPaaS shows both DNS records as Verified,
but the overall domain remains Pending and repeated verification fails.
There is one unused email credit (10,000 messages); this is not an exhausted
sending-credit balance.

Production sign-in code exchange and opportunity-alert inbox delivery are
still blocked by that provider authorization failure. Do not treat successful
SMTP authentication as successful email delivery. Complete Zoho verification,
then run the sign-in exchange and real notification-ledger/replay checks before
opening sign-in or enabling discovery. The existing website preview remains
live; the API and long-running worker remain stopped.

Only email fields in the secret were changed. The mini/full/aggregate daily
caps remain 2,400,000 / 250,000 / 2,650,000, and all paid discovery flags remain
false. These SMTP checks made no ScoutAlert model calls.

A follow-up audit on 13 November reproduced the same `550 5.7.1` rejection
using Python's standard-library SMTP client directly on EC2, without ScoutAlert
code or templates. That client authenticated over TLS 1.3. The live agent SMTP
credential exactly matched both AWS environment entries, which in turn matched
the installed server files. Both authoritative Cloudflare nameservers and public
resolvers `1.1.1.1` and `8.8.8.8` returned byte-for-byte matching DKIM and CNAME
values. The domain is associated with the credential's `mail_agent_1`; no agent
IP allowlist or daily blocking limit is configured. No local configuration
mismatch was found. Zoho's documented 24–48-hour DNS verification window remains
a possible explanation for the pending status; the evidence does not by itself
prove a provider defect. The diagnostic follow-up was sent on 13 November under
ticket `170865987`, and Zoho Mail confirmed delivery. Zoho sent two automated
ticket acknowledgements on 16 November; neither included a technical resolution.

A fresh domain check on 16 November still showed both DNS records as Verified
and the overall domain as Pending. Retrying Verify DNS records returned the
same verification-failure dialog, beyond the displayed 48-hour window. Fresh
queries to both authoritative nameservers, `1.1.1.1` and `8.8.8.8` still returned
exactly matching DKIM and CNAME values. No DNS changes were made. Production
sign-in and opportunity-alert delivery tests were not run because domain
verification had not cleared; SMTP was not retested during this check. No model
calls were made and no token caps were changed.

## SendPulse transactional email — 17 November 2026

SendPulse is now the configured cloud SMTP provider. The approved
`sign._domainkey` TXT record is published, and the domain has one SPF record:
`v=spf1 include:mxsspf.sendpulse.com include:zohomail.com ~all`.
Existing Zoho MX, DKIM, bounce and DMARC records remain intact. SendPulse
authenticated `scoutalert.app`, activated `info@scoutalert.app`, and automatically
moved the account to Free SMTP: 12,000 emails per month and 50 per hour.

The existing SendPulse credential is stored in the AWS runtime secret and
installed in both cloud environment files. Configuration is `smtp-pulse.com:587`,
required STARTTLS with certificate validation, sender
`ScoutAlert <info@scoutalert.app>`, reply-to `info@scoutalert.app`, and public
origin `https://scoutalert.app`. Only SMTP host, username and password changed;
all other secret settings were preserved. No credentials are stored here.

All five local SMTP integration tests passed, covering STARTTLS, implicit TLS,
plaintext rejection, untrusted-certificate rejection and authentication failure.
Live checks using the deployed images also passed:

- The API connection-check email arrived in the designated Gmail inbox.
- A real sign-in code arrived and was consumed through the deployed identity
  binding. Verification replay returned the same session, account access
  succeeded, and logout revoked the session.
- The worker's real delivery repository, templates and SMTP adapter delivered
  one digest containing two clearly labelled synthetic project/service items.
  Its durable ledger recorded one accepted message and two reserved items;
  replay submitted zero additional emails.
- Gmail showed SPF, DKIM and DMARC passing, with both mailed-by and signed-by
  matching `scoutalert.app`. The diagnostic, code and digest all arrived in Inbox.

Identity and alert fixtures used a separate schema. That schema and temporary
proof keys were removed after testing; public database counts remained zero
users, zero scouts and zero deliveries. The server's non-secret result report is
`/opt/scoutalert/email-test-results-20261117.json`.

The private API is running and healthy with the SendPulse configuration. The
public web container still uses `compose.website.yaml`; the public sign-in and
browser-cookie flow was not opened or tested in this run. The long-running
worker remains stopped, and `SCOUT_AI_ENABLED`, `SCOUT_WEB_ENABLED` and
`SCOUT_X_ENABLED` remain false. Before opening the full beta, complete the
local-to-cloud allowance handoff and the public browser sign-in launch checks.

These checks made no model calls. Daily mini/full/aggregate caps remain
2,400,000 / 250,000 / 2,650,000. SendPulse's 50-per-hour email limit is a separate
capacity constraint shared by sign-in codes and opportunity alerts; this test
does not establish provider-wide queueing or rate-limit handling under beta load.

## Public sign-in and cloud discovery — 17 November 2026

The website-only override was removed and the existing API, web and Caddy
services passed their startup checks. The public browser flow delivered a real
sign-in code, opened the authenticated dashboard, retained the session across
reload, signed out and redirected anonymous dashboard visits to sign-in.
Additional requests through public HTTPS verified Secure, HttpOnly, host-only,
SameSite=Lax session cookies; private/no-store identity responses; no session
token in JSON; rejection of incorrect Origin, CSRF and cross-site fetch
metadata; idempotent verification; and rejection of a revoked session.

Before activation, the local worker was confirmed stopped and its three paid
provider flags were disabled. Local Temporal was also stopped. Only spending
ledgers were transferred to the fresh cloud database; local accounts, scouts
and briefs were not migrated. The seven transferred tables passed checksum
verification, a rollback rehearsal and an idempotent second import. Today's
base usage was zero before the test. The ongoing mini paid commitment of
126,485 microUSD was preserved with the original 9 November anchor and
9 December period end.

Only `SCOUT_AI_ENABLED`, `SCOUT_WEB_ENABLED` and `SCOUT_X_ENABLED` changed to
`true` in the cloud worker environment. All other runtime-secret fields were
compared and preserved. The worker started all nine queues in the `scoutalert`
Temporal namespace. Later checks showed zero restarts or OOM kills, healthy
API/web/PostgreSQL/Redis services, and completed recurring maintenance runs.
Use `temporal-admin --namespace scoutalert workflow list` when inspecting
workflow history; the default namespace is not configured on this deployment.

A real scout was created through public onboarding for paid, remote website
client projects. Remote work was required, and daily email plus prompt alerts
were explicitly enabled. The run completed with one AI-reviewed potential
match from PeoplePerHour. Its source page was independently checked in the
browser: it was open for proposals and explicitly remote. Applicant-location
uncertainties remained visible in the assessment. Search also captured 23
leads; these are not all verified recommendations.

The actual opportunity digest arrived in the designated test inbox, and its
review button opened the authenticated public dashboard. The production
delivery ledger recorded one accepted message and one delivered item. Four
subsequent scheduled maintenance runs completed without another delivery,
and the delivery repository returned zero unsent eligible candidates. The
temporary scout was then paused; its email consent and alert preferences were
retained. The cloud worker remains running for active beta scouts.

At 17:38 UTC, combined input/output usage was 65,548 mini tokens and 7,165
GPT-5.4 tokens, leaving 2,334,452 and 242,835 respectively. GPT-5.4 used 3,773
standard and 3,392 audit tokens, both inside its existing cap. There were no
outstanding or unknown token reservations and no additional paid-allocation
spend. Daily caps, audit allocation, pacing, account quotas, refresh intervals
and the approved $40/30-day allocation were unchanged.

Remaining limitation: the native X request returned `access_unavailable`, and
the provider entered its one-hour backoff. The stored reason groups access
failures and does not establish whether credentials, entitlement or billing
caused it. Web search and AI review succeeded, but the discovery case correctly
reported partial source coverage. This successful single-scout test does not
establish throughput or email capacity for a full beta load.

## X billing diagnosis — 17 November 2026

The follow-up credit check from the running cloud worker returned HTTP 200
from X's documented `GET /2/usage/credits` endpoint. It reported zero available
and free credit, and a prepaid balance of -$0.03. The local, Secrets Manager
and running worker credentials matched; no extra `Bearer` prefix or surrounding
whitespace was present. X billing must be funded before a successful live
search can be verified. The user deferred funding, so no additional live X
searches were made during this diagnosis.

The connector now distinguishes HTTP 401 (`authentication_failed`), HTTP 402
(`billing_unavailable`), HTTP 403 (`access_unavailable`), and rate-limit failures.
Raw provider response bodies are still discarded. Authentication and billing
failures retain the existing one-hour minimum backoff, pause all native X
queries, and keep their request/cost reservations. Successful later reads
clear the access state. Historical failure receipts are not rewritten.

All 45 native X connector, context and isolated PostgreSQL integration tests
passed, including distinct failure categories, secret redaction, shared
backoff, retained reservations and recovery. Core/adapters compilation and
worker type checks passed. These checks used fixtures and made no AI calls.
No model caps, X request/cost caps, paid allocations or credentials changed.

The reporting fix is deployed as worker image
`109837541388.dkr.ecr.eu-north-1.amazonaws.com/scoutalert/worker@sha256:d7fa30520992995c14a1646e7b670f1d4475553dd0abbe6d8545c6217f835a17`.
This release layers the three changed compiled modules and their declarations
over the previous deployed image, preserving its runtime and dependencies.
The image passed five injected HTTP failure checks, a successful response check
and Chromium rendering with external networking disabled, both locally and
on EC2 before activation. Only the worker image setting was updated.

At 18:27 UTC, all nine queues were running, with zero container restarts or OOM
kills. API, web, PostgreSQL and Redis remained healthy. Model usage was still
65,548 mini and 7,165 GPT-5.4 tokens, with no outstanding reservations. Native
X usage remained one request with its original 50,000-microUSD reservation.
The complete runtime secret matched its pre-diagnosis checksum. Successful
live X search and recovery validation remain pending the user's credit top-up;
the existing temporary test scout remains paused.
