# ScoutAlert API

This NestJS host exposes product HTTP routes and composes framework-independent use cases from `@repo/core`. Database, cache and provider operations live behind inward repository or capability contracts implemented in `@repo/adapters`.

Connected routes cover stateless search review, shared email-code request/verification, account context/logout, transactional scout activation and owner-scoped saved-scout reads. Identity and activation routes require the private Next.js host key; they cannot be called by an untrusted browser directly. PostgreSQL owns durable identity/scout/consent/outbox records. Redis handles expiring atomic rate limits. Mailpit captures local verification emails.

Configure `.env` from `.env.example`, match `WEB_API_SECRET` in the web host, then run from the repository root:

```sh
pnpm --filter api db:migrate
pnpm dev:start
```

The API listens on port 4040 unless `PORT` is set. Development builds both core and adapters before starting. Migrations are explicit and use Kysely's migration lock. Clients and repositories are composed through Nest providers; native shutdown hooks close pools. JSON input is bounded to 32 KiB; sensitive request capture is disabled.

```sh
pnpm --filter @repo/core build
pnpm --filter @repo/adapters build
pnpm --filter api check-types
pnpm --filter api lint
pnpm --filter api test
IDENTITY_INTEGRATION=1 MAILPIT_INTEGRATION=1 pnpm --filter api test:e2e
```

Opt-in identity tests target the separate `scoutalert_test` database with synthetic accounts and isolated expiring Redis keys. Default tests do not require these external services. See [connected onboarding](../../docs/engineering/scoutalert-connected-onboarding.md) for guarantees, routes, failure behavior and remaining platform work; see [local email](../../docs/engineering/scoutalert-local-email.md) for transport checks.

A saved scout writes a durable discovery intent consumed by the separate Temporal worker. `GET /v1/scouts` now includes current source-backed opportunities, source health, owner-scoped run summaries and delivery outcomes. HTTP handlers remain outside matching and email execution; see the live scouting sections in the connected onboarding guide.

`GET /v1/scouts` serves authenticated account-owned dashboard reads independently of onboarding. The owner comes exclusively from the shared session guard. The core catalog use case requests a bounded page; the PostgreSQL repository joins saved scouts to authoritative alert preferences with an owner predicate. Opaque activation-time/UUID cursors support 20 scouts per page and cannot authorize another owner. Responses disable caching. Integration coverage includes owner isolation and stable paging across equal timestamps and a newer insert.

## Discovery handoff and future read models

The [internet discovery design](../../docs/architecture/scoutalert-discovery-architecture.md) adds plan, lead and capability-aware coverage concepts. These are target contracts, not new routes installed by this document. Activation keeps its atomic save/outbox boundary; planning, web/social search, crawling and research execute asynchronously in workers through shared core use cases.

Future API read models distinguish saved, planning, searching, partial, access-limited, deferred and checked states without exposing raw provider errors or private operational payloads. User edits supersede incompatible plans and private outputs. Provider names in documentation never establish live access. The existing session, ownership, version, consent and transport rules apply to every new endpoint; see [onboarding architecture](../../docs/architecture/scoutalert-onboarding-architecture-v0.1.md) and [acceptance gates](../../docs/engineering/scoutalert-discovery-acceptance.md).
