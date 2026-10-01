# ScoutAlert adapters

Owns repository implementations, queries, persistence mapping, caching, source connectors, provider integrations, and technical client/transaction plumbing. Implements contracts exported by `@repo/core`.

The package owns the installed infrastructure dependencies and now implements SMTP email delivery under `src/notifications/delivery`. Its pooled client factory lives in `src/clients/email`. Native PostgreSQL/Kysely and Redis client factories live under `src/clients`; API composition owns their lifecycle. Identity repositories, atomic Redis rate limits, activation units of work and versioned database migrations are implemented.

Expose implemented capabilities through explicit feature subpaths. Explicit `notifications`, `identity`, `onboarding`, `scouting` and `database` exports expose only their implemented capabilities. Composition roots construct clients and inject adapters; business services receive inward contracts.

Run `pnpm --filter @repo/core build` before `pnpm --filter @repo/adapters build` or adapter type checks. The [local email guide](../../docs/engineering/scoutalert-local-email.md) describes Mailpit configuration and checks.

The saved-scout repository also implements the core catalog read contract, with an authoritative preference join, owner predicate, bounded reads and stable activation-time/UUID pagination. Query and mapping reuse keeps receipt recovery and dashboard reads consistent.

`@repo/adapters/scouting` implements allowlisted Greenhouse collection, transactional shared snapshots/evidence, GIN-backed candidate reads, version-checked result publication, owner-scoped feed summaries and leased outbox dispatch. Notifications include a recipient/window ledger, consent rechecks and ambiguous submission holds. `@repo/workflows` owns execution definitions, and `apps/worker` owns native client lifecycle and activity composition.

BullMQ remains an installed bootstrap dependency. Its presence does not select the durable execution engine or justify introducing a second workflow state owner.

The [repository layout](../../docs/engineering/scoutalert-repository-layout.md) defines ownership. Run `pnpm check:architecture` from the repository root to check dependency boundaries.
