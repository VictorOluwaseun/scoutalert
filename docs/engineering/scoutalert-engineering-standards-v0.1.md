# ScoutAlert — Engineering Standards and Project Structure

**Version:** 0.1  
**Date:** 29 September 2026  
**Status:** Mandatory engineering baseline  
**Scope:** Backend architecture, dependency rules, code organization, documentation, maintainability, and testing

## 1. Engineering rules

The following are mandatory ScoutAlert engineering rules:

1. **No direct datasource imports in application services.** Database, Redis, vector search, object storage, queues, and other data sources are accessed through repositories or ports.
2. **Clean Architecture and Repository Pattern.** Dependencies point inward toward domain/application abstractions.
3. **No nested conditionals in business code.** Use guard clauses, ordered policies, strategy objects, discriminated results, or dedicated rules.
4. **No spaghetti code.** Each unit has a clear responsibility and architectural location.
5. **No code dumping or catch-all services.** Large responsibilities are decomposed into explicit use cases, policies, entities, repositories, and adapters.
6. **Every class has documentation.** TSDoc explains responsibility and architectural boundary.
7. **Public methods are documented.** Non-obvious domain/application methods explain business intent, inputs, outputs, and relevant errors. Private trivial helpers do not need redundant comments.
8. **Business logic is framework-independent where practical.** Domain types do not import NestJS, Kysely, Redis, BullMQ, OpenAI, or HTTP packages.
9. **Infrastructure is replaceable.** Provider-specific code implements inward-facing interfaces.
10. **Workers execute use cases.** Worker processors do not duplicate business rules.

## 2. Dependency direction

~~~text
Presentation
    ↓
Application
    ↓
Domain

Infrastructure
    ↓
Application ports / Domain repositories
~~~

Allowed:

~~~text
Controller → Use Case
Use Case → Domain Entity
Use Case → Repository Interface
Use Case → External Port Interface
Infrastructure Repository → Database package
Infrastructure Adapter → Vendor SDK
~~~

Not allowed:

~~~text
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
~~~

## 3. Target monorepo layout

~~~text
scoutalert/
├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   └── docs/
│
├── packages/
│   ├── contracts/
│   ├── database/
│   ├── cache/
│   ├── queue/
│   ├── ai/
│   ├── config/
│   ├── observability/
│   ├── test-utils/
│   ├── ui/
│   ├── eslint-config/
│   └── typescript-config/
│
├── docs/
│   ├── architecture/
│   ├── engineering/
│   └── prd/
│
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
~~~

## 4. API organization: feature-first modules

The API is organized by business capability, not global technical folders.

~~~text
apps/api/src/
├── app.module.ts
├── main.ts
│
├── modules/
│   ├── onboarding/
│   ├── identity/
│   ├── profiles/
│   ├── watchlists/
│   ├── sources/
│   ├── opportunities/
│   ├── evidence/
│   ├── retrieval/
│   ├── matching/
│   ├── research/
│   ├── recommendations/
│   ├── notifications/
│   ├── feedback/
│   ├── applications/
│   └── operations/
│
└── shared/
    ├── domain/
    ├── application/
    ├── infrastructure/
    └── presentation/
~~~

Each feature owns its business behavior and infrastructure adapters.

## 5. Standard module layout

~~~text
module/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── policies/
│   ├── repositories/
│   ├── events/
│   ├── enums/
│   └── errors/
│
├── application/
│   ├── use-cases/
│   ├── queries/
│   ├── ports/
│   ├── commands/
│   └── results/
│
├── infrastructure/
│   ├── persistence/
│   ├── cache/
│   ├── queue/
│   ├── ai/
│   ├── providers/
│   └── mappers/
│
├── presentation/
│   ├── controllers/
│   ├── dto/
│   ├── presenters/
│   └── guards/
│
└── <module>.module.ts
~~~

Create only the folders the module actually uses.

## 6. Domain layer

The domain layer contains ScoutAlert business concepts.

Example:

~~~text
watchlists/domain/
├── entities/
│   └── watchlist.entity.ts
├── value-objects/
│   ├── search-specification.vo.ts
│   └── compensation-requirement.vo.ts
├── policies/
│   └── watchlist-activation.policy.ts
├── repositories/
│   └── watchlist.repository.ts
├── events/
│   └── watchlist-activated.event.ts
└── errors/
    └── watchlist-not-ready.error.ts
~~~

Domain classes:

- do not depend on NestJS decorators;
- do not know persistence schemas;
- do not know transport DTOs;
- do not know provider models;
- expose business behavior rather than public mutable state.

## 7. Repository interfaces

Repository interfaces live inward, close to the owning domain/application model.

~~~ts
/**
 * Defines persistence operations required by the watchlist domain.
 *
 * Implementations may use PostgreSQL or another persistence technology.
 * Consumers of this interface remain unaware of that detail.
 */
export interface WatchlistRepository {
  /**
   * Finds a watchlist owned by the specified user.
   */
  findById(
    watchlistId: string,
    userId: string,
  ): Promise<Watchlist | null>;

  /**
   * Persists the current aggregate state.
   */
  save(watchlist: Watchlist): Promise<void>;
}
~~~

Infrastructure implementation:

~~~text
watchlists/infrastructure/
└── persistence/
    └── postgres/
        ├── repositories/
        │   └── postgres-watchlist.repository.ts
        └── mappers/
            └── watchlist.persistence-mapper.ts
~~~

Only the infrastructure implementation imports the database package.

## 8. Redis and other datasource access

Application services must not receive raw Redis, database, vector-search, object-storage, or queue clients.

Use business-meaningful abstractions.

~~~ts
/**
 * Provides short-lived storage for opportunity retrieval artifacts.
 */
export interface OpportunityRetrievalCache {
  get(key: OpportunityRetrievalCacheKey): Promise<CachedRetrieval | null>;

  set(
    key: OpportunityRetrievalCacheKey,
    value: CachedRetrieval,
    ttlSeconds: number,
  ): Promise<void>;

  invalidate(scope: OpportunityRetrievalCacheScope): Promise<void>;
}
~~~

Infrastructure implementation:

~~~text
retrieval/infrastructure/cache/
└── redis-opportunity-retrieval-cache.ts
~~~

The same principle applies to locks, rate-limit state, queues, search indexes, and object storage.

## 9. AI provider access

No application service imports the OpenAI SDK, LangGraph, reranker SDK, or search-provider SDK directly.

Application ports:

~~~ts
/**
 * Evaluates professional alignment using only the supplied evidence.
 */
export interface FitEvaluator {
  evaluate(input: FitEvaluationInput): Promise<FitEvaluation>;
}

/**
 * Produces semantic vectors for retrieval representations.
 */
export interface EmbeddingProvider {
  embed(inputs: EmbeddingInput[]): Promise<EmbeddingVector[]>;
}

/**
 * Executes a bounded research case and returns evidence or an
 * explicit unresolved outcome.
 */
export interface ResearchEngine {
  investigate(input: ResearchCaseInput): Promise<ResearchOutcome>;
}
~~~

Infrastructure implementations:

~~~text
matching/infrastructure/ai/openai-fit-evaluator.ts
retrieval/infrastructure/ai/openai-embedding.provider.ts
research/infrastructure/agent/langgraph-research-engine.ts
research/infrastructure/search/tavily-search.provider.ts
~~~

ScoutAlert-owned models implement the same ports when introduced.

## 10. Application layer and use cases

Prefer use-case classes with one clear application responsibility.

~~~text
CreateWatchlistUseCase
UpdateWatchlistUseCase
PauseWatchlistUseCase
ActivateWatchlistUseCase
EvaluateOpportunityUseCase
EvaluateWatchlistUseCase
PublishRecommendationsUseCase
StartResearchUseCase
~~~

Avoid catch-all service classes that accumulate unrelated operations.

Example:

~~~ts
/**
 * Activates a reviewed watchlist and records the initial scouting work.
 */
export class ActivateWatchlistUseCase {
  constructor(
    private readonly watchlists: WatchlistRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly outbox: OutboxRepository,
  ) {}

  /**
   * Activates the watchlist after validating domain prerequisites.
   *
   * @throws WatchlistNotFoundError
   * @throws WatchlistNotReadyError
   */
  async execute(
    command: ActivateWatchlistCommand,
  ): Promise<ActivateWatchlistResult> {
    const watchlist = await this.watchlists.findById(
      command.watchlistId,
      command.userId,
    );

    if (!watchlist) {
      throw new WatchlistNotFoundError(command.watchlistId);
    }

    watchlist.activate();

    await this.unitOfWork.execute(async () => {
      await this.watchlists.save(watchlist);
      await this.outbox.add(WatchlistActivatedEvent.from(watchlist));
    });

    return ActivateWatchlistResult.from(watchlist);
  }
}
~~~

The use case coordinates. Domain objects enforce domain behavior. Repositories persist. Infrastructure adapters communicate with external systems.

## 11. No nested conditionals

Business code uses guard clauses.

Preferred:

~~~ts
if (!watchlist) {
  throw new WatchlistNotFoundError(watchlistId);
}

if (!watchlist.canActivate()) {
  throw new WatchlistNotReadyError(watchlistId);
}

watchlist.activate();
~~~

Multi-rule decisions should use policies or ordered rules.

~~~ts
/**
 * Evaluates recommendation publication rules in deterministic order.
 */
export class RecommendationPublicationPolicy {
  constructor(
    private readonly rules: RecommendationPublicationRule[],
  ) {}

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
~~~

Flat control flow is the goal. Replacing nested branches with an unreadable compound boolean is not acceptable.

## 12. Class and method responsibility

A class has one coherent reason to change.

A method represents one understandable operation.

When a method performs multiple stages, extract meaningful operations such as:

~~~text
loadCurrentEvidence()
validateHardConstraints()
buildFitEvaluationInput()
evaluateProfessionalFit()
determineResearchNeed()
persistEvaluation()
~~~

Extraction is based on semantic responsibility rather than arbitrary line limits.

## 13. Documentation standard

### Classes

Every class has TSDoc describing:

- its responsibility;
- its architectural layer/boundary;
- important invariants when relevant.

Example:

~~~ts
/**
 * Determines whether an evaluated opportunity can be published to a
 * user's main recommendation feed.
 *
 * Confirmed hard eligibility conflicts take precedence over
 * professional-fit signals.
 */
export class RecommendationPublicationPolicy {}
~~~

### Public methods

Document:

- business purpose;
- non-obvious inputs;
- return semantics;
- side effects;
- relevant domain/application errors.

### Private methods

Document private methods when their purpose or constraint is not obvious from their name and implementation.

Comments should explain intent and invariants rather than restating syntax.

## 14. Naming conventions

Use clear suffixes:

~~~text
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
~~~

Preferred examples:

~~~text
evaluate-opportunity.use-case.ts
postgres-watchlist.repository.ts
recommendation-publication.policy.ts
openai-fit-evaluator.ts
~~~

Avoid vague naming such as:

~~~text
helper.ts
utils2.ts
manager.ts
common-service.ts
processor-v2.ts
misc.ts
~~~

A generic utility is acceptable only when its responsibility is genuinely generic and explicit.

## 15. Mapping boundaries

Use explicit mappers between:

~~~text
HTTP DTO ↔ Application Command
Database Row ↔ Domain Entity
Provider Response ↔ Infrastructure Result
Domain/Application Result ↔ HTTP Presenter
~~~

Database rows are not domain entities.

Provider payloads do not leak past infrastructure.

Presentation contracts do not define domain behavior.

## 16. Transactions and Unit of Work

Application use cases depend on an inward-facing transaction abstraction.

~~~ts
/**
 * Executes application work inside an atomic persistence transaction.
 */
export interface UnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
~~~

The PostgreSQL/Kysely implementation is infrastructure.

External API calls, model calls, queue publishes, and email sends are not performed inside long-running database transactions.

Use the transactional outbox when a durable state change must cause background work.

## 17. Worker structure

Workers are execution hosts.

~~~text
apps/worker/src/
├── main.ts
├── worker.module.ts
├── processors/
│   ├── source-ingestion.processor.ts
│   ├── opportunity-indexing.processor.ts
│   ├── watchlist-matching.processor.ts
│   ├── research.processor.ts
│   ├── notification.processor.ts
│   ├── outbox.processor.ts
│   └── reconciliation.processor.ts
└── scheduling/
    ├── source-refresh.scheduler.ts
    ├── scout-run.scheduler.ts
    └── cleanup.scheduler.ts
~~~

A processor should:

1. validate the queue payload;
2. establish correlation/execution context;
3. call the appropriate application use case;
4. map known retry/failure outcomes.

Workers must not duplicate matching, eligibility, consent, or persistence rules.

## 18. Shared packages

### packages/database

Contains low-level:

- Kysely/pg client;
- generated/declared database types;
- migrations;
- transaction implementation;
- database configuration.

Domain-specific repositories do not live here.

### packages/cache

Contains low-level Redis client/configuration and infrastructure primitives.

Business cache repositories live with the owning module.

### packages/queue

Contains BullMQ connection/configuration, queue names, base job metadata, and infrastructure helpers.

Application/domain code does not enqueue raw provider jobs.

### packages/ai

Contains provider clients, model configuration, common AI request/usage types, structured-output helpers, and instrumentation.

Business-specific evaluators/prompts live with the module that owns their meaning.

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

~~~text
domain/** cannot import @nestjs/*
domain/** cannot import @repo/database
domain/** cannot import @repo/cache
domain/** cannot import openai

application/** cannot import @repo/database
application/** cannot import @repo/cache
application/** cannot import bullmq
application/** cannot import provider SDKs

presentation/** cannot import database/cache packages
worker/processors/** cannot import datasource packages directly
~~~

Infrastructure is explicitly allowed to use technical packages.

## 20. Error handling

Use explicit domain/application errors such as:

~~~text
WatchlistNotFoundError
WatchlistNotReadyError
OpportunityUnavailableError
StaleEvaluationError
UnsupportedOpportunityCategoryError
ResearchBudgetExhaustedError
EvidenceConflictError
~~~

Controllers/presenters map them to safe transport responses.

Raw PostgreSQL, Redis, queue, model, or provider errors do not cross infrastructure boundaries.

Technical failure details remain in restricted observability.

## 21. Testing layout

Tests can live next to the code they validate:

~~~text
domain/
  policies/
    eligibility.policy.ts
    eligibility.policy.spec.ts

application/
  use-cases/
    evaluate-opportunity/
      evaluate-opportunity.use-case.ts
      evaluate-opportunity.use-case.spec.ts
~~~

Cross-component suites:

~~~text
apps/api/test/integration/
apps/worker/test/integration/
apps/web/test/e2e/
packages/test-utils/
~~~

Repository contract suites should be reusable across repository implementations. AI adapters use contract tests and evaluation fixtures so provider changes cannot silently alter domain expectations.

## 22. Code review checklist

Before approval, confirm:

- Business logic is in the correct module and layer.
- No application service imports database, Redis, vector, queue, storage, or vendor SDK clients.
- Repository interfaces expose domain/application concepts rather than infrastructure types.
- Control flow does not contain avoidable nested conditionals.
- Classes have cohesive responsibilities.
- Classes are documented.
- Public and non-obvious methods are documented appropriately.
- Names describe business intent.
- Provider errors are translated at boundaries.
- Transactions are correctly scoped.
- External side effects occur outside database transactions.
- Retry/idempotency behavior is defined where relevant.
- Sensitive data is not leaked into logs/traces.
- Relevant unit, integration, end-to-end, and AI evaluation tests exist.
- Versioning and evidence provenance are preserved where applicable.

## 23. Related documents

- [Platform Architecture](../architecture/scoutalert-platform-architecture-v0.1.md)
- [Technology and AI Stack](../architecture/scoutalert-technology-stack-v0.1.md)
- [Onboarding Architecture](../architecture/scoutalert-onboarding-architecture-v0.1.md)
- [Onboarding PRD](../prd/scoutalert-onboarding-prd-v0.1.md)
