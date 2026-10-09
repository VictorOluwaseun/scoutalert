# ScoutAlert — Platform Architecture

**Version:** 0.4

**Date:** 4 October 2026

**Status:** Agreed target architecture; local implementation and production readiness tracked separately

**Baseline:** [Platform PRD](../prd/scoutalert-platform-prd.md); onboarding is a supporting feature

**Code layout:** [Canonical repository layout](../engineering/scoutalert-repository-layout.md)

## 1. Objective

ScoutAlert is a continuously operating opportunity intelligence platform with persistent personal Scouts. Its architecture supports internet-wide opportunity discovery, employment, contracts, service requests, category expansion, evidence-backed matching, explicit uncertainty, recurring execution, personalization, opportunity management, platform operations and efficient AI use. Discovery reaches beyond registered job boards through adaptive web/social search, source expansion and focused crawling.

The core loop is:

**Understand the person → Confirm the Scout → Discover opportunities → Normalize and index evidence → Retrieve candidates → Apply deterministic constraints → Evaluate a shortlist → Research unresolved questions → Publish recommendations → Monitor changes → Notify → Pursue opportunities → Learn from feedback.**

The platform combines conventional software, hybrid retrieval, RAG and four initial agent responsibilities: Scout Planner, Deep Discovery Agent, Evidence Research Agent and Source Expansion Agent. Focused extraction and fit services are distinct from iterative agents. Application code remains authoritative for ownership, permissions, hard constraints, consent, persistence, scheduling, idempotency and external side effects.

The [discovery architecture](scoutalert-discovery-architecture.md) owns detailed plans, leads, source/provider capabilities, crawl admission, continuous exploration and agent execution contracts. This document owns their relationship to the complete platform.

## 2. Architecture principles

1. **Clean Architecture and dependency inversion.** Domain and application layers depend on abstractions, never infrastructure implementations.
2. **Repository pattern for data access.** PostgreSQL, Redis, vector search, object storage, queues, and other data sources are accessed through repositories or ports.
3. **Evidence before conclusions.** Recommendations are traceable to current source evidence and confirmed user information.
4. **Structured state over conversation history.** Confirmed, versioned search specifications are authoritative.
5. **Retrieve broadly, reason narrowly.** Structured filters and retrieval narrow the candidate set before expensive model evaluation.
6. **Shared opportunity intelligence, private matching.** Public opportunity processing is reused where source permissions allow; user-specific evaluations stay private.
7. **Explicit uncertainty.** Missing or conflicting information stays unconfirmed or conflicting until evidence resolves it.
8. **Versioned computation.** Profile, scout, opportunity, evidence, retrieval, prompt, model, and policy versions drive reuse and invalidation.
9. **Durable, idempotent execution.** Retries and duplicate dispatch are expected; logical identities, version checks, and reconciliation protect visible effects.
10. **Provider independence.** LLM, embeddings, reranking, search, email, cache, queue, and storage providers sit behind ScoutAlert-owned ports.
11. **Observability is part of correctness.** We must explain why a recommendation appeared and what produced it.
12. **Evolution-ready boundaries.** ScoutAlert can progressively replace provider capabilities with owned models and infrastructure.
13. **External exploration continues.** Good indexed matches do not stop shared discovery of new opportunities and sources; exploration has an explicit capacity allocation.
14. **Capabilities stay expressive.** Search, streaming, crawling, monitoring and research preserve native semantics behind inward contracts rather than a lossy universal wrapper.
15. **Leads precede complete listings.** Informal requests retain unknown fields, provenance and investigation state without fabricated job attributes.
16. **Measured global operation.** Cohort coverage, quota limits, queue delay, cost and recovery evidence govern scaling; agent counts alone are not capacity claims.

## 3. High-level topology

```mermaid
flowchart TB
    USER[User] --> WEB[Next.js Web App]
    WEB --> SERVER[Next.js Server Routes]
    SERVER --> API[NestJS API Host]
    API --> CORE[Shared Core Use Cases and Policies]
    WORKER[Worker Activities] --> CORE
    CORE --> PORTS[Inward Repository and Capability Contracts]
    PORTS --> ADAPTERS[Feature Repositories and Provider Adapters]
    ADAPTERS --> PG[(PostgreSQL Business Records and Outbox)]
    ADAPTERS --> REDIS[(Scoped Cache and Runtime State)]
    ADAPTERS --> INDEX[Keyword and Vector Projections]
    ADAPTERS --> SOURCES[Web and Social Search, Streams, Feeds, Crawl and Research]
    SOURCES --> LEADS[Admitted Leads and Versioned Evidence]
    LEADS --> INDEX
    LEADS --> REGISTRY[Source Candidates and Monitoring Registry]
    REGISTRY --> SOURCES
    ADAPTERS --> AI[Model and Embedding Providers]
    ADAPTERS --> EMAIL[Email Provider]
    PG --> RELAY[Outbox Relay and Reconciliation]
    RELAY --> EXEC[Temporal Durable Execution]
    EXEC --> WORKER
    OBS[Observability + Evaluation] --- API
    OBS --- WORKER
    OBS --- ADAPTERS
```

Initial product hosts are **web**, **api**, and **worker**, alongside the existing documentation application. Worker roles can run as separately scaled processes/pools while sharing core contracts. Temporal is the selected durable execution foundation and is integrated locally. Production deployment, capacity, regional recovery and operating costs still require the stack document's adoption evidence. The broader discovery components shown here are target capabilities.

The diagram shows runtime responsibilities, not permission for use cases to import clients. Framework-independent business modules live in `packages/core`; repositories and provider implementations live in `packages/adapters`. Existing workflow definitions live in `packages/workflows`. Composition roots in apps construct and bind dependencies. Source results return through validation and transactional repositories before they update durable records or projections.

## 4. Core modules

| Module          | Responsibility                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Identity        | Accounts, sessions, verification, authorization                                                                           |
| Onboarding      | Goal interpretation, adaptive questions, review, guest-to-account handoff                                                 |
| Profiles        | Confirmed reusable experience, skills, qualifications, provenance                                                         |
| Scouts          | Persistent goals, approved search specifications, policies, revisions, lifecycle                                          |
| Discovery       | Versioned plans, query portfolios, iterative cases, coverage observations and leads                                       |
| Sources         | Provider capabilities, source candidates, access/reuse policy, source expansion, monitoring, frontier, cursors and health |
| Opportunities   | Canonical opportunities, variants, source postings, links from incomplete leads and status                                |
| Evidence        | Claims, supporting passages, provenance, scope, freshness, conflicts                                                      |
| Retrieval       | Structured filtering, keyword search, vector search, fusion                                                               |
| Matching        | Eligibility, compensation, professional fit, publication decisions                                                        |
| Research        | Bounded investigation of consequential unknowns                                                                           |
| Recommendations | Durable personalized recommendations and explanations                                                                     |
| Feedback        | Saves, dismissals, reasons, preference signals                                                                            |
| Applications    | Employment application stages, saved snapshots, private notes, assistance requests                                        |
| Engagements     | Service/client leads, deliverables, budgets, engagement stages, private notes                                             |
| Notifications   | Consent, prompt/digest/change/reminder policy, schedules, grouping, delivery ledger                                       |
| Integrations    | User/provider connections, permissions, lifecycle, health                                                                 |
| Entitlements    | Plan capabilities, usage limits, reservations, feature availability                                                       |
| Billing         | Subscription/payment-provider event interpretation and reconciliation                                                     |
| Operations      | Outbox, run state, quotas, reconciliation, retention, telemetry                                                           |

Modules communicate through application ports, explicit contracts, and domain events. One module does not modify another module's persistence directly.

A Scout references the relevant confirmed profile and approved specification/policy revisions. Runs, research cases, recommendations, applications, engagements, and deliveries are separate aggregates or records. Learned preferences cannot mutate confirmed facts or mandatory constraints. Category-specific opportunity terms distinguish employment, client work, and future categories.

## 5. Opportunity ingestion and evidence

### 5.1 Discovery before ingestion

Shared discovery continuously monitors known sources and explores additional sources. Personal discovery adapts a confirmed Scout's plan to its goals and coverage gaps. Both contribute permitted observations and leads to the same evidence system. A successful index read does not disable shared external exploration.

General/regional search, native social APIs, feeds, streams, focused crawling, authorized communities/newsletters, licensed data and user submissions have explicit capability contracts. Source instances can be registered under existing adapters without changing matching code. The registry tracks configuration, access scope, completeness and actual enabled capabilities. LinkedIn URL discovery and content access, for example, remain separate states.

Opportunity leads preserve incomplete social requests and distinguish buyers from providers advertising services. They can progress through investigation before becoming normalized opportunities; company, price and application URL are not universal admission requirements. Source/author authenticity, availability, evidence support and personal suitability are separate assessments.

### 5.2 Accepted content and evidence

The ingestion system builds a reusable, versioned knowledge layer. Source policy and network admission occur before fetching, including redirect checks.

```text
Source due or discovery observation admitted
 → Fetch according to source policy
 → Validate response completeness
 → Detect meaningful change
 → Preserve lead and classify demand
 → Parse available category-specific fields
 → Extract unresolved fields from text
 → Normalize taxonomy and units
 → Resolve canonical opportunity + variant
 → Store source version + evidence
 → Update keyword/vector indexes
 → Emit opportunity.changed
```

Important rules:

- Prefer structured feeds where available.
- Preserve raw source identity separately from normalized opportunity identity.
- First discovery time is not the source publication date.
- A reachable posting does not automatically prove that applications remain open.
- Failed or incomplete source responses do not automatically close missing jobs.
- Deduplication preserves materially different locations, arrangements, compensation, and legal entities.
- Every important normalized claim retains provenance.
- Source corrections create new versions and invalidate dependent assessments.
- Source refresh is independent of personal Scout runs; one accepted public version can serve many Scouts.
- Source configuration records coverage, cadence, completeness, cursor, connector version, access/reuse policy, and operational health.
- Refresh policy can adapt to observed change rate, known deadlines, relevant Scout demand, source health, and available capacity within source access/rate limits and configured freshness bounds. Shared source synchronization remains separate from individual Scout execution.
- Client/service opportunities preserve project scope, deliverables, budget basis, duration, and engagement terms rather than mapping them into job salary fields.
- Durable accepted observations and downstream intents commit before cursor/stream acknowledgement; replay duplicates safely and record unrecoverable gaps.
- Search result disappearance and windowed-feed absence cannot establish closure.
- Source edits, deletion and access revocation propagate to affected evidence, projections and current assessments under explicit retention rules.
- Preserve original language and supporting passages; translated text records method/version and cannot replace the source's authority.
- Newly discovered source candidates pass capability and access checks before monitoring; unsupported protocols remain explicit candidates.

An evidence claim records its type, normalized value, source version, supporting passage or structured field, scope, extraction method/version, check time, validation state, conflicts, and reuse/access scope.

General employer guidance cannot silently override a more specific role restriction. Conflicts remain explicit.

## 6. Retrieval architecture

ScoutAlert uses hybrid retrieval.

This is retrieval from our acquired corpus, distinct from external discovery that expands that corpus. Our owned index begins with the first web-discovery increment and grows with admitted leads, opportunities, evidence and source relationships. A logical opportunity/evidence graph does not require a separate graph database. Private and permission-scoped content remains access-scoped in projections.

```text
SearchSpecification
   ↓
Structured candidate gates
   ↓
Keyword retrieval + Semantic/vector retrieval
   ↓
Fusion
   ↓
Optional reranking
   ↓
Candidate shortlist
```

Structured gates handle known constraints such as opportunity type, current status, work arrangement, explicit location restrictions, deadline, and structured credentials.

Full-text search preserves exact domain terminology. Embeddings capture semantic relationships where wording differs.

PostgreSQL full-text search uses its native ranking functions initially; BM25 is a separate implementation choice. Evaluate query decomposition, multiple responsibility/skill/domain representations, fusion, and reranking against the simpler baseline. More representations are justified by measured recall and total downstream cost, not assumed improvement.

Vector similarity never determines legal eligibility, salary compliance, authorization, or other hard requirements on its own.

Candidate counts, fusion weights, index strategies, and reranking thresholds are evaluation-driven configuration.

Unknown structured fields retain a candidate path according to the Scout's uncertainty policy. Benchmark filtered approximate retrieval against an exact/reference path to detect false exclusions. Search is an independently rebuildable projection behind a search-index port, not the durable authority for current opportunity status or eligibility.

## 7. Matching architecture

The matching engine reasons over a shortlist rather than running an LLM over every possible user/opportunity pair.

```text
Candidate
 → Validate current opportunity version
 → Apply known hard-constraint policies
 → Assess eligibility criteria
 → Assess financial compatibility
 → Evaluate professional fit from relevant evidence
 → Identify consequential unknowns
 → Research when justified
 → Re-evaluate
 → Apply publication policy
 → Persist recommendation
```

Each criterion returns one of:

- **meets stated criteria**
- **does not meet**
- **unconfirmed**
- **conflicting**

Professional fit, eligibility, compensation, work arrangement, schedule compatibility, evidence quality, freshness, and unresolved questions remain separate dimensions.

A ranking score is an internal prioritization signal, not a probability of receiving an offer.

Model/research work runs outside persistence transactions against captured input versions. The publication transaction compares the captured Scout, profile, opportunity, and relevant evidence/policy versions with current state through locked reads or conditional writes. Obsolete evaluations can remain historical but cannot become current recommendations. Apply the same current-state gate before preparing/submitting alerts.

## 8. RAG architecture

ScoutAlert uses RAG to ground model interpretation in retrieved evidence.

A fit-evaluation package contains only relevant information:

```text
Confirmed profile evidence
+ Approved scout requirements
+ Relevant opportunity responsibilities
+ Mandatory opportunity clauses
+ Eligibility evidence
+ Known conflicts
+ Source references
```

RAG performs:

1. retrieval of relevant evidence;
2. construction of a compact evidence package;
3. structured LLM evaluation;
4. evidence-reference validation;
5. persistence of supported conclusions.

Absent evidence cannot become a confirmed fact.

## 9. Agents and evidence research

The four initial agent roles have separate triggers, contracts and evaluation:

| Role                    | Responsibility and output                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Scout Planner           | Reusable versioned strategy from confirmed intent, coverage gaps, provider capabilities and observed results |
| Deep Discovery Agent    | Iterative search, context following and reformulation; evidence-linked leads and source candidates           |
| Evidence Research Agent | Consequential question investigation; scoped evidence and supported/conflicting/unresolved outcomes          |
| Source Expansion Agent  | Shared discovery/validation of additional sources and monitoring proposals                                   |

Agents choose permitted actions from observations. Extraction, embeddings, classification and private fit remain focused services when one bounded evaluation suffices. Temporal executes durable sequencing and recovery; deterministic application policies own authority and budget admission. Four roles do not prescribe four workers, four per-user agents or an immutable role ceiling.

Every case captures input revisions, access class, objective/questions, allowed tools, budget reservations, deadline, actions, observations and terminal/continuation state. Resume cannot reset a logical allowance. The [discovery specification](scoutalert-discovery-architecture.md) defines planner and source-expansion behavior.

Evidence research is reserved for consequential unresolved questions. Related questions can share one case and public document fetch while preserving separate answers, applicability and freshness. Existing employer-policy research is a narrower local implementation of this target responsibility.

```mermaid
flowchart LR
    Q[Unresolved Question] --> E[Check Existing Evidence]
    E --> P[Research Policy + Budget]
    P --> S[Search Approved Sources]
    S --> F[Fetch Approved Source]
    F --> X[Extract Scoped Evidence]
    X --> V[Validate Evidence]
    V --> D{Resolved?}
    D -->|No + budget| P
    D -->|Yes| R[Evidence Proposal]
    D -->|No budget| U[Unconfirmed]
    R --> EVAL[Deterministic Re-evaluation]
```

The research planner, search/fetch, extraction, validation, and stopping policy have explicit inward contracts. Durable multi-step execution uses the selected workflow engine. Model/tool calls execute in activities through use cases and adapters; workflow definitions do not call raw providers.

LangGraph is conditional for specialized graph-based research if it improves the workflow. It is not a mandatory dependency or a second owner of durable business/execution state. Any checkpoint authority, boundaries, and migration/recovery behavior must be defined before adoption.

Research returns evidence or an explicit unresolved result. It cannot authorize accounts, change consent, rewrite confirmed profile facts, submit applications, bypass source policy, or directly publish recommendations.

## 10. AI gateway

All model calls pass through the ScoutAlert AI gateway.

The gateway owns:

- task identity;
- provider and model routing;
- prompt/schema version;
- structured-output validation;
- reasoning effort;
- deadlines;
- token/output ceilings;
- attempt limits;
- cost reservation and reconciliation;
- privacy class;
- observability metadata.

Business modules depend on ScoutAlert interfaces such as **FitEvaluator**, **EmbeddingProvider**, **ResearchEngine**, and **Reranker**. Provider implementations remain in infrastructure.

GPT-5.4 mini remains an evaluation candidate from the earlier stack proposal. Production task profiles select provider/model snapshots, prompts, schemas, reasoning settings, budgets, and fallback policy from ScoutAlert evaluation results. Stronger-model escalation follows observable task conditions, not model self-confidence. The provider boundary supports ScoutAlert-owned models without assuming equivalent quality or zero migration work.

## 11. Efficiency and reuse

Shared source work is reused where source permissions allow:

- reuse compatible plans until their inputs or effectiveness change;
- coalesce equivalent public searches by provider, query semantics, region, language, access class and freshness window;
- fetch once per meaningful version;
- normalize once;
- extract claims once;
- embed once;
- reuse valid public employer-policy research;
- maintain canonical evidence once.

User-specific fit evaluations are private and reusable only while all relevant versions remain compatible:

```text
userId
profileVersion
scoutId
searchRevision
opportunityVariantVersion
evidenceFingerprint
retrievalPolicyVersion
evaluationPolicyVersion
promptVersion
modelVersion
validUntil
```

Application caching can eliminate a model call. Prompt caching can reduce repeated provider input work when a model call is still needed. Batch processing can serve delay-tolerant backfills and evaluation workloads.

Prevent cache stampedes with bounded leases and durable completion identity. Private briefs and restricted source content cannot enter globally shared query/evidence caches. Optimize marginal useful discovery and total downstream cost while reserving exploration for new sources and underserved cohorts; historical yield alone must not concentrate all capacity on already-popular sources.

## 12. Incremental matching

ScoutAlert uses event-driven and scheduled triggers rather than recomputing the entire user/opportunity space after every change.

Triggers include:

- scout activated or changed;
- profile version changed;
- opportunity changed;
- evidence changed or revoked;
- periodic catch-up;
- explicit refresh.

A coarse candidate-subscription index can route changed opportunities to plausible scouts using safe dimensions such as role family, category, arrangement, and broad geography. Final candidate selection still uses the retrieval engine.

Broad or uncertain searches retain catch-all routing paths.

## 13. Reliability

Durable side effects use transaction-safe patterns.

```text
Database transaction
 → write domain state
 → write outbox event
COMMIT
 → outbox relay
 → durable execution adapter
 → workflow / idempotent activity
 → durable run/effect ledger
```

PostgreSQL owns business records and durable intents. The execution engine owns dispatch/retry/timer progress. Search owns a rebuildable projection; Redis owns disposable cache and bounded runtime coordination. None replaces current business ownership, consent, or revisions.

Workers use stable logical IDs and version checks. Reconciliation detects stuck or missing dispatches.

Examples of required idempotency:

- one activated onboarding draft produces one scout;
- one logical source version is accepted once;
- one recommendation version is published once;
- one logical recipient/channel delivery identity is prepared once, with ambiguous submission reconciled before retry;
- paused/superseded scouts prevent stale queued work from publishing.

Mutation reads and all participating repositories use one transaction-bound scope with a lock or expected-version check. Persist state, stable idempotency result, and outbox intent atomically. External provider calls occur after commit.

The relay can crash after dispatch and before recording acknowledgment. Dispatch and consumption therefore use durable event/run identities, not only provider job IDs. Consumers persist processed-event identity with their business effects where possible. Events carry schema version, aggregate/version, occurrence time, correlation, and minimal IDs. Define ordering per aggregate, tolerate duplicates/out-of-order events, and reconcile missed changes.

Source synchronization, enrichment/indexing, Scout matching, research, and notification preparation are distinct work units. A persistent Scout can use finite runs and schedules or a deliberately bounded entity workflow. Long histories need rollover; LLM/fetch/email activities need retry-safe identities and deadlines. Workflow changes require compatible deployment and replay testing. [Temporal continuation](https://docs.temporal.io/workflow-execution/continue-as-new), [safe deployments](https://docs.temporal.io/develop/safe-deployments), [activity idempotency](https://docs.temporal.io/activities).

## 14. Notifications

Discovery cadence and email cadence are separate.

Dashboard-only scouts still run discovery.

Delivery supports prompt alerts for verified exceptional new matches, scheduled digests, material-change alerts and deadline reminders. Prompt eligibility requires supported required criteria as well as relevance; unknown tolerance for review/digests does not waive verification. Policy controls urgency, novelty, quiet hours, user/plan volume limits and re-alerting. Grouping coordinates all active Scouts for the same recipient.

```text
Published recommendations
 → Group by recipient and due schedule
 → Deduplicate canonical opportunities
 → Revalidate recommendation state
 → Check consent and suppressions
 → Apply freshness, novelty, urgency, quiet-hour, and volume policy
 → Persist a logical delivery and included item/Scout references
 → Render message
 → Submit through EmailProvider
 → Record provider outcome
 → Reconcile callbacks
```

No-results, partial scans, failed scans, suppressed emails, provider acceptance, and provider-reported delivery are different states.

Use a durable delivery identity such as `UNIQUE(recipient_id, channel, logical_delivery_key)`. A digest key identifies the recipient's logical schedule window across Scouts; an alert key identifies its reason and opportunity/material-change identity. Included items record canonical/variant identity, assessment version, alert reason, and contributing Scouts. Item-level suppression coordinates immediate alerts and later digests.

The delivery record retains recipient/channel, delivery kind, logical window and timezone where applicable, notification-policy version, recommendation items, Scout contributions, status, stable provider-request identity, and provider message/outcome references. Record the consent and eligibility decision versions used at submission for audit. Those historical snapshots never replace a current consent, suppression, or eligibility check before a new submission attempt.

Schedule or policy edits must not invent another send for an already accepted logical window. Recompose prepared deliveries and revalidate included items before submission. Verify/deduplicate provider callbacks. Use provider idempotency where available; an uncertain response remains ambiguous until reconciliation can establish acceptance or a safe retry. There is no universal exactly-once guarantee across a database and external email provider.

## 15. Feedback and personalization

Feedback is tied to the exact recommendation/evaluation version.

Signals include saved, dismissed, dismissal reason, applied, application stage, explicit preference correction, and explicit positive feedback.

Feedback can influence scout-scoped ranking and preferences. It does not silently rewrite confirmed profile facts or hard constraints.

A controlled exploration allocation helps avoid overly narrow self-reinforcing personalization.

Record impressions/rank positions and policy versions alongside feedback, including the user's exposure context. Clicks and applications are not automatically unbiased training labels. Curated evaluation/training data needs documented lineage, access, permitted use, and quality review.

## 16. Security, privacy, and access boundaries

- Every private repository operation is actor-scoped.
- Browser-supplied identity fields are never authorization.
- User and source content are untrusted data.
- Tool permissions are server-controlled.
- Fetching enforces host/network/protocol/redirect/content-size rules.
- Execution payloads carry IDs and versions rather than full private profiles.
- Logs/traces exclude raw CVs, OTPs, full prompts, and unnecessary personal data by default.
- Public/shared-reuse caches never contain private personalized evaluations; private cache repositories enforce actor scope and compatible input versions.
- Source access/reuse rules propagate to indexes and caches.
- Deletion and revocation propagate to private caches/checkpoints according to policy.

## 17. Observability and evaluation

The [monitoring and audit architecture](scoutalert-observability-and-auditing.md) defines the full platform coverage contract, operational stack, transactional audit journal, decision/evidence history, shared/private attribution, usage accounting, protected exports and operations console. Every consequential operation retains its identity, outcome or unresolved state, and reason, including work deferred or rejected. Technical completion and product success are measured separately.

The [monitoring and audit acceptance gates](../engineering/scoutalert-observability-acceptance.md) own OACC-001–024 and the evidence required for implementation and production readiness. These are target obligations; existing business receipts and local workflow tests do not establish complete audit coverage.

For every recommendation we should be able to answer:

```text
Which scout produced it?
Which opportunity/source version was evaluated?
Which retrieval path surfaced it?
Which deterministic rules ran?
Which model/prompt/policy version evaluated fit?
Was research performed?
Which evidence supported the explanation?
Why was it published?
Why was it included in an alert?
What did the workflow cost?
```

Evaluation suites cover extraction, evidence support, retrieval Recall@K, ranking usefulness, eligibility errors, professional-fit assessment, uncertainty handling, multilingual cases, compensation units, stale listings, duplicates, research tool behavior, and end-to-end delivery.

Discovery evaluation additionally measures known-opportunity acquisition recall, demand-versus-offer errors, useful new sources, provider overlap/contribution, query productivity, exploration allocation and lost observations. Hold out sources and time windows; obtain independent relevance labels. Keep discovery, extraction, retrieval and assessment failures separate. The [evaluation protocol](../../evaluations/discovery/README.md) defines report and sample requirements.

Track false exclusions and category/geography/language cohorts as well as aggregate usefulness. Measure source-to-observation, observation-to-recommendation, eligible-recommendation-to-submission, index/dispatch lag, research escalation, cost per useful recommendation, and recovery behavior. Targets require a declared workload and owner; they are not measured achievements.

## 18. Evolution path

ScoutAlert's provider boundaries are designed to let us progressively own more of the intelligence and infrastructure layer.

Potential ScoutAlert-owned implementations include:

- domain-specific embedding models;
- proprietary rerankers;
- opportunity and eligibility classifiers;
- professional-fit models;
- source extraction models;
- fine-tuned/domain-adapted language models;
- specialized research agents;
- dedicated retrieval/index services;
- dedicated event and data infrastructure.

Each transition is benchmarked with the same ScoutAlert evaluation suites and can coexist with external providers during migration.

Replacing embeddings requires compatible representation/model/dimension metadata, re-embedding/reindexing, evaluated query/index rollout, and rollback. Stable ports do not eliminate semantic or data migration. Provider/model candidates can be compared in shadow operation before changing current recommendations.

## 19. Opportunity workspace and commercial capabilities

Saved opportunities retain source/evaluation snapshots and private notes as listings evolve. Applications own employment stages; engagements own client/service lead stages, project requirements, and proposed work. Assistance creates reviewable truthful drafts using confirmed profile facts and evidence; outbound actions have separate explicit product permissions.

Integrations own connection permissions, health, expiry, and revocation. Entitlements own usable product capabilities and limits; billing adapters translate provider events to idempotent application commands. Budget/usage reservations apply across workflow retries and independent worker pools, and are reconciled with actual provider usage.

Restricted operations/support queries expose traceable source, run, assessment, and delivery states. Corrections create new evidence/policy versions and trigger selective invalidation rather than overwriting historical conclusions.

## 20. Capacity and infrastructure adoption

Scale search I/O, collection/streams, fetch/render, extraction/indexing, matching, research, source expansion and delivery independently through worker roles/task queues. Apply source/provider request and token quotas, host limits, fair account scheduling, deadline priorities, bounded backlog and backpressure. Reserve exploration capacity. Prevent slow research or a noisy source from blocking eligible alerts.

Capacity plans declare arrival rates, task/service-time distributions, overlap/cache rates, quota envelope, database/index load, queue-delay targets and headroom. Average concurrency estimates are a starting point; bursts, tail latency and provider limits require measurements. No illustrative agent or worker count establishes global capacity.

Private accounts have a designated home region and failover owner. Source collection uses explicit regional ownership/leases; permitted public evidence can be distributed without duplicating acquisition. Residency, replication lag, ownership fencing, recovery and deletion propagation are validated before multi-region release. Separate control/business records, workflow history, event replay and search projections retain their own authority.

An outbox with consumer progress/reconciliation can support initial asynchronous events. Introduce Kafka/Redpanda only when consumer fan-out, retention/replay, throughput, ordering, and operating requirements justify a durable event backbone. Temporal execution history is not the product event bus or analytics store.

Benchmark dedicated search when filtered recall, latency, query concurrency, projection freshness, or resource isolation demands it. Row count alone is not an adoption threshold. Benchmark analytical storage when historical/event queries materially interfere with transactional workloads or require different retention/query characteristics. Each adoption needs workload evidence, migration, recovery, operating cost, and rollback criteria.

## 21. Implementation and release gates

The existing configured-source loop is a local foundation. The next milestone is confirmed intent → adaptive external discovery on an unconfigured public source → admitted lead/evidence → current assessment/research → durable recommendation → eligible alert → feedback and recurring monitoring. Native social discovery and source expansion are explicit work, not implied by a connector interface.

Release checks include duplicate/out-of-order events, transaction rollback, process loss after commit/dispatch, stale Scout/profile/evidence revisions, source partial responses, cache loss, workflow recovery, ambiguous email outcomes, opt-out during waiting, and restore/reconciliation. Source coverage, enabled categories, target workloads, and measured budgets must be explicit.

The [discovery acceptance criteria](../engineering/scoutalert-discovery-acceptance.md) map these requirements to DACC scenarios, evidence and completion gates. The [delivery roadmap](../engineering/scoutalert-delivery-roadmap.md) distinguishes existing implementation, planned increments and production validation. Missing provider access or independent labels leave their gates open; a documentation update cannot satisfy them.

## 22. Related documents

- [Monitoring and Audit Architecture](scoutalert-observability-and-auditing.md)
- [Monitoring and Audit Acceptance Gates](../engineering/scoutalert-observability-acceptance.md)
- [Internet Discovery Architecture](scoutalert-discovery-architecture.md)
- [Discovery Acceptance and Release Gates](../engineering/scoutalert-discovery-acceptance.md)
- [Delivery Roadmap](../engineering/scoutalert-delivery-roadmap.md)
- [Platform PRD](../prd/scoutalert-platform-prd.md)
- [Repository Layout](../engineering/scoutalert-repository-layout.md)
- [Platform User Stories](../user-stories/scoutalert-platform-user-stories-v0.1.md)
- [Onboarding PRD](../prd/scoutalert-onboarding-prd-v0.1.md)
- [Onboarding Architecture](scoutalert-onboarding-architecture-v0.1.md)
- [Technology and AI Stack](scoutalert-technology-stack-v0.1.md)
- [Engineering Standards and Project Structure](../engineering/scoutalert-engineering-standards-v0.1.md)
