# ScoutAlert — Repository Layout

**Version:** 0.2

**Date:** 29 September 2026

**Status:** Canonical target layout

**Scope:** Applications, shared business modules, infrastructure, workflows, and documentation

## 1. Layout decision

Use a feature-first modular codebase with a framework-independent business core. API and workers execute the same core use cases. Infrastructure implementations live outside core. Deployments can scale independently without duplicating domain behavior.

The selected business-code location is `packages/core`. The repository uses `packages` for reusable product modules as well as technical libraries. Separate API and worker hosts share those modules through explicit exports; their independently scaled entrypoints preserve one source of business rules.

Create packages and folders when they contain implemented responsibilities. The trees below show their intended locations, not a request for an empty scaffold. The existing workspace currently discovers `apps/*` and `packages/*`; shared capability folders are internal modules rather than nested workspace packages.

## 2. Monorepo

```text
scoutalert/
├── apps/
│   ├── web/                       # Product experience and Next.js server routes
│   ├── api/                       # HTTP presentation and application composition
│   ├── worker/                    # Background execution hosts and activity bindings
│   └── docs/                      # Documentation website application
├── packages/
│   ├── core/                      # Feature domain models, use cases, inward contracts
│   ├── adapters/                  # Repositories and external capability implementations
│   ├── workflows/                 # Durable execution definitions and activity contracts
│   ├── contracts/                 # Transport schemas/types shared by applications
│   ├── config/                    # Validated runtime configuration and policy loading
│   ├── observability/             # Tracing, metrics, correlation, redaction
│   ├── evaluation/                # Evaluation runners, fixtures, experiment reports
│   ├── test-utils/                # Reusable integration/contract-test support
│   ├── ui/                        # Shared UI components, styles, and tokens
│   ├── eslint-config/
│   └── typescript-config/
├── docs/
│   ├── architecture/
│   ├── engineering/
│   ├── prd/
│   └── user-stories/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

`apps/docs` is an application; root `docs` contains the product and engineering specifications. `infra/` may be introduced for actual deployment definitions when a deployment target is selected.

## 3. Shared business modules

```text
packages/core/src/
├── identity/
├── onboarding/
├── profiles/
├── scouts/
├── sources/
├── opportunities/
├── evidence/
├── retrieval/
├── matching/
├── research/
├── recommendations/
├── notifications/
├── feedback/
├── applications/
├── engagements/
├── integrations/
├── entitlements/
├── billing/
├── operations/
└── shared/                        # Small, explicitly owned cross-feature primitives
```

These are module ownership boundaries, not necessarily twenty independent packages or deployments. Split a module into a workspace package only when its dependency, build, ownership, or release requirements justify that split.

A core feature uses:

```text
packages/core/src/scouts/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── policies/
│   ├── repositories/
│   ├── events/
│   └── errors/
├── application/
│   ├── use-cases/
│   ├── queries/
│   ├── ports/
│   ├── commands/
│   └── results/
└── public.ts
```

Core contains no infrastructure or presentation folder. It imports no NestJS, Next.js, PostgreSQL/Kysely, Redis, workflow engine, transport package, or provider SDK. Repository contracts expose business concepts; use cases coordinate them and domain policies. External capability contracts belong in the owning feature's application ports.

Shared primitives cannot become a place to bypass feature ownership. A feature reads another feature through its public query/use-case contract or an explicitly owned projection port, and never writes its persistence directly.

## 4. Infrastructure implementations

```text
packages/adapters/src/
├── scouts/
│   └── persistence/
│       ├── postgres-scout.repository.ts
│       └── scout.persistence-mapper.ts
├── opportunities/
│   └── persistence/
├── evidence/
│   └── persistence/
├── retrieval/
│   ├── indexes/
│   ├── cache/
│   └── embeddings/
├── matching/
│   └── evaluators/
├── sources/
│   └── connectors/
├── research/
│   ├── planners/
│   ├── search/
│   └── fetch/
├── notifications/
│   ├── persistence/
│   └── delivery/
├── operations/
│   ├── outbox/
│   └── execution/
├── database/
│   ├── migrations/
│   ├── types/
│   └── transactions/
├── clients/                       # Technical client factories/configuration
│   ├── postgres/
│   ├── redis/
│   ├── models/
│   ├── email/
│   ├── storage/
│   └── temporal/
└── public.ts
```

Add the other feature adapters as implemented. Feature repositories own queries, persistence mapping, caching, and invalidation. Low-level clients and transaction plumbing are infrastructure and expose no business decisions. Composition roots construct and inject them into adapters.

This replaces the earlier proposed top-level `database`, `cache`, `queue`, and `ai` package collection. Do not create parallel copies of those responsibilities. Extract a technical package later only for a demonstrated independent consumer or lifecycle need.

AI request routing and instrumentation can be shared adapter capabilities. Business-specific prompts and schema mapping stay with the feature adapter that owns their meaning. All provider outputs must be translated and validated before crossing into core.

## 5. API host

```text
apps/api/src/
├── main.ts
├── app.module.ts
├── composition/                   # Client lifecycle, repository/use-case bindings
├── modules/
│   ├── scouts/
│   │   ├── scouts.module.ts
│   │   ├── controllers/
│   │   ├── dto/
│   │   └── presenters/
│   └── <other-exposed-feature>/
└── shared/
    ├── guards/
    ├── filters/
    └── interceptors/
```

Controllers authorize the request context, validate/map transport input, call core use cases, and present results. NestJS modules and composition providers bind contracts to core classes and adapter implementations. They do not contain a second copy of business rules.

Controllers and framework guards do not query raw data sources. They use inward authorization/repository/query contracts bound by composition.

## 6. Web application

```text
apps/web/
├── app/
│   ├── (public)/
│   ├── (account)/
│   ├── (workspace)/
│   │   ├── scouts/
│   │   ├── opportunities/
│   │   ├── applications/
│   │   ├── engagements/
│   │   └── settings/
│   ├── api/                       # Thin same-origin server routes
│   ├── layout.tsx
│   └── globals.css
├── features/
│   ├── onboarding/
│   ├── scouts/
│   ├── opportunities/
│   ├── applications/
│   ├── engagements/
│   └── <other-product-feature>/
├── server/
│   ├── api-client/
│   ├── session/
│   └── request-context/
├── components/                    # Web-specific cross-feature composition
└── lib/                           # Small browser-safe utilities
```

Route files compose screens; feature folders own product UI, hooks, and transport-facing view models. `packages/ui` contains reusable primitives and tokens. Server-only modules handle cookie/session transport and API requests. Neither browser code nor Next.js server routes import core repositories or infrastructure adapters.

## 7. Workflows and workers

```text
packages/workflows/src/
├── scouting/
├── source-sync/
├── enrichment/
├── research/
├── notifications/
├── contracts/                     # Serializable activity inputs/results
└── public.ts

apps/worker/src/
├── main.ts
├── composition/
├── activities/                    # Bind workflow operations to core use cases
├── dispatch/                      # Outbox relay and execution submission
├── reconciliation/
└── roles/                         # Register workloads/task queues per process role
```

Workflow definitions describe execution order, durable waiting, cancellation, retries, and bounded continuation. They can depend on the selected workflow SDK and serializable contracts. They cannot import repositories, raw clients, clocks with uncontrolled behavior, provider SDKs, or application composition. Business decisions run in core use cases invoked by activities.

Activities establish execution context and call shared core use cases. They do not add duplicate eligibility, consent, ranking, or persistence logic. Outbox dispatch constructs the execution adapter through composition.

The worker host may run separate processes/pools for discovery, indexing, matching, research, and delivery. Add distinct applications only when independent deployment requirements justify them. Split operational capacity before splitting business logic.

`packages/workflows` is introduced with the execution-engine implementation. Until that adoption is validated, keep durable intents and execution contracts engine-independent in core; do not add empty Temporal or BullMQ wrappers.

## 8. Exports and allowed dependency graph

Expose deliberate feature entry points such as `@repo/core/scouts` and `@repo/adapters/scouts`; map each to its `public.ts` through package exports when implemented. Avoid a root barrel exporting every feature and avoid consumer deep imports.

| Consumer                      | Allowed dependency responsibilities                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| Core domain                   | Its feature's domain types and small shared pure primitives                                              |
| Core application              | Domain, inward repositories/ports, approved cross-feature public contracts                               |
| Adapters                      | Owning core public contracts, technical SDKs and infrastructure helpers                                  |
| Workflow definitions          | Workflow SDK, serializable execution contracts and deterministic helpers                                 |
| API composition               | Core, adapters, runtime configuration, observability                                                     |
| Worker composition/activities | Core, adapters, workflows, runtime configuration, observability                                          |
| API presentation              | Core use cases/query contracts and transport contracts; no concrete adapters                             |
| Web                           | UI, transport contracts and browser-safe feature code; server-only API/session modules where appropriate |

`pnpm check:architecture` checks the current core/adapters boundary through package manifests and source syntax, including type-only imports, re-exports, literal dynamic imports, CommonJS imports, and cross-workspace relative paths. Core permits no runtime dependencies; approved test/config tooling is restricted to those files. Adapters point inward to core. Consumers use declared single-feature exports, and web/UI cannot depend on either package. Computed module paths fail because their destinations cannot be checked. The command runs before workspace linting and exits unsuccessfully on violations.

Both package export maps are closed until implemented feature entry points are added. Additional domain/application, cross-feature, API presentation, activity, and workflow rules are required as those modules are implemented. The documentation rule applies to every class and method, including private methods and constructors.

## 9. Tests, evaluation, and implementation transition

Co-locate focused policy/use-case tests. Keep repository contract/integration tests with adapters, workflow replay/recovery tests with workflows/worker, HTTP integration tests with API, and browser end-to-end tests with web. `packages/evaluation` owns versioned quality fixtures and experiment runners; sensitive datasets have separate controlled storage/access.

Current web/API/UI foundations stay in place while moving toward this layout. The installed datasource/queue SDKs have moved from the dependency-only core bootstrap into `@repo/adapters`; core is dependency-free. The adapter manifest declares its inward core dependency. These packages currently establish dependency ownership and closed exports; they do not yet implement repositories, clients, or business features. The preferred workflow engine is not installed.

Run `pnpm test:architecture` for boundary regression tests and `pnpm lint` for the boundary check followed by workspace linting. Introduce feature packages, build/type-check scripts, and feature exports with their first implemented responsibilities.

See the [engineering standards](scoutalert-engineering-standards-v0.1.md) for transaction and documentation examples and the [technology stack](../architecture/scoutalert-technology-stack-v0.1.md) for execution adoption checks.
