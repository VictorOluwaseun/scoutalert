# ScoutAlert — Engineering Standards and Project Structure

**Version:** 0.3

**Date:** 1 October 2026

**Status:** Mandatory engineering baseline

**Scope:** Platform architecture, dependency rules, code organization, documentation, maintainability, and testing

**Layout authority:** [Repository layout](scoutalert-repository-layout.md)

## 1. Engineering rules

The following are mandatory ScoutAlert engineering rules:

1. **No direct datasource imports in application services.** Database, Redis, vector search, object storage, queues, and other data sources are accessed through repositories or ports.
2. **Clean Architecture and Repository Pattern.** Dependencies point inward toward domain/application abstractions.
3. **No nested `if` statements.** Use guard clauses, ordered policies, strategy objects, discriminated results, or dedicated rules.
4. **No spaghetti code.** Each unit has a clear responsibility and architectural location.
5. **No code dumping or catch-all services.** Large responsibilities are decomposed into explicit use cases, policies, entities, repositories, and adapters.
6. **Every class has documentation.** TSDoc explains responsibility and architectural boundary.
7. **Every method is documented.** Include public and private methods, constructors, and interface methods. Explain purpose and contract; add transaction, retry, error, and side-effect detail where relevant.
8. **Core business logic is framework-independent.** Domain and application modules do not import NestJS, Next.js, Kysely, Redis, workflow engines, provider SDKs, or transport contracts.
9. **Infrastructure is replaceable.** Provider-specific code implements inward-facing interfaces.
10. **Hosts execute shared use cases.** Controllers, worker activities, and processors do not duplicate business rules.
11. **Names describe responsibilities.** Follow `AGENTS.md` naming restrictions and use product/capability names for project-defined folders, files, packages, and identifiers.
12. **Use the chosen stack effectively.** Prefer supported native capabilities at the correct boundary; check installed-version documentation before version-sensitive APIs. Do not replace NestJS lifecycle/DI, Next.js rendering/transport, PostgreSQL constraints/transactions or provider capabilities with weaker generic substitutes.
13. **Always use braces.** Every `if`/`else` and loop body uses curly braces, including single statements. Separate methods and logical blocks with blank lines.

## 2. Dependency direction

```text
Presentation
    ↓
Application
    ↓
Domain

Infrastructure
    ↓
Application ports / Domain repositories
```

Allowed:

```text
Controller → Use Case
Use Case → Domain Entity
Use Case → Repository Interface
Use Case → External Port Interface
Infrastructure Repository → Datasource client
Infrastructure Adapter → Vendor SDK
```

Not allowed:

```text
Domain → NestJS
Domain → Kysely
Domain → Redis
Domain → OpenAI
Application Use Case → pg/Database
Application Use Case → Redis client
Application Use Case → BullMQ
Application Use Case → vendor SDK
Controller → database
Worker Processor → raw database
```

## 3. Target monorepo layout

The [repository layout](scoutalert-repository-layout.md) is the canonical directory specification. Apps are `web`, `api`, `worker`, and the existing documentation application. Shared packages include `core`, `adapters`, `workflows`, `contracts`, configuration, observability, evaluation, testing support, and UI/tooling.

Do not create alternative business trees in API and workers or a second infrastructure package collection. Add folders when they contain real responsibilities. Target architecture is not a claim of implemented package boundaries.

## 4. Feature ownership and hosts

Business capabilities live in `packages/core/src/<feature>`. Infrastructure lives in `packages/adapters/src/<feature>`. API presentation lives in `apps/api/src/modules/<feature>` and worker activity bindings in `apps/worker/src/activities`.

NestJS composition modules construct use cases and bind their inward contracts to adapters. Domain/application code remains ordinary TypeScript. Cross-feature access uses deliberate public contracts and events; a feature cannot modify another feature's tables directly.

Web route files compose feature screens. Same-origin Next.js server routes handle transport and session concerns and call the API; they do not execute database queries or carry a separate copy of business rules.

## 5. Standard core feature layout

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

Core has no infrastructure or presentation folder. Technical implementations depend inward on these contracts; core never imports them.

## 6. Domain layer

The domain layer contains ScoutAlert business concepts.

Example:

```text
packages/core/src/scouts/domain/
├── entities/
│   └── scout.entity.ts
├── value-objects/
│   ├── search-specification.vo.ts
│   └── compensation-requirement.vo.ts
├── policies/
│   └── scout-activation.policy.ts
├── repositories/
│   └── scout.repository.ts
├── events/
│   └── scout-activated.event.ts
└── errors/
    └── scout-not-ready.error.ts
```

Domain classes:

- do not depend on NestJS decorators;
- do not know persistence schemas;
- do not know transport DTOs;
- do not know provider models;
- expose business behavior rather than public mutable state.

## 7. Repository interfaces

Repository interfaces live inward, close to the owning domain/application model.

```ts
/**
 * Defines persistence operations required by the scout domain.
 *
 * Implementations may use PostgreSQL or another persistence technology.
 * Consumers of this interface remain unaware of that detail.
 */
export interface ScoutRepository {
  /**
   * Finds a scout owned by the specified authenticated actor.
   * A non-owned ID is treated as unavailable.
   */
  findById(scoutId: string, userId: string): Promise<Scout | null>;

  /**
   * Persists aggregate state only if the stored version still matches.
   * Rejects concurrent modifications rather than overwriting them.
   */
  save(scout: Scout, expectedVersion: number): Promise<void>;
}
```

Infrastructure implementation:

```text
packages/adapters/src/scouts/persistence/
├── postgres-scout.repository.ts
└── scout.persistence-mapper.ts
```

Only the infrastructure implementation imports datasource clients. Transaction-specific repository contracts may additionally expose explicit locked reads where required.

## 8. Redis and other datasource access

Application services must not receive raw Redis, database, vector-search, object-storage, or queue clients.

Use business-meaningful abstractions.

```ts
/**
 * Provides short-lived storage for opportunity retrieval artifacts.
 */
export interface OpportunityRetrievalCacheRepository {
  /** Returns a private or shareable artifact only within its key's access scope. */
  get(key: OpportunityRetrievalCacheKey): Promise<CachedRetrieval | null>;

  /** Stores a version-bound artifact until its validity or TTL expires. */
  set(
    key: OpportunityRetrievalCacheKey,
    value: CachedRetrieval,
    ttlSeconds: number,
  ): Promise<void>;

  /** Removes artifacts whose owning inputs or access permissions changed. */
  invalidate(scope: OpportunityRetrievalCacheScope): Promise<void>;
}
```

Infrastructure implementation:

```text
packages/adapters/src/retrieval/cache/
└── redis-opportunity-retrieval-cache.ts
```

The same principle applies to locks, rate-limit state, queues, search indexes, and object storage.

## 9. AI provider access

No application service imports the OpenAI SDK, LangGraph, reranker SDK, or search-provider SDK directly.

Application ports:

```ts
/**
 * Evaluates professional alignment using only the supplied evidence.
 */
export interface FitEvaluator {
  /** Assesses fit from supplied evidence without asserting unsupported facts. */
  evaluate(input: FitEvaluationInput): Promise<FitEvaluation>;
}

/**
 * Produces semantic vectors for retrieval representations.
 */
export interface EmbeddingProvider {
  /** Returns vectors with provider, model, dimension, and representation metadata. */
  embed(inputs: EmbeddingInput[]): Promise<EmbeddingVector[]>;
}

/**
 * Executes a bounded research case and returns evidence or an
 * explicit unresolved outcome.
 */
export interface ResearchEngine {
  /** Investigates within the supplied scope, deadline, and reserved budget. */
  investigate(input: ResearchCaseInput): Promise<ResearchOutcome>;
}
```

Infrastructure implementations:

```text
packages/adapters/src/matching/evaluators/openai-fit-evaluator.ts
packages/adapters/src/retrieval/embeddings/openai-embedding.provider.ts
packages/adapters/src/research/search/tavily-search.provider.ts
```

ScoutAlert-owned models implement the same contracts when introduced. Contract compatibility does not establish equivalent quality; run relevant evaluations and versioned rollout/migration checks. Durable research orchestration belongs to the selected workflow implementation, not an unconditional LangGraph dependency.

## 10. Application layer and use cases

Prefer use-case classes with one clear application responsibility.

```text
CreateScoutUseCase
UpdateScoutUseCase
PauseScoutUseCase
ActivateScoutUseCase
EvaluateOpportunityUseCase
EvaluateScoutUseCase
PublishRecommendationsUseCase
StartResearchUseCase
```

Avoid catch-all service classes that accumulate unrelated operations.

Example:

```ts
/**
 * Activates a reviewed scout and records the initial scouting work.
 */
export class ActivateScoutUseCase {
  /** Binds the transaction-scoped repository factory; no raw client is exposed. */
  constructor(private readonly unitOfWork: ScoutUnitOfWork) {}

  /**
   * Loads, checks, and activates a scout inside one persistence transaction.
   * Saves the activation and durable dispatch intent atomically.
   *
   * @throws ScoutNotFoundError
   * @throws ScoutNotReadyError
   */
  async execute(command: ActivateScoutCommand): Promise<ActivateScoutResult> {
    return this.unitOfWork.execute(async (repositories) => {
      const scout = await repositories.scouts.findOwnedForUpdate(
        command.scoutId,
        command.userId,
      );

      if (!scout) {
        throw new ScoutNotFoundError(command.scoutId);
      }

      scout.assertExpectedVersion(command.expectedVersion);
      const expectedVersion = scout.version;
      scout.activate();

      await repositories.scouts.save(scout, expectedVersion);
      await repositories.outbox.add(ScoutActivatedEvent.from(scout));
      return ActivateScoutResult.from(scout);
    });
  }
}
```

The callback repositories share one Kysely transaction and connection; locked reads occur after it begins. This example illustrates transaction participation, not the complete onboarding flow. Onboarding activation additionally persists the request fingerprint/result, approved revisions, consent, and draft-consumption identity in that transaction. Event IDs derive from stable aggregate/version identity and outbox uniqueness.

The use case coordinates. Domain objects enforce behavior. Repositories persist. Adapters communicate with external systems.

## 11. No nested conditionals

Business code uses guard clauses. Every `if`/`else` and loop body has curly braces, including one-statement bodies. Separate methods and logical blocks with blank lines while keeping related statements together.

Preferred:

```ts
if (!scout) {
  throw new ScoutNotFoundError(scoutId);
}

if (!scout.canActivate()) {
  throw new ScoutNotReadyError(scoutId);
}

scout.activate();
```

Multi-rule decisions should use policies or ordered rules.

```ts
/**
 * Evaluates recommendation publication rules in deterministic order.
 */
export class RecommendationPublicationPolicy {
  /** Supplies publication rules in their documented precedence order. */
  constructor(private readonly rules: RecommendationPublicationRule[]) {}

  /** Returns the first terminal rule decision or a permitted publication result. */
  evaluate(
    input: RecommendationPublicationInput,
  ): RecommendationPublicationDecision {
    for (const rule of this.rules) {
      const decision = rule.evaluate(input);

      if (decision.isTerminal()) {
        return decision;
      }
    }

    return RecommendationPublicationDecision.publish();
  }
}
```

Flat control flow is the goal. Replacing nested branches with an unreadable compound boolean is not acceptable.

## 12. Class and method responsibility

A class has one coherent reason to change.

A method represents one understandable operation.

When a method performs multiple stages, extract meaningful operations such as:

```text
loadCurrentEvidence()
validateHardConstraints()
buildFitEvaluationInput()
evaluateProfessionalFit()
determineResearchNeed()
persistEvaluation()
```

Extraction is based on semantic responsibility rather than arbitrary line limits.

## 13. Documentation standard

### Classes

Every class has TSDoc describing:

- its responsibility;
- its architectural layer/boundary;
- important invariants when relevant.

Example:

```ts
/**
 * Determines whether an evaluated opportunity can be published to a
 * user's main recommendation feed.
 *
 * Confirmed hard eligibility conflicts take precedence over
 * professional-fit signals.
 */
export class RecommendationPublicationPolicy {}
```

### All methods and constructors

Document:

- business purpose;
- non-obvious inputs;
- return semantics;
- side effects;
- relevant domain/application errors.

Apply this to public and private methods, constructors, and interface methods. Simple methods still receive a concise useful comment; they are not exempt. For repositories, workflows, and consequential use cases, document transaction participation, concurrency, retry/idempotency, cache validity, and side-effect boundaries.

Comments should explain intent and invariants rather than restating syntax.

## 14. Naming conventions

Use clear suffixes:

```text
*.entity.ts
*.vo.ts
*.repository.ts
*.use-case.ts
*.query.ts
*.command.ts
*.result.ts
*.policy.ts
*.rule.ts
*.port.ts
*.mapper.ts
*.controller.ts
*.processor.ts
*.provider.ts
*.event.ts
*.error.ts
*.schema.ts
```

Preferred examples:

```text
evaluate-opportunity.use-case.ts
postgres-scout.repository.ts
recommendation-publication.policy.ts
openai-fit-evaluator.ts
```

Avoid vague naming such as:

```text
helper.ts
utils2.ts
manager.ts
common-service.ts
processor-v2.ts
misc.ts
```

A generic utility is acceptable only when its responsibility is genuinely generic and explicit.

## 15. Mapping boundaries

Use explicit mappers between:

```text
HTTP DTO ↔ Application Command
Database Row ↔ Domain Entity
Provider Response ↔ Infrastructure Result
Domain/Application Result ↔ HTTP Presenter
```

Database rows are not domain entities.

Provider payloads do not leak past infrastructure.

Presentation contracts do not define domain behavior.

## 16. Transactions and Unit of Work

Application use cases depend on an inward-facing transaction abstraction.

```ts
/**
 * Supplies repositories bound to one transaction for Scout state changes.
 */
export interface ScoutTransactionScope {
  /** Repository with an owned locked-read operation and version-checked writes. */
  readonly scouts: TransactionalScoutRepository;
  /** Durable intent repository bound to the same transaction. */
  readonly outbox: OutboxRepository;
}

/** Defines an atomic boundary without exposing a datasource or query object. */
export interface ScoutUnitOfWork {
  /**
   * Runs work using transaction-bound repositories; commits only on success.
   * Rolls back on error and never retries external side effects.
   */
  execute<T>(
    work: (repositories: ScoutTransactionScope) => Promise<T>,
  ): Promise<T>;
}
```

The PostgreSQL/Kysely implementation lives in `packages/adapters/src/database/transactions`. Feature/application contracts define only the repository scope required by the operation. Every repository in a scope uses the same transaction instance; ambient transaction propagation must not be assumed.

Reads used to authorize or decide a mutation occur inside the transaction with a declared lock or optimistic version check. Keep lock ordering consistent and retries bounded. Persist business changes, idempotency result, and outbox records atomically. A callback around unrelated repository instances does not establish atomicity.

External API calls, model calls, queue publishes, and email sends are not performed inside long-running database transactions.

Use the transactional outbox when a durable state change must cause background work.

## 17. Workflow and worker structure

Workflow definitions already live in `packages/workflows` using Temporal. They execute configured durable sequencing, timers, cancellation and bounded continuation, and contain no raw datasource or provider calls. Business rules remain in core.

Worker composition registers workflows/activities and selected workload roles. An activity validates serializable input, establishes actor/version/correlation context, calls a core use case, and maps declared retry/failure outcomes. A processor implementing a different execution adapter follows the same boundary.

Workers must not duplicate matching, eligibility, consent, persistence, or ranking rules. Long-running work checks superseded revisions and cancellation before publication. External effects use durable logical identities and reconciliation. Recovery/replay and workflow-compatible deployment checks accompany the implementation.

### Discovery and agent implementation rules

- Agent roles are application responsibilities with explicit inputs, permitted actions, observations, outputs and stopping policy. A bounded extraction/fit call does not need an agent framework.
- Scout planning, deep discovery, evidence research and source expansion have distinct ownership and evaluation. They do not directly access data sources or authorize their own effects.
- Provider contracts retain search filters, streams, pagination, completeness, recovery and access scope; unsupported features are explicit.
- Registries hold validated source/provider data. Adding a source instance under an existing adapter does not require hardcoding every domain in business logic; novel protocols require reviewed implementation and tests.
- Persist observations, accepted work and downstream intent before committing ingestion progress. Retry-safe identity, fenced leases and explicit gap handling protect recovery.
- Network admission occurs before fetch and on redirects. Untrusted source instructions cannot change permissions, leak private data or invoke outbound contact.
- No database transaction spans a model, search, fetch/render or email request. Budgets are reserved durably and reconciled, including uncertain outcomes.
- Shared caches include source rights, query semantics, versions and freshness. Private briefs and assessments remain actor-scoped; cache loss cannot authorize a duplicate effect.
- Multiple questions can share a research case and fetch. Reuse still checks role/entity applicability, geography, engagement type and freshness.
- Independent workload limits, fair scheduling and reserved exploration protect timely discovery and underserved cohorts.

These are target implementation requirements, not claims that all corresponding enforcement tooling exists. The [discovery architecture](../architecture/scoutalert-discovery-architecture.md) and [acceptance gates](scoutalert-discovery-acceptance.md) provide contracts and failure scenarios.

## 18. Shared packages

### packages/core

Owns framework-independent domain and application feature modules, repository contracts, external capability ports, business events, policies, and use cases. It cannot import infrastructure or presentation packages.

### packages/adapters

Owns feature-specific repositories, cache/search implementations, source connectors, provider integration, persistence mapping, database migrations/types, and transaction plumbing. Low-level client factories are shared infrastructure. Application composition constructs clients and binds implementations.

### packages/workflows

Owns selected-engine workflow definitions and serializable activity contracts. It cannot call raw clients or repositories. Worker hosts bind activities to core use cases. The installed queue dependencies do not require a parallel queue hierarchy or two competing workflow-state owners.

### packages/evaluation

Owns versioned extraction, retrieval, matching, research, and ranking evaluations and experiment runners. Datasets preserve lineage and permitted access. Quality, cost, and latency regressions are evaluated before changing providers or introducing ScoutAlert-owned models.

### packages/contracts

Contains transport contracts intentionally shared across applications.

Transport contracts are not domain entities.

### packages/observability

Contains correlation context, logger interfaces/adapters, tracing helpers, redaction, and metrics helpers.

## 19. Dependency enforcement

Architectural rules should be machine-enforced.

Use:

- ESLint no-restricted-imports;
- package exports;
- module/public API boundaries;
- dependency-boundary tooling;
- architecture tests.

Examples:

```text
domain/** cannot import @nestjs/*
packages/core/** cannot import @repo/adapters
packages/core/** cannot import @repo/workflows
packages/core/** cannot import @repo/contracts
packages/core/** cannot import pg, kysely, ioredis
domain/** cannot import openai

application/** cannot import bullmq
application/** cannot import @temporalio/*
application/** cannot import provider SDKs

api/controllers/** cannot import concrete adapters or raw clients
worker/activities/** cannot import datasource clients directly
web/** cannot import core, adapters, or workflows
workflows/** cannot import adapters or datasource/provider SDKs
```

Infrastructure is explicitly allowed to use technical packages. Composition roots are explicit wiring exceptions; they do not perform business queries. Restrict cross-feature deep imports using feature `public.ts` exports.

The current implementation runs `pnpm check:architecture` before workspace linting. It checks core runtime/development dependency ownership, core source imports, outward adapter workspace dependencies/imports, explicit core/adapter feature exports, relative-path access to those packages, and web/UI access to them. Static and type-only imports, re-exports, CommonJS imports, and literal dynamic imports are checked; computed module paths fail. Core test/config tooling must be explicitly approved and declared. Boundary regression tests run through `pnpm test:architecture`.

Workflow SDK and import restrictions are also enforced in the current tooling. Finer-grained feature-layer, cross-feature, API presentation and activity checks remain necessary as those modules expand. Alternative path aliases or custom module loaders require boundary-tool support before adoption; they must not bypass package ownership.

## 20. Error handling

Use explicit domain/application errors such as:

```text
ScoutNotFoundError
ScoutNotReadyError
OpportunityUnavailableError
StaleEvaluationError
UnsupportedOpportunityCategoryError
ResearchBudgetExhaustedError
EvidenceConflictError
```

Controllers/presenters map them to safe transport responses.

Raw PostgreSQL, Redis, queue, model, or provider errors do not cross infrastructure boundaries.

Technical failure details remain in restricted observability.

## 21. Testing layout

Tests can live next to the code they validate:

```text
domain/
  policies/
    eligibility.policy.ts
    eligibility.policy.spec.ts

application/
  use-cases/
    evaluate-opportunity/
      evaluate-opportunity.use-case.ts
      evaluate-opportunity.use-case.spec.ts
```

Cross-component suites:

```text
apps/api/test/integration/
apps/worker/test/integration/
apps/web/test/e2e/
packages/adapters/test/integration/
packages/workflows/test/replay/
packages/test-utils/
```

Repository contract suites should be reusable across repository implementations. AI adapters use contract tests and evaluation fixtures so provider changes cannot silently alter domain expectations.

Discovery suites separate deterministic provider fixtures, real capability smoke checks, independent usefulness labels and load/recovery measurements. Use held-out sources and time windows, buyer-versus-seller negatives, multilingual cases, malformed cursors, partial batches, provider quota failures and crash windows around acknowledgement. Synthetic evidence alone cannot certify internet coverage or global capacity. Preserve historical run data and report unrun gates explicitly.

## 22. Code review checklist

Before approval, confirm:

- Business logic is in the correct module and layer.
- No application service imports database, Redis, vector, queue, storage, or vendor SDK clients.
- Repository interfaces expose domain/application concepts rather than infrastructure types.
- Control flow contains no nested `if` statements.
- Every conditional/loop body has braces, and methods/logical blocks have readable spacing.
- Classes have cohesive responsibilities.
- Classes are documented.
- Every method, including constructors, private methods, and interface methods, has useful documentation.
- Names describe business intent.
- Provider errors are translated at boundaries.
- Transactions are correctly scoped.
- Participating repositories share the same transaction; mutation reads are locked or version-checked.
- External side effects occur outside database transactions.
- Retry/idempotency behavior is defined where relevant.
- Sensitive data is not leaked into logs/traces.
- Relevant unit, integration, end-to-end, and AI evaluation tests exist.
- Versioning and evidence provenance are preserved where applicable.
- Source/provider capability and completeness semantics are preserved.
- Ingestion acknowledgement cannot outrun durable accepted work.
- Agent actions obey current tools, budgets, input revisions and source policy.
- Shared reuse does not expose private data or stop reserved exploration.
- Discovery and production-readiness claims link to their actual acceptance evidence.

## 23. Related documents

- [Internet Discovery Architecture](../architecture/scoutalert-discovery-architecture.md)
- [Discovery Acceptance Gates](scoutalert-discovery-acceptance.md)
- [Discovery Evaluation Protocol](../../evaluations/discovery/README.md)
- [Platform PRD](../prd/scoutalert-platform-prd.md)
- [Repository Layout](scoutalert-repository-layout.md)
- [Platform Architecture](../architecture/scoutalert-platform-architecture-v0.1.md)
- [Technology and AI Stack](../architecture/scoutalert-technology-stack-v0.1.md)
- [Onboarding Architecture](../architecture/scoutalert-onboarding-architecture-v0.1.md)
- [Onboarding PRD](../prd/scoutalert-onboarding-prd-v0.1.md)
