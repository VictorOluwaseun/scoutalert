# ScoutAlert — Technology and AI Stack

**Version:** 0.1  
**Date:** 29 September 2026  
**Status:** Proposed target stack  
**Scope:** Platform, AI, retrieval, execution, testing, and provider boundaries

## 1. Stack objective

ScoutAlert is TypeScript-first and uses established infrastructure for generic capabilities while keeping ScoutAlert-specific intelligence, evidence, policies, evaluation, and orchestration in our own application.

The stack is designed for:

- robust global opportunity discovery;
- high-quality hybrid retrieval;
- evidence-grounded RAG;
- bounded agentic research;
- efficient model use;
- reliable scheduled execution;
- strong observability;
- progressive replacement of third-party AI components by ScoutAlert-owned implementations.

## 2. Application stack

| Area | Technology | Role |
|---|---|---|
| Runtime | Node.js + TypeScript | Common runtime across web, API, workers, and AI integration |
| Monorepo | pnpm + Turborepo | Workspace dependency management and build orchestration |
| Web | Next.js + React | Public site, onboarding, dashboard, settings |
| Styling/components | Tailwind CSS + shadcn/ui | Product UI foundation and accessible component composition |
| Client server-state | TanStack Query | Fetching, mutations, caching, invalidation for interactive client flows |
| Backend | NestJS | Application use cases, authorization, policies, modules, DI |
| API style | REST first | Clear resource/action contracts; internal providers remain behind ports |
| Validation | Zod | Runtime request, provider, configuration, and structured-output validation |
| Database | PostgreSQL | Durable system of record |
| Query layer | Kysely + pg | Typed SQL, transactions, explicit query control |
| Semantic search | pgvector | Vector retrieval inside PostgreSQL |
| Keyword search | PostgreSQL full-text search | Exact/domain-term retrieval |
| Cache/runtime | Redis | Temporary state, coordination, rate limits, short-lived caches |
| Background jobs | BullMQ + NestJS BullMQ integration | Ingestion, matching, research, notifications, reconciliation |
| Object storage | S3-compatible storage | Private documents and permitted source snapshots |
| Email | EmailProvider adapter; Resend is an initial candidate | Verification and opportunity alerts |
| Observability | OpenTelemetry + Langfuse-compatible tracing/evaluation | Operational and AI workflow visibility |
| Testing | Vitest + Playwright + Testcontainers | Unit, browser, and real dependency integration testing |

The repository already contains the pnpm/Turborepo and Next.js foundation. API, worker, database, AI, and supporting packages are the target architecture to add.

## 3. AI approach

ScoutAlert is primarily a **RAG-based matching platform with bounded agentic research**.

Fine-tuning is not required for the initial intelligence pipeline, but the architecture supports fine-tuned or ScoutAlert-owned models as the evaluation data and requirements justify them.

~~~text
Hybrid retrieval
   ↓
Evidence package
   ↓
Pretrained LLM evaluation
   ↓
Validated recommendation

Unresolved consequential question
   ↓
Bounded agentic research
   ↓
New evidence / conflicting evidence / unconfirmed
   ↓
Re-evaluation
~~~

## 4. Core AI dependencies

### 4.1 OpenAI SDK

**What it does**

Provides the TypeScript integration for model responses, structured outputs, tool calling, embeddings, and usage metadata.

**Why ScoutAlert needs it**

We use a maintained provider SDK rather than implementing provider transport ourselves. Product modules do not import it directly; all access goes through ScoutAlert infrastructure adapters and the AI gateway.

### 4.2 GPT-5.4 mini

**What it does**

- interprets onboarding free text;
- extracts requirements from unstructured opportunity content;
- compares confirmed experience with role responsibilities;
- interprets evidence and conflicts;
- produces grounded explanations;
- participates in bounded research workflows.

**Why ScoutAlert needs it**

Most ScoutAlert model work is focused interpretation rather than unrestricted generation. Mini is our default candidate for strong quality with controlled cost.

It is never authoritative for authentication, ownership, consent, hard business constraints, database state, scheduling, or source permissions.

### 4.3 Embedding model

**Initial candidates**

- text-embedding-3-small
- text-embedding-3-large

**What it does**

Converts search/profile/opportunity representations into vectors for semantic retrieval.

**Why ScoutAlert needs it**

Relevant opportunities can use different wording from a user's profile. Embeddings help retrieve conceptually related opportunities that keyword matching alone can miss.

The production choice is evaluation-driven. Compare multilingual and cross-domain Recall@K, precision, latency, index resource usage, and total downstream evaluation cost.

Store the provider, model/version, dimensions, representation version, and embedding version with the vector.

### 4.4 pgvector

**What it does**

Stores and searches embedding vectors inside PostgreSQL.

**Why ScoutAlert needs it**

It allows semantic retrieval close to our opportunity metadata, evidence, full-text search, and structured filters.

Application use cases depend on CandidateRetriever/index repository abstractions, not pgvector or database clients.

### 4.5 LangGraph.js

**What it does**

Coordinates stateful multi-step research workflows.

**Why ScoutAlert needs it**

A consequential unknown may require several steps:

~~~text
Check existing evidence
 → search approved sources
 → fetch source
 → extract scoped evidence
 → validate
 → resolve or continue
~~~

LangGraph is an infrastructure implementation of the ScoutAlert ResearchEngine port. ScoutAlert repositories remain authoritative for evidence and domain state.

### 4.6 Web research provider

**Candidates**

- Tavily
- OpenAI web search
- other providers that pass our source-quality, privacy, latency, and cost evaluation

**What it does**

Finds additional public evidence when the indexed opportunity data does not answer an important question.

**Why ScoutAlert needs it**

Hiring geography, sponsorship, employment arrangements, or company policies may be documented outside the opportunity posting.

The provider is accessed behind WebSearchProvider and SourceFetchProvider interfaces and is subject to tool budgets, access policy, source restrictions, and privacy controls.

### 4.7 Zod

**What it does**

Runtime-validates API contracts, structured model outputs, provider results, configuration, and tool arguments.

**Why ScoutAlert needs it**

A model producing valid-looking JSON is not enough. ScoutAlert validates response shape before applying domain meaning and policies.

Zod validates structure. Domain/application policies validate semantics.

### 4.8 Langfuse-compatible observability

**What it does**

Tracks model/prompt/schema versions, usage, latency, failures, traces, and evaluation datasets.

**Why ScoutAlert needs it**

We need to distinguish:

- retrieval failures;
- missing evidence;
- extraction errors;
- model errors;
- policy decisions;
- research failures;
- cost/latency regressions.

Private data is minimized or redacted before observability export.

### 4.9 Reranker

**Initial approach**

Use a Reranker port. Evaluate Cohere Rerank and any later candidates against the hybrid-retrieval baseline.

**What it does**

Reorders a candidate set for relevance before deeper fit evaluation.

**Why ScoutAlert may use it**

A stronger shortlist can improve recommendation quality and reduce expensive downstream evaluation. It becomes active when evaluation demonstrates useful gain.

### 4.10 Stronger-model fallback

**What it does**

Provides additional reasoning capacity for selected difficult cases.

**When it is used**

Observable triggers can include:

- conflicting evidence;
- repeated semantic validation failure;
- complex multilingual requirements;
- material ambiguity affecting publication.

Missing evidence alone does not justify escalation; it requires retrieval or an unconfirmed result.

## 5. Model routing

ScoutAlert routes AI tasks through a central gateway.

| Task | Starting model strategy |
|---|---|
| Straightforward extraction | GPT-5.4 mini with none/low reasoning |
| Onboarding free-text interpretation | GPT-5.4 mini low |
| Profile/opportunity fit | mini low, evaluated against medium |
| Complex requirement interpretation | mini medium |
| Research workflow | mini medium |
| Difficult evidence conflict | evaluated mini high or approved stronger fallback |
| Digest rendering | deterministic templates first |

The gateway also owns:

- prompt version;
- schema version;
- task-specific deadlines;
- attempts;
- reasoning effort;
- output ceilings;
- tool allowlists;
- privacy class;
- cost reservation/reconciliation;
- tracing metadata.

## 6. RAG stack

ScoutAlert does not need a standalone package called RAG.

RAG is the composition of:

~~~text
PostgreSQL structured data
+ PostgreSQL full-text search
+ pgvector
+ EvidenceRepository
+ ProfileRepository
+ WatchlistRepository
+ Retrieval policies
+ GPT-5.4 mini
+ Structured output validation
+ Domain validation
~~~

The retrieval layer creates a compact evidence package. The model interprets that package. ScoutAlert validates the result before publication.

## 7. Infrastructure ports

Business modules depend on ScoutAlert abstractions:

~~~ts
export interface OpportunityRepository {}
export interface EvidenceRepository {}
export interface WatchlistRepository {}
export interface MatchEvaluationRepository {}
export interface CandidateRetriever {}
export interface EmbeddingProvider {}
export interface FitEvaluator {}
export interface Reranker {}
export interface ResearchEngine {}
export interface WebSearchProvider {}
export interface EmailProvider {}
export interface EventPublisher {}
~~~

Provider-specific implementations live in infrastructure.

No application use case imports PostgreSQL/Kysely, Redis, pgvector, BullMQ, OpenAI, LangGraph, Tavily, Resend, or another vendor SDK directly.

## 8. PostgreSQL, Kysely, and pgvector

PostgreSQL is the durable authority for product state.

Kysely is used by infrastructure repositories for typed SQL and explicit control over joins, filters, transactions, locking, indexes, and query plans.

The shared database package contains low-level client, migration, and transaction primitives. Domain-specific repositories remain inside their owning modules.

The initial retrieval stack is:

~~~text
Structured SQL filtering
+ PostgreSQL full-text search
+ pgvector semantic retrieval
+ fusion
+ optional reranking
~~~

Retrieval quality is measured across exact/approximate search, filtered search, languages, occupations, and different query densities.

## 9. Redis and BullMQ

Redis supports:

- short-lived caches;
- runtime coordination;
- rate/usage counters;
- BullMQ transport.

BullMQ runs background work generated by durable ScoutAlert intents.

Typical queues:

~~~text
source-ingestion
opportunity-normalization
opportunity-indexing
watchlist-matching
research
notification
outbox
retention
reconciliation
~~~

Workers receive IDs/versions and call application use cases. Durable database state, idempotency, and reconciliation protect correctness across retries.

## 10. Authentication and email

Generic identity mechanics can be supplied by an established provider/library behind the ScoutAlert identity boundary.

ScoutAlert owns:

- guest-session ownership;
- guest-to-account claim;
- authorization;
- session policy;
- account/watchlist ownership;
- opportunity-alert consent;
- audit records.

Email lives behind EmailProvider.

The provider sends messages. ScoutAlert owns eligibility to send, digest composition, scheduling, suppressions, consent, idempotency, grouping, and the delivery ledger.

## 11. Testing and evaluation stack

### Unit testing

**Vitest**

Covers entities, value objects, policies, application use cases, mappers, retrieval/fusion algorithms, and pure business logic.

### Integration testing

**Testcontainers**

Runs real PostgreSQL/pgvector and Redis/BullMQ for transaction, concurrency, queue, outbox, and cache behavior.

### End-to-end

**Playwright**

Covers onboarding, watchlists, recommendation review, guest/account transitions, settings, accessibility, responsive behavior, and recovery paths.

### AI evaluation

Maintain ScoutAlert-specific labeled datasets for:

- opportunity extraction;
- eligibility evidence;
- country restrictions;
- sponsorship wording;
- compensation units;
- professional fit;
- semantic retrieval;
- ambiguous remote roles;
- multilingual cases;
- conflicts;
- prompt injection;
- unsupported claims.

Every major prompt/model/embedding/retrieval/reranker change runs against the relevant evaluation suites.

## 12. ScoutAlert-owned AI evolution

The interfaces are designed for side-by-side migration to our own technology.

~~~text
EmbeddingProvider
├── OpenAIEmbeddingProvider
└── ScoutAlertEmbeddingProvider

Reranker
├── ExternalReranker
└── ScoutAlertReranker

FitEvaluator
├── OpenAIFitEvaluator
└── ScoutAlertFitEvaluator

ResearchEngine
├── LangGraphResearchEngine
└── ScoutAlertResearchEngine
~~~

Potential owned components include:

- embedding models;
- rerankers;
- opportunity classifiers;
- eligibility classifiers;
- fit models;
- source extraction models;
- domain-adapted/fine-tuned language models;
- search/index infrastructure;
- specialized agents.

The owning application contract remains stable while implementations evolve.

## 13. Target repository layout

~~~text
apps/
├── web/
├── api/
├── worker/
└── docs/

packages/
├── contracts/
├── database/
├── cache/
├── queue/
├── ai/
├── config/
├── observability/
├── test-utils/
├── ui/
├── eslint-config/
└── typescript-config/
~~~

The detailed Clean Architecture rules and module layout are defined in the engineering standards document.

## 14. Related documents

- [Platform Architecture](scoutalert-platform-architecture-v0.1.md)
- [Onboarding Architecture](scoutalert-onboarding-architecture-v0.1.md)
- [Onboarding PRD](../prd/scoutalert-onboarding-prd-v0.1.md)
- [Engineering Standards and Project Structure](../engineering/scoutalert-engineering-standards-v0.1.md)
