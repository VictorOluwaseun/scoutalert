# ScoutAlert — Platform Architecture

**Version:** 0.1  
**Date:** 29 September 2026  
**Status:** Proposed platform-wide technical design  
**Baseline:** Extends the onboarding PRD and onboarding architecture

## 1. Objective

ScoutAlert is a global AI-powered opportunity scouting platform. Its architecture must support high-quality discovery, evidence-backed matching, explicit uncertainty, reliable recurring execution, strong personalization, and efficient AI use.

The core loop is:

**Understand the person → Confirm the search → Discover opportunities → Normalize and index evidence → Retrieve candidates → Apply deterministic constraints → Evaluate a shortlist → Research unresolved questions → Publish recommendations → Notify → Learn from feedback.**

The platform combines conventional software, hybrid retrieval, RAG, and bounded agentic research. AI interprets and investigates. Application code remains authoritative for ownership, permissions, hard constraints, consent, persistence, scheduling, idempotency, and external side effects.

## 2. Architecture principles

1. **Clean Architecture and dependency inversion.** Domain and application layers depend on abstractions, never infrastructure implementations.
2. **Repository pattern for data access.** PostgreSQL, Redis, vector search, object storage, queues, and other data sources are accessed through repositories or ports.
3. **Evidence before conclusions.** Recommendations are traceable to current source evidence and confirmed user information.
4. **Structured state over conversation history.** Confirmed, versioned search specifications are authoritative.
5. **Retrieve broadly, reason narrowly.** Structured filters and retrieval narrow the candidate set before expensive model evaluation.
6. **Shared opportunity intelligence, private matching.** Public opportunity processing is reused where source permissions allow; user-specific evaluations stay private.
7. **Explicit uncertainty.** Missing or conflicting information stays unconfirmed or conflicting until evidence resolves it.
8. **Versioned computation.** Profile, watchlist, opportunity, evidence, retrieval, prompt, model, and policy versions drive reuse and invalidation.
9. **Idempotent background execution.** Retries and duplicate queue delivery cannot duplicate visible business effects.
10. **Provider independence.** LLM, embeddings, reranking, search, email, cache, queue, and storage providers sit behind ScoutAlert-owned ports.
11. **Observability is part of correctness.** We must explain why a recommendation appeared and what produced it.
12. **Evolution-ready boundaries.** ScoutAlert can progressively replace provider capabilities with owned models and infrastructure.

## 3. High-level topology

~~~mermaid
flowchart TB
    USER[User] --> WEB[Next.js Web App]
    WEB --> BFF[Thin Next.js BFF]
    BFF --> API[NestJS API]

    SOURCES[Approved Sources] --> INGEST[Ingestion Workers]
    INGEST --> NORMALIZE[Normalize + Extract Evidence]
    NORMALIZE --> PG[(PostgreSQL)]
    NORMALIZE --> INDEX[Full-text + Vector Index]

    API --> PG
    API --> REDIS[(Redis)]
    API --> OUTBOX[Transactional Outbox]
    OUTBOX --> QUEUE[BullMQ]

    QUEUE --> MATCH[Matching Workers]
    QUEUE --> RESEARCH[Research Workers]
    QUEUE --> NOTIFY[Notification Workers]

    MATCH --> INDEX
    MATCH --> RULES[Eligibility + Constraint Policies]
    MATCH --> AI[AI Gateway]
    MATCH --> PG

    RESEARCH --> GRAPH[LangGraph Research Workflow]
    GRAPH --> SEARCH[Approved Search/Fetch Providers]
    GRAPH --> AI
    GRAPH --> PG

    NOTIFY --> PG
    NOTIFY --> EMAIL[Email Provider]

    AI --> MINI[GPT-5.4 mini]
    AI --> EMBED[Embedding Provider]
    AI --> FALLBACK[Approved Stronger Model]

    OBS[Observability + Evaluation] --- API
    OBS --- INGEST
    OBS --- MATCH
    OBS --- RESEARCH
    OBS --- NOTIFY
~~~

Initial deployables are **web**, **api**, and **worker**. Worker workloads can later run as separately scaled processes while sharing the same domain contracts.

## 4. Core modules

| Module | Responsibility |
|---|---|
| Identity | Accounts, sessions, verification, authorization |
| Onboarding | Goal interpretation, adaptive questions, review, guest-to-account handoff |
| Profiles | Confirmed reusable experience, skills, qualifications, provenance |
| Watchlists | Search specifications, hard constraints, preferences, lifecycle |
| Sources | Connector configuration, permissions, cursors, health |
| Opportunities | Canonical opportunities, variants, source postings, status |
| Evidence | Claims, supporting passages, provenance, scope, freshness, conflicts |
| Retrieval | Structured filtering, keyword search, vector search, fusion |
| Matching | Eligibility, compensation, professional fit, publication decisions |
| Research | Bounded investigation of consequential unknowns |
| Recommendations | Durable personalized recommendations and explanations |
| Feedback | Saves, dismissals, reasons, preference signals |
| Applications | User-managed application stages and notes |
| Notifications | Consent, digest composition, schedules, delivery ledger |
| Operations | Outbox, run state, quotas, reconciliation, retention, telemetry |

Modules communicate through application ports, explicit contracts, and domain events. One module does not modify another module's persistence directly.

## 5. Opportunity ingestion and evidence

The ingestion system builds a reusable, versioned knowledge layer.

~~~text
Source due
 → Fetch according to source policy
 → Validate response completeness
 → Detect meaningful change
 → Parse structured fields
 → Extract unresolved fields from text
 → Normalize taxonomy and units
 → Resolve canonical opportunity + variant
 → Store source version + evidence
 → Update keyword/vector indexes
 → Emit opportunity.changed
~~~

Important rules:

- Prefer structured feeds where available.
- Preserve raw source identity separately from normalized opportunity identity.
- First discovery time is not the source publication date.
- A reachable posting does not automatically prove that applications remain open.
- Failed or incomplete source responses do not automatically close missing jobs.
- Deduplication preserves materially different locations, arrangements, compensation, and legal entities.
- Every important normalized claim retains provenance.
- Source corrections create new versions and invalidate dependent assessments.

An evidence claim records its type, normalized value, source version, supporting passage or structured field, scope, extraction method/version, check time, validation state, conflicts, and reuse/access scope.

General employer guidance cannot silently override a more specific role restriction. Conflicts remain explicit.

## 6. Retrieval architecture

ScoutAlert uses hybrid retrieval.

~~~text
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
~~~

Structured gates handle known constraints such as opportunity type, current status, work arrangement, explicit location restrictions, deadline, and structured credentials.

Full-text search preserves exact domain terminology. Embeddings capture semantic relationships where wording differs.

Vector similarity never determines legal eligibility, salary compliance, authorization, or other hard requirements on its own.

Candidate counts, fusion weights, index strategies, and reranking thresholds are evaluation-driven configuration.

## 7. Matching architecture

The matching engine reasons over a shortlist rather than running an LLM over every possible user/opportunity pair.

~~~text
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
~~~

Each criterion returns one of:

- **meets stated criteria**
- **does not meet**
- **unconfirmed**
- **conflicting**

Professional fit, eligibility, compensation, work arrangement, schedule compatibility, evidence quality, freshness, and unresolved questions remain separate dimensions.

A ranking score is an internal prioritization signal, not a probability of receiving an offer.

## 8. RAG architecture

ScoutAlert uses RAG to ground model interpretation in retrieved evidence.

A fit-evaluation package contains only relevant information:

~~~text
Confirmed profile evidence
+ Approved watchlist requirements
+ Relevant opportunity responsibilities
+ Mandatory opportunity clauses
+ Eligibility evidence
+ Known conflicts
+ Source references
~~~

RAG performs:

1. retrieval of relevant evidence;
2. construction of a compact evidence package;
3. structured LLM evaluation;
4. evidence-reference validation;
5. persistence of supported conclusions.

Absent evidence cannot become a confirmed fact.

## 9. Agentic research

Research is reserved for consequential unresolved questions.

~~~mermaid
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
~~~

LangGraph is an infrastructure implementation behind the ScoutAlert **ResearchEngine** port.

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

GPT-5.4 mini is the default generative model. Stronger-model escalation is based on observable task conditions and evaluation data, not model self-confidence.

## 11. Efficiency and reuse

Shared source work is reused where source permissions allow:

- fetch once per meaningful version;
- normalize once;
- extract claims once;
- embed once;
- reuse valid public employer-policy research;
- maintain canonical evidence once.

User-specific fit evaluations are private and reusable only while all relevant versions remain compatible:

~~~text
userId
profileVersion
watchlistId
searchRevision
opportunityVariantVersion
evidenceFingerprint
retrievalPolicyVersion
evaluationPolicyVersion
promptVersion
modelVersion
validUntil
~~~

Application caching can eliminate a model call. Prompt caching can reduce repeated provider input work when a model call is still needed. Batch processing can serve delay-tolerant backfills and evaluation workloads.

## 12. Incremental matching

ScoutAlert uses event-driven and scheduled triggers rather than recomputing the entire user/opportunity space after every change.

Triggers include:

- watchlist activated or changed;
- profile version changed;
- opportunity changed;
- evidence changed or revoked;
- periodic catch-up;
- explicit refresh.

A coarse candidate-subscription index can route changed opportunities to plausible watchlists using safe dimensions such as role family, category, arrangement, and broad geography. Final candidate selection still uses the retrieval engine.

Broad or uncertain searches retain catch-all routing paths.

## 13. Reliability

Durable side effects use transaction-safe patterns.

~~~text
Database transaction
 → write domain state
 → write outbox event
COMMIT
 → outbox relay
 → BullMQ
 → idempotent worker
 → durable run/effect ledger
~~~

The queue is an execution mechanism, not the source of truth.

Workers use stable logical IDs and version checks. Reconciliation detects stuck or missing dispatches.

Examples of required idempotency:

- one activated onboarding draft produces one watchlist;
- one logical source version is accepted once;
- one recommendation version is published once;
- one digest window per recipient is sent once;
- paused/superseded watchlists prevent stale queued work from publishing.

## 14. Notifications

Discovery cadence and email cadence are separate.

Dashboard-only watchlists still run discovery.

~~~text
Published recommendations
 → Group by recipient and due schedule
 → Deduplicate canonical opportunities
 → Revalidate recommendation state
 → Check consent and suppressions
 → Render digest
 → Submit through EmailProvider
 → Record provider outcome
 → Reconcile callbacks
~~~

No-results, partial scans, failed scans, suppressed emails, provider acceptance, and provider-reported delivery are different states.

## 15. Feedback and personalization

Feedback is tied to the exact recommendation/evaluation version.

Signals include saved, dismissed, dismissal reason, applied, application stage, explicit preference correction, and explicit positive feedback.

Feedback can influence watchlist-scoped ranking and preferences. It does not silently rewrite confirmed profile facts or hard constraints.

A controlled exploration allocation helps avoid overly narrow self-reinforcing personalization.

## 16. Security, privacy, and access boundaries

- Every private repository operation is actor-scoped.
- Browser-supplied identity fields are never authorization.
- User and source content are untrusted data.
- Tool permissions are server-controlled.
- Fetching enforces host/network/protocol/redirect/content-size rules.
- Queue payloads carry IDs and versions rather than full private profiles.
- Logs/traces exclude raw CVs, OTPs, full prompts, and unnecessary personal data by default.
- Shared caches never contain private personalized evaluations.
- Source access/reuse rules propagate to indexes and caches.
- Deletion and revocation propagate to private caches/checkpoints according to policy.

## 17. Observability and evaluation

For every recommendation we should be able to answer:

~~~text
Which watchlist produced it?
Which opportunity/source version was evaluated?
Which retrieval path surfaced it?
Which deterministic rules ran?
Which model/prompt/policy version evaluated fit?
Was research performed?
Which evidence supported the explanation?
Why was it published?
Why was it included in an alert?
What did the workflow cost?
~~~

Evaluation suites cover extraction, evidence support, retrieval Recall@K, ranking usefulness, eligibility errors, professional-fit assessment, uncertainty handling, multilingual cases, compensation units, stale listings, duplicates, research tool behavior, and end-to-end delivery.

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

## 19. Related documents

- [Onboarding PRD](../prd/scoutalert-onboarding-prd-v0.1.md)
- [Onboarding Architecture](scoutalert-onboarding-architecture-v0.1.md)
- [Technology and AI Stack](scoutalert-technology-stack-v0.1.md)
- [Engineering Standards and Project Structure](../engineering/scoutalert-engineering-standards-v0.1.md)
