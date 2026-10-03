# ScoutAlert adapters

Owns repository implementations, queries, persistence mapping, caching, source connectors, provider integrations, and technical client/transaction plumbing. Implements contracts exported by `@repo/core`.

The package owns the installed infrastructure dependencies and now implements SMTP email delivery under `src/notifications/delivery`. Its pooled client factory lives in `src/clients/email`. Native PostgreSQL/Kysely and Redis client factories live under `src/clients`; API composition owns their lifecycle. Identity repositories, atomic Redis rate limits, activation units of work and versioned database migrations are implemented.

Expose implemented capabilities through explicit feature subpaths. Explicit `notifications`, `identity`, `onboarding`, `scouting` and `database` exports expose only their implemented capabilities. Composition roots construct clients and inject adapters; business services receive inward contracts.

Run `pnpm --filter @repo/core build` before `pnpm --filter @repo/adapters build` or adapter type checks. The [local email guide](../../docs/engineering/scoutalert-local-email.md) describes Mailpit configuration and checks.

The saved-scout repository also implements the core catalog read contract, with an authoritative preference join, owner predicate, bounded reads and stable activation-time/UUID pagination. Query and mapping reuse keeps receipt recovery and dashboard reads consistent.

`@repo/adapters/scouting` implements registered Greenhouse and bounded Freelancer collection, transactional shared snapshots/evidence, GIN-backed candidate reads, version-checked result publication, owner-scoped feed summaries and leased outbox dispatch. Notifications include a recipient/window ledger, consent rechecks and ambiguous submission holds. `@repo/workflows` owns execution definitions, and `apps/worker` owns native client lifecycle and activity composition.

BullMQ remains an installed bootstrap dependency. Its presence does not select the durable execution engine or justify introducing a second workflow state owner.

The [repository layout](../../docs/engineering/scoutalert-repository-layout.md) defines ownership. Run `pnpm check:architecture` from the repository root to check dependency boundaries.

## Target discovery capabilities

`@repo/adapters/discovery` implements an opt-in Serper adapter, pinned public HTTPS retrieval with robots checks, shared PostgreSQL admission, structured public demand review, extraction reuse and lead/evidence reads. Web availability reuses recent complete source observations without inventing fresh timestamps. Classification shares the existing intelligence budget; it is not a separate uncapped model stream. Live Serper access passed a bounded contract check and is enabled locally; unverified or inaccessible pages remain leads. Native social search, streams, rendering, automatic source expansion and adaptive agent planning remain outstanding. See the [implementation notes](../../docs/engineering/scoutalert-web-discovery.md). They will implement the [discovery capability contracts](../../docs/architecture/scoutalert-discovery-architecture.md), retaining native filters, cursors, completeness, recovery and access semantics.

Adapters own provider transport, decoding, persistence mapping and source-fetch enforcement; core owns policy and use-case decisions. Registry data configures source instances under implemented adapters. Policy admission precedes fetching and repeats across redirects. A new permitted domain should not require duplicating a connector, but a new protocol needs code and contract tests.

Persist observations and outbox work before acknowledging durable source progress. Shared query/evidence caches include rights, versions, language/region and freshness; private content stays scoped. Existing transactional publication and delivery gates remain common to new discovery paths. The [DACC gates](../../docs/engineering/scoutalert-discovery-acceptance.md) define required verification.
