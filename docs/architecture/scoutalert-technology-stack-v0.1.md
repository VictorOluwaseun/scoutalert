# ScoutAlert — Technology and AI Stack

**Version:** 0.4

**Date:** 1 October 2026

**Status:** Platform stack baseline; execution/provider adoption qualified below

**Scope:** Platform, AI, retrieval, execution, testing, and provider boundaries

## 1. Stack objective

ScoutAlert is TypeScript-first and uses established infrastructure for generic capabilities while keeping ScoutAlert-specific intelligence, evidence, policies, evaluation, and orchestration in our own application.

The stack is designed for:

- adaptive web/social discovery, focused crawling and continuously expanding global coverage;
- high-quality hybrid retrieval;
- evidence-grounded RAG;
- bounded planning, deep discovery, evidence research and source-expansion agents;
- efficient model use;
- reliable scheduled execution;
- strong observability;
- progressive replacement of third-party AI components by ScoutAlert-owned implementations.

## 2. Application stack

| Area                      | Technology                                                                                  | Role                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Runtime                   | Node.js + TypeScript                                                                        | Common runtime across web, API, workers, and AI integration                                                |
| Monorepo                  | pnpm + Turborepo                                                                            | Workspace dependency management and build orchestration                                                    |
| Web                       | Next.js + React                                                                             | Public site, onboarding, Scouts, recommendations, opportunity workspace, settings                          |
| Styling/components        | Tailwind CSS + shadcn/ui                                                                    | Product UI foundation and accessible component composition                                                 |
| Client server-state       | TanStack Query                                                                              | Fetching, mutations, caching, invalidation for interactive client flows                                    |
| API host                  | NestJS                                                                                      | HTTP presentation, authorization context, modules, DI composition of shared core use cases                 |
| API style                 | REST first                                                                                  | Clear resource/action contracts; internal providers remain behind ports                                    |
| Validation                | Zod                                                                                         | Runtime request, provider, configuration, and structured-output validation                                 |
| Database                  | PostgreSQL                                                                                  | Durable system of record                                                                                   |
| Query layer               | Kysely + pg                                                                                 | Typed SQL, transactions, explicit query control                                                            |
| Semantic search           | pgvector                                                                                    | Vector retrieval inside PostgreSQL                                                                         |
| Keyword search            | PostgreSQL full-text search                                                                 | Exact/domain-term retrieval                                                                                |
| Cache/runtime             | Redis                                                                                       | Temporary state, coordination, rate limits, short-lived caches                                             |
| Durable execution         | Temporal, selected and integrated locally; production adoption gates remain                 | Durable agent cases, scouting, retries, waits, cancellation and notification coordination                  |
| External discovery        | Capability-specific search/social/feed adapters; provider selection and access pending      | General web search, native X, public/authorized social paths and additional evaluated providers            |
| Focused crawling          | Source-policy fetchers, durable frontier and optional rendering adapters; target capability | Discover and monitor useful new sources, preserve versions and source progress                             |
| Owned opportunity index   | PostgreSQL projections initially; semantic/dedicated search evolves through evaluation      | Search admitted leads, opportunities, evidence and entity relationships from the first discovery increment |
| Existing queue dependency | BullMQ + NestJS integration, installed bootstrap                                            | Retain only for an explicit execution responsibility if justified; not a second workflow-state owner       |
| Object storage            | S3-compatible storage                                                                       | Private documents and permitted source snapshots                                                           |
| Email                     | EmailProvider port; Nodemailer SMTP to local Mailpit; Resend remains a production candidate | Local verification and grouped scheduled opportunity digests connected                                     |
| Observability             | OpenTelemetry + Langfuse-compatible tracing/evaluation                                      | Operational and AI workflow visibility                                                                     |
| Testing                   | Vitest + Playwright + Testcontainers                                                        | Unit, browser, and real dependency integration testing                                                     |

The repository contains pnpm/Turborepo, Next.js, NestJS, UI and dependency foundations, deterministic onboarding review, shared email verification/sessions, transactional Scout activation, and a local SMTP email adapter. It does not yet implement the full product pipeline. `@repo/core` is dependency-free; `@repo/adapters` owns the datasource/queue/email SDKs and depends inward on core. Manifest and source boundary checks run with linting. Identity challenges, verified accounts/sessions, confirmed Scouts, separate alert consent, retry receipts and initial-discovery outbox intents are implemented. A first live path now connects shared Greenhouse and Freelancer ingestion, evidence-based matching, current dashboard results, grouped scheduled Mailpit digests, leased outbox dispatch and finite Temporal execution. A local opt-in OpenAI extraction/personal-fit path now adds versioned caching, citation validation and bounded request admission. Bounded posting-availability and employer eligibility/sponsorship research, explicit personal authorization declarations and evidence-gated prompt alerts are implemented locally. Saved scouts support versioned edits, pause/resume and private recommendation feedback with bounded ranking adjustments. Broad source and research coverage, semantic retrieval, independent relevance judgments and production operations validation remain open. See [connected onboarding](../engineering/scoutalert-connected-onboarding.md) for the milestone boundary. The [local email guide](../engineering/scoutalert-local-email.md) owns Mailpit configuration and checks.

Separate established foundations from evaluated additions: PostgreSQL/Kysely/pg, Redis, Next.js/React, NestJS and Tailwind/shadcn remain the chosen foundation. Temporal is integrated locally and remains the selected durable execution direction. General web/native social adapters, the four discovery agent roles and source expansion are unimplemented target capabilities. Models/providers, reranking, optional research frameworks, dedicated search, event streaming and analytical storage require their specific adoption evidence. The [roadmap](../engineering/scoutalert-delivery-roadmap.md) owns implementation status.

Use native NestJS modules, DI, guards, validation and lifecycle hooks for hosts; Next.js rendering and route handlers for the product transport; PostgreSQL constraints, indexing and explicit transactions for correctness; Kysely for typed queries and `pg` for pooling inside adapters. Redis is disposable cache and bounded coordination. Provider abstractions must preserve useful stack capabilities rather than replace them with generic lowest-common-denominator wrappers.

## 3. AI approach

ScoutAlert is a **continuous opportunity intelligence platform** using adaptive external discovery, an owned index, hybrid retrieval, evidence-grounded interpretation, bounded agents, monitoring, delivery, opportunity management and feedback.

The initial roles are Scout Planner, Deep Discovery Agent, Evidence Research Agent and Source Expansion Agent. An agent iteratively selects permitted actions based on observations. Extraction, classification, embeddings, fit and ranking remain focused services when a bounded evaluation suffices. Agent types do not prescribe per-user running processes. The [discovery architecture](scoutalert-discovery-architecture.md) owns role contracts and action admission.

Fine-tuning is not required for the initial intelligence pipeline, but the architecture supports fine-tuned or ScoutAlert-owned models as the evaluation data and requirements justify them.

```text
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
```

## 4. Core AI dependencies

### 4.1 OpenAI SDK

**What it does**

Provides the TypeScript integration for model responses, structured outputs, tool calling, embeddings, and usage metadata.

**Why ScoutAlert needs it**

We use a maintained provider SDK rather than implementing provider transport ourselves. Product modules do not import it directly; all access goes through ScoutAlert infrastructure adapters and the AI gateway.

### 4.2 Generative model candidates

**What it does**

- interprets onboarding free text;
- extracts requirements from unstructured opportunity content;
- compares confirmed experience with role responsibilities;
- interprets evidence and conflicts;
- produces grounded explanations;
- participates in bounded research workflows.

**Why ScoutAlert needs it**

Most ScoutAlert model work is focused interpretation rather than unrestricted generation. GPT-5.4 mini remains a starting evaluation candidate from the earlier proposal, not a universal production default. Select task-specific models/settings by measured extraction, matching, research, multilingual quality, latency, and cost. Pin the evaluated production model snapshot and task configuration.

The current official model documentation lists structured outputs and reasoning settings `none`, `low`, `medium`, `high`, and `xhigh`; capability support does not establish ScoutAlert task quality. [Official model documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

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

Design index types and dimensions together. OpenAI defaults are 1,536 dimensions for `text-embedding-3-small` and 3,072 for `text-embedding-3-large`; the `dimensions` parameter can shorten compatible embeddings. pgvector's HNSW `vector` indexes support up to 2,000 dimensions and `halfvec` up to 4,000. Evaluate reduced dimensions or a suitable type/index strategy before selecting a large-model default. [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings), [pgvector indexing](https://github.com/pgvector/pgvector#hnsw).

Multiple responsibility/skills/domain representations are an evaluated extension. Compare them to a compact baseline and include index resources, filtered recall, latency, and downstream evaluation cost. Changing model/representation/dimensions needs versioned re-embedding, index rollout, and rollback.

### 4.4 pgvector

**What it does**

Stores and searches embedding vectors inside PostgreSQL.

**Why ScoutAlert needs it**

It allows semantic retrieval close to our opportunity metadata, evidence, full-text search, and structured filters.

Application use cases depend on CandidateRetriever/index repository abstractions, not pgvector or database clients.

### 4.5 LangGraph.js — conditional

**What it does**

Coordinates stateful multi-step research workflows.

**When ScoutAlert may use it**

A consequential unknown may require several steps:

```text
Check existing evidence
 → search approved sources
 → fetch source
 → extract scoped evidence
 → validate
 → resolve or continue
```

Adopt it only if graph composition adds measured value to a specialized research workflow. The selected durable execution engine owns cross-step retries, timers, cancellation, and recovery. Do not introduce overlapping state authorities without explicit checkpoint and recovery contracts. ScoutAlert repositories remain authoritative for evidence and domain state.

### 4.6 Discovery and research providers

External search is a core acquisition capability as well as a research tool. The first integration work includes evaluated general web search and a distinct native X path; public/authorized LinkedIn coverage records the actual access capability. Additional general/regional search, social, feed, community, marketplace and licensed providers remain open-ended.

Keep search results, grounded-answer research, full-content fetching, streams and monitoring as separate capability contracts. A provider may implement several, but a synthesized answer with citations is not assumed to be a complete paginated result feed. Tavily and OpenAI web search remain research candidates from the earlier design; no candidate name establishes selection or current access.

Provider admission evaluates useful incremental coverage, actual account quotas, query/filter support, freshness, pagination/recovery, language/region quality, access/reuse and attribution requirements, privacy, latency and total cost. Native capabilities remain available through typed inward ports. Registry entries are configuration; new protocols need tested adapters.

The [provider adoption notes](scoutalert-discovery-architecture.md#14-provider-adoption-notes) record official-source checks: legacy Bing Search APIs are retired, Google Custom Search JSON is closed to new customers, and grounding products require a separate capability assessment. Recheck commercial/access details before implementation. Google Alerts is an optional authorized inbound signal; ScoutAlert owns standing-query scheduling and change detection.

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

## 5. Model routing and evaluation

ScoutAlert routes AI tasks through a central gateway.

| Task                                | Evaluation starting point, not a production requirement |
| ----------------------------------- | ------------------------------------------------------- |
| Straightforward extraction          | GPT-5.4 mini with none/low reasoning                    |
| Onboarding free-text interpretation | GPT-5.4 mini low                                        |
| Profile/opportunity fit             | mini low, evaluated against medium                      |
| Complex requirement interpretation  | mini medium                                             |
| Research workflow                   | mini medium                                             |
| Difficult evidence conflict         | evaluated mini high or approved stronger fallback       |
| Digest rendering                    | deterministic templates first                           |

Compare each starting point with an appropriate reference model and deterministic baseline on ScoutAlert fixtures. Promote configurations only after quality, latency, cost, privacy, and failure-path evaluation. A provider swap or ScoutAlert-owned model implements the same application contract but still needs quality and migration checks.

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

```text
PostgreSQL structured data
+ PostgreSQL full-text search
+ pgvector
+ EvidenceRepository
+ ProfileRepository
+ ScoutRepository
+ Retrieval policies
+ Task-specific evaluated model
+ Structured output validation
+ Domain validation
```

The retrieval layer creates a compact evidence package. The model interprets that package. ScoutAlert validates the result before publication.

## 7. Infrastructure ports

Business modules depend on ScoutAlert abstractions:

| Contract family                                                | Responsibility                                                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Opportunity, Evidence, Scout, MatchEvaluation repositories     | Actor/access-scoped durable business records and versioned queries/writes                                |
| Cache and document repositories                                | Scoped reusable artifacts, validity/invalidation, storage metadata                                       |
| CandidateRetriever / OpportunitySearchIndex                    | Candidate projections, filters, ranking metadata, projection versions                                    |
| EmbeddingProvider / FitEvaluator / Reranker                    | Versioned intelligence tasks with validated results                                                      |
| ResearchPlanner / WebSearchProvider / SourceFetchProvider      | Bounded evidence investigation and provider access                                                       |
| DiscoveryPlan / Lead / Observation repositories                | Durable strategies, incomplete demand, provenance, input revisions and work intents                      |
| ProviderRegistry / SourceRegistry / CrawlFrontier repositories | Capabilities, source candidates, access decisions, cursors, leases and revisit policy                    |
| Search / Stream / Feed / Monitor capability ports              | Native source behavior with explicit completeness, recovery and unsupported-operation outcomes           |
| Agent action and budget contracts                              | Versioned steps, permitted tool proposals, durable observations, reservation/reconciliation and stopping |
| EmailProvider                                                  | Provider submission/outcomes; business send policy remains in core                                       |
| ExecutionDispatcher / EventPublisher                           | Dispatch durable intents/events without leaking engine/broker SDK types                                  |

Provider-specific implementations live in infrastructure.

No application use case imports PostgreSQL/Kysely, Redis, pgvector, Temporal, BullMQ, OpenAI, LangGraph, Tavily, Resend, or another vendor SDK directly. Methods on these contracts require documentation under the engineering standards.

## 8. PostgreSQL, Kysely, and pgvector

PostgreSQL is the durable authority for product state.

Kysely is used by infrastructure repositories for typed SQL and explicit control over joins, filters, transactions, locking, indexes, and query plans.

`packages/adapters/src/database` contains migration/types/transaction plumbing; technical factories live under adapter clients. Domain-specific repository implementations live in their owning adapter feature. Core repository contracts contain no query-builder or datasource types. Mutation reads and writes use an explicitly transaction-bound repository scope.

The initial retrieval stack is:

```text
Structured SQL filtering
+ PostgreSQL full-text search
+ pgvector semantic retrieval
+ fusion
+ optional reranking
```

Retrieval quality is measured across exact/approximate search, filtered search, languages, occupations, and different query densities.

PostgreSQL full-text ranking is not a built-in BM25 guarantee. Dedicated search implementations remain behind the same candidate-index contract and require workload/migration evidence.

## 9. Durable execution, Redis, and events

Redis supports:

- short-lived caches;
- runtime coordination;
- rate/usage counters and bounded coordination.

Durable business records and reconciled budget/delivery identity stay in PostgreSQL. Cache eviction/loss must not erase a Scout or authorize a duplicate email.

Temporal is the selected primary engine for cross-step durable work and is already used locally. The expanded target execution responsibilities include:

```text
SourceSyncWorkflow
DiscoveryPlanWorkflow
DeepDiscoveryWorkflow
SourceExpansionWorkflow
OpportunityEnrichmentWorkflow
ScoutRunWorkflow
ResearchWorkflow
NotificationWorkflow
```

Workflow definitions execute configured durable ordering, waits, cancellation and retry policies. Activities receive IDs/versions and call shared core use cases through injected repositories/ports. Agent action selection occurs in bounded application steps, not nondeterministic workflow code. Source collection and expansion serve many Scouts. Use finite runs/schedules or bounded entity histories; do not assume every persistent Scout requires one permanently growing execution. The new workflow names above describe responsibilities, not existing exported definitions.

Before production expansion, demonstrate process/crash recovery, duplicate-effect protection, cancellation/superseded revisions, history continuation, replay-compatible deployment, throughput under the target workload, managed/self-hosted operations and cost. Temporal activities still require idempotency and workflow code needs safe versioning/continuation. The 1 October local implementation uses pinned SDK 1.24.0, an isolated persistent development server, finite run/schedule histories and repository-backed effect protection. Recovery, duplicate rejection, cancellation, stale revisions and replay have automated coverage; a 100-workflow synthetic smoke test completed in 3,408 ms with four activity slots. This validates local integration only. Representative discovery/model/source/database capacity, history retention, regional recovery, production operations and cost remain required gates. See [connected onboarding](../engineering/scoutalert-connected-onboarding.md). [Activities](https://docs.temporal.io/activities), [safe deployments](https://docs.temporal.io/develop/safe-deployments), [Continue-As-New](https://docs.temporal.io/workflow-execution/continue-as-new).

BullMQ is already an installed dependency. It may serve a specifically justified responsibility if the execution decision requires it; installation alone is not a reason to run both systems. If retained for durable queues, isolate persistence/non-eviction requirements from disposable cache policy. The business outbox/run/effect ledgers are engine-independent.

Start product events with a transactional outbox, idempotent consumers, progress tracking, and reconciliation. Evaluate Kafka/Redpanda for measured fan-out, durable replay/retention, ordering, and throughput requirements. Execution history is not a general product event backbone. Evaluate dedicated search and ClickHouse-class analytical storage for measured query/resource/retention requirements rather than a fixed opportunity-count threshold.

## 10. Authentication and email

Generic identity mechanics can be supplied by an established provider/library behind the ScoutAlert identity boundary.

ScoutAlert owns:

- guest-session ownership;
- guest-to-account claim;
- authorization;
- session policy;
- account/scout ownership;
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

Runs real PostgreSQL/pgvector and Redis for transaction, concurrency, outbox, and cache behavior. Add selected execution-engine recovery/replay tests and real dispatch integration; exercise BullMQ only if retained for an implemented responsibility.

### End-to-end

**Playwright**

Covers onboarding, scouts, recommendation review, guest/account transitions, settings, accessibility, responsive behavior, and recovery paths.

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

Discovery changes additionally need provider contract fixtures, live connectivity checks, unconfigured-source and social-demand cases, cursor/acknowledgement fault tests, source-policy tests and independent acquisition/relevance labels. Evaluate shared reuse and fair scheduling under declared load. The [discovery evaluation protocol](../../evaluations/discovery/README.md) separates measured results from planned work and defines cohort, cost and failure reports.

## 12. ScoutAlert-owned AI evolution

The interfaces are designed for side-by-side migration to our own technology.

```text
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
├── ProviderResearchEngine
└── ScoutAlertResearchEngine
```

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

The owning application contract remains stable while implementations evolve. Model lineage, compatible vector representations, reindexing, evaluated rollout, and rollback remain explicit work.

## 13. Target repository layout

The [canonical repository layout](../engineering/scoutalert-repository-layout.md) owns all directory decisions. Business modules live in `packages/core`; feature implementations and client plumbing live in `packages/adapters`; selected-engine definitions live in `packages/workflows`. API and worker composition roots bind them. Web uses transport contracts and server API/session modules. No alternative API-owned business tree or parallel technical package collection is required.

## 14. Related documents

- [Internet Discovery Architecture](scoutalert-discovery-architecture.md)
- [Discovery Acceptance Gates](../engineering/scoutalert-discovery-acceptance.md)
- [Delivery Roadmap](../engineering/scoutalert-delivery-roadmap.md)
- [Platform PRD](../prd/scoutalert-platform-prd.md)
- [Repository Layout](../engineering/scoutalert-repository-layout.md)
- [Platform Architecture](scoutalert-platform-architecture-v0.1.md)
- [Onboarding Architecture](scoutalert-onboarding-architecture-v0.1.md)
- [Onboarding PRD](../prd/scoutalert-onboarding-prd-v0.1.md)
- [Engineering Standards and Project Structure](../engineering/scoutalert-engineering-standards-v0.1.md)
