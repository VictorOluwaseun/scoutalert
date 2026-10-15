# ScoutAlert Crawling and Deep Discovery Architecture

**Revision:** 0.3

**Date:** 15 October 2026

**Status:** Proposed detailed design and delivery plan

**Audience:** Product, engineering, and operations

ScoutAlert will own a continuously operating discovery system for jobs, client projects, and requests for services. Its crawlers will discover sources, collect permitted information, recognize opportunities, maintain evidence, and keep a searchable opportunity index current. Personal Scouts will use that shared knowledge to investigate and recommend opportunities against each user's requirements.

The ambition is broad coverage with useful depth: discover a promising source, understand how its listings work, inspect the underlying evidence, and return for changes. Efficiency comes from reusing public collection across users, choosing inexpensive retrieval methods, processing meaningful changes, and directing exploration toward gaps. Quality is measured through useful opportunities and supported recommendations, alongside total operating cost.

This design specializes the [Internet discovery architecture](scoutalert-discovery-architecture.md). The [platform PRD](../prd/scoutalert-platform-prd.md) owns product scope, the [delivery roadmap](../engineering/scoutalert-delivery-roadmap.md) owns implementation status, and the [discovery acceptance gates](../engineering/scoutalert-discovery-acceptance.md) own existing release obligations. The capabilities below are target behavior unless explicitly identified as an existing foundation.

## Reading guide

- [Product outcomes](#product-outcomes)
- [Capability commitments](#capability-commitments)
- [Discovery beyond indexed pages](#discovery-beyond-indexed-pages)
- [Existing foundations and gaps](#existing-foundations-and-gaps)
- [System architecture](#system-architecture)
- [Adaptive discovery and evidence research](#adaptive-discovery-and-evidence-research)
- [Source discovery and onboarding](#source-discovery-and-onboarding)
- [Frontier and scheduling](#frontier-and-scheduling)
- [Retrieval and browser execution](#retrieval-and-browser-execution)
- [Change detection and source freshness](#change-detection-and-source-freshness)
- [Opportunity understanding and evidence](#opportunity-understanding-and-evidence)
- [Owned search and personal matching](#owned-search-and-personal-matching)
- [Data ownership and repository boundaries](#data-ownership-and-repository-boundaries)
- [Reliable execution and recovery](#reliable-execution-and-recovery)
- [Access isolation and crawler security](#access-isolation-and-crawler-security)
- [Efficiency and cost](#efficiency-and-cost)
- [Capacity and deployment](#capacity-and-deployment)
- [Operational visibility](#operational-visibility)
- [Example discovery journeys](#example-discovery-journeys)
- [Evaluation and acceptance](#evaluation-and-acceptance)
- [Delivery phases](#delivery-phases)
- [Architecture decisions](#architecture-decisions)

## Product outcomes

The crawler system must improve five outcomes together:

1. **Coverage:** Find relevant demand across additional sources, languages, regions, and formats, including sources absent from the initial registry.
2. **Depth:** Retrieve the actual brief and its context, identify important missing facts, and follow useful evidence links.
3. **Freshness:** Discover new demand promptly and reflect edits, deadlines, withdrawals, and access changes.
4. **Usefulness:** Distinguish buyers from sellers and preserve the constraints that determine whether a user can act.
5. **Efficiency:** Reduce duplicated collection, unnecessary rendering, repeated model analysis, and low-yield exploration without silently shrinking coverage.

Jobs, projects, and services need their own evaluation cohorts. A job board success cannot establish that service discovery works. A request such as “We need a designer for our checkout redesign” can be valuable even without a formal job title, employer profile, or application form.

The system should continue discovering from supported direct sources when a general search provider is unavailable. It must disclose the resulting exploration gaps. Continuing collection also depends on its own compute, storage, and remaining budgets.

## Capability commitments

The target is autonomous opportunity discovery with an owned crawler and index. Supported source families, languages, regions, index size, and investigative depth have no permanent product ceiling imposed by the first implementation. Each new capability still requires an access path, quality evidence, and an operating allocation.

The complete system must support:

- Continuous shared discovery alongside personal investigation, including useful collection before an individual Scout subscribes to a source.
- Adaptive query generation, source selection, context following, and evidence research across multiple steps.
- Automatic admission of new source instances under implemented capabilities and declared policy.
- Native social discovery, live source events, structured interfaces, dynamic applications, attached briefs, and authorized connected sources.
- Structured, lexical, and semantic retrieval with multilingual discovery and category-specific evaluation.
- Persistent source and evidence relationships, memory of prior investigations, and learning from missed opportunities and user corrections.
- Progressive expansion of collection capacity and source protocols, with distributed operation when justified by the workload.

Initial selections of databases, queues, providers, and worker topology define the starting implementation. They must preserve extension points for the full target. The core categories remain jobs, projects, and service demand; category-specific schemas and policies must also accommodate the additional opportunity categories already identified in the platform PRD.

Resource bounds apply to an execution and its admitted allocation. A useful investigation can continue through further recorded admissions, larger workload classes, or additional source capabilities. A shallow first attempt cannot silently become the maximum depth of the product. Hard limits on access scope, privacy, confirmed user requirements, and total authorized spending remain enforceable throughout continuation.

## Discovery beyond indexed pages

“Beyond the surface web” means collecting useful information through access paths that a general search result list does not fully expose. Public visibility, search-engine indexing, technical retrievability, and permission to use content are separate properties.

| Source surface | Intended access path | Evidence and scope |
| --- | --- | --- |
| Public pages already indexed by search engines | Direct HTTP collection and adaptive search discovery | Original page, source identity, retrieval time, and relevant passages |
| Public pages with weak indexing or few incoming links | Link expansion, source directories, feeds, sitemaps, and publisher submissions | Observed discovery path and bounded coverage |
| Public searchable databases | Supported site-search forms or documented search APIs | Submitted public query, filters, pagination, and completeness |
| JavaScript applications | Structured endpoint where supported, otherwise isolated browser workers | Rendered content, observed requests, extraction coverage, and limits |
| Recruitment systems and marketplaces | Native connectors with source-specific cursors and identities | Structured listing versions and detail evidence |
| Public social discussions and communities | Permitted platform APIs, feeds, or accessible pages | Original post, author reference, context, edits, and availability |
| Live source events | Supported streams, webhooks, and change feeds | Durable event identity, source revision, replay position, and collection gaps |
| PDFs, images, and attached briefs | Bounded document extraction and evaluated OCR | Original document, page or region reference, and extraction uncertainty |
| Private communities and account portals | Explicitly connected account with scoped permission | Tenant-specific evidence and permission-aware retention |
| Newsletters and private alerts | Authorized inbound delivery or account connector | Sender/source provenance and private access scope |
| Licensed datasets and partner feeds | Contracted ingestion interface | Permitted fields, redistribution rules, freshness, and deletion handling |

Deep-web access does not imply unrestricted access. A crawler cannot infer permission from a discovered URL. Login walls, access challenges, and denied access produce recorded limitations or a supported connection flow. Specialized networks sometimes called the dark web are a separate source family and are outside the initial delivery scope; adding one would require a concrete opportunity use case and an evaluated connector.

Each source declares which actions are supported. Search and navigation capabilities do not grant permission to apply for work, bid, contact people, purchase access, or change account settings.

## Existing foundations and gaps

The repository already contains useful parts of this architecture. These foundations establish integration points; their presence does not establish production capacity or broad discovery quality.

| Area | Existing foundation | Extension required by this design |
| --- | --- | --- |
| External search | [Serper adapter](../../packages/adapters/src/discovery/connectors/serper-search.ts) and bounded discovery cases | Measured provider contribution, less redundant work, and adaptive allocation across discovery strategies |
| Public retrieval | [HTTP and document repositories](../../packages/adapters/src/discovery/connectors/public-source-documents.ts) | Broader source capabilities and production isolation |
| Dynamic pages | Bounded Chromium fallback described in [deeper source discovery](../engineering/scoutalert-deeper-source-discovery.md) | Evaluated mixed-page detection, selected interactions, and supported endpoint adapters |
| Site searches | Observed, constrained public GET forms | Additional read-only search patterns through explicit connectors |
| Structured collections | Feed, sitemap, and source-specific adapters | More source instances, protocol coverage, cursor recovery, and completeness evaluation |
| Continuous collection | [Shared monitors](../../packages/core/src/discovery/application/monitor-sources.ts) and [adaptive revisit policy](../../packages/core/src/discovery/domain/monitor-policy.ts) | Coordinated scheduling for every network destination and broader coverage planning |
| Durable execution | Temporal workflows, repository-backed budgets, leases, and dispatch | Representative load, operational recovery, deployment, and capacity evidence |
| Owned knowledge | Leads, source evidence, normalized opportunities, and private assessments | Broader retrieval evaluation, explicit invalidation, and source coverage growth |
| Connected private sources | [Recorded Gmail consent and isolated import implementation](../engineering/scoutalert-private-mail-connections.md) | Private opportunity assessment, ongoing collection, additional connectors, and live verification |

The existing browser path uses fresh public sessions and blocks several interactions, including authenticated sessions, arbitrary POST searches, frames, and cross-origin data requests. The [implementation guide](../engineering/scoutalert-deeper-source-discovery.md) also distinguishes main-document coordination from asset-host pacing within one browser bundle. Wider access and coordination across all workers are delivery work.

## System architecture

Three continuous loops cooperate: shared collection, private personal scouting, and source expansion. A strong current shortlist can satisfy a user's immediate request while shared freshness and exploration continue.

```text
Public search intent and measured coverage gaps
                      |
                      v
              Source discovery
     search providers, links, feeds, submissions
                      |
                      v
             Validated source registry
                      |
                      v
        Durable frontier and admission policy
                      |
          +-----------+-------------+
          |           |             |
          v           v             v
     API and feed    HTTP         Browser and
       workers     workers       document workers
          |           |             |
          +-----------+-------------+
                      |
                      v
          Observations and content versions
                      |
                      v
       Extraction, demand review, deduplication
                      |
                      v
          Opportunity and evidence index
                      |
                      v
       Private matching and targeted research
                      |
                      v
         Current recommendation and delivery

New sources and unresolved coverage gaps feed source discovery.
Content changes trigger reassessment and scheduled revisits.
Connected private sources use the same stages within isolated scopes.
```

The established agent roles remain Scout Planner, Deep Discovery Agent, Evidence Research Agent, and Source Expansion Agent. They choose useful actions within application policy. Routine fetching, parsing, indexing, and scheduling remain deterministic wherever practical. A model cannot modify budgets, authorize access, execute generated connector code, or publish its own conclusions directly.

| Responsibility | Owns | Output |
| --- | --- | --- |
| Source expansion | New-source hypotheses and coverage gaps | Source candidates and validation evidence |
| Admission and scheduling | Eligibility, priorities, budgets, leases, and due times | Bounded work with a recorded reason |
| Retrieval | Protocol-specific network access | Observation, content reference, usage, and completeness |
| Understanding | Extraction, demand type, context, and identity | Evidence-backed leads and opportunity versions |
| Indexing | Searchable projections and deletion propagation | Versioned, access-scoped retrieval candidates |
| Personal scouting | User-specific fit and consequential research | Private assessments and supported recommendations |
| Delivery | Current eligibility, consent, and duplicate suppression | Auditable delivery attempt |

These are logical responsibilities. Initially they can share the existing worker deployment with separate task queues and concurrency controls. Physical services separate when workload measurements justify them.

Shared collection has a platform-owned allocation and lifecycle independent of individual Scout subscriptions. Maintain separate reasons for collection: platform coverage, source exploration, and personal monitoring interest. Removing the last subscriber does not retire a source that still serves an admitted platform coverage objective. Conversely, useful indexed results do not disable personal investigation into unmet requirements.

## Adaptive discovery and evidence research

A discovery case begins with an objective and the user's unchanged requirements. The plan supplies initial queries and source hypotheses; observations determine subsequent actions. Fixed query lists are starting strategies, and simple deterministic execution remains sufficient when it resolves the objective.

```text
Goal and known evidence
        |
        v
Identify missing coverage or a consequential unknown
        |
        v
Choose a supported search, source, context, or research action
        |
        v
Observe -> extract -> test the current hypothesis
        |
        +-> sufficient evidence -> assessment
        |
        +-> useful next step -> revise plan and continue
        |
        +-> current allowance exhausted -> saved continuation
```

The action set includes query reformulation, related terminology, another source family, native-language search, source-site search, thread context, linked attachments, authoritative policy pages, and source onboarding. Decisions record the expected information gained, relevant evidence, cost class, and stop condition. Avoid repeated queries or retrievals that add no new information.

Maintain query portfolios across evaluated general, regional, and specialist search capabilities. Search can discover individual opportunities as well as new sources. Compare provider overlap and incremental yield, and shift admitted work when a source family or query strategy underperforms. Reducing duplicated paid searches must not remove a search path that contributes valuable coverage.

Track public research questions such as engagement type, deadline, buyer identity, geographic eligibility, and continued availability individually. Follow a claim to its original source when a repost or summary is insufficient. More specific and current evidence takes precedence according to claim policy; conflicting evidence remains visible. A general employer policy cannot erase a restriction on the specific opportunity.

Retain an investigation dossier containing evidence references, supported and unresolved claims, attempted approaches, contradictions, source relationships, and the next useful action. Share compatible public findings across Scouts while preserving private questions and assessments. Source changes invalidate affected conclusions rather than force every investigation to start again.

The personal plan can deepen discovery because coverage is weak even when a few good matches exist. The shared plan can explore a promising source before there is matching user demand. Neither loop requires a model call for every routine operation, and neither can relax a user's hard requirements to manufacture successful results.

## Source discovery and onboarding

### Discovering unfamiliar sources

Use several complementary discovery routes:

- Follow relevant outbound links from productive pages and source directories.
- Recognize observed feeds, sitemap advertisements, recruitment-system links, and supported platform endpoints.
- Search for buyer language, deliverables, procurement notices, and regional terminology in relevant languages.
- Allocate general, regional, and specialist search to new domains and underserved categories according to incremental coverage and the available budget.
- Accept publisher submissions, user-provided sources, and approved partner feeds.
- Consider public crawl indexes as candidate-source inputs after evaluating their age and incremental yield. Revisit live sources before making availability claims.

Maintain source relationships such as organization to careers board, portal to feed, discussion to brief, and repost to original request. PostgreSQL can represent these relationships initially. A separate graph database requires workload evidence.

A static seed list bootstraps discovery. It must not become the permanent boundary of coverage. Each expansion cycle records what was newly discovered, why it was explored, and what useful opportunities it contributed.

### Source lifecycle

```text
candidate -> validating -> enabled
                |            |
                v            v
          rejected/deferred  paused/revoked
```

Validation establishes source identity, intended audience, supported protocol, access scope, capture quality, expected yield, and permitted reuse. A sample capture must show that the proposed connector can interpret the source. An empty but valid collection can still be useful to monitor.

One connector should support many validated source instances. Adding another board to an implemented recruitment-system connector normally requires registry data. Supporting a new protocol requires implementation, contract fixtures, and operational configuration. Agent-generated suggestions remain data until reviewed through that process.

For supported capabilities, the source-admission policy should automatically enable an instance whose validation passes. Human review is reserved for exceptions defined by policy, unsupported access, or connector changes; routine source expansion must not depend on a person approving every domain. The admission receipt records which checks and policy revision justified activation.

Source performance includes useful novelty, false-positive rate, freshness, outages, render cost, and underserved demand served. New sources receive bounded trial capacity so established high-volume sources do not suppress exploration before it has evidence.

### Learning and source repair

Use extraction failures, missed known opportunities, user corrections, and independently judged outcomes to improve source routing and query strategies. Keep exposure and collection history so a lack of user clicks is not treated as proof that unshown opportunities were irrelevant. Explicit user requirements outrank inferred preferences.

When a source changes, compare observed structure, field coverage, and listing yield with its previous behavior. Try existing supported access paths before declaring it unusable. A bounded declarative extraction recipe may be proposed and tested against retained permitted samples; updates need versioned validation, a limited rollout, and rollback. New executable connector code follows the normal engineering process.

Evaluate changes on held-out sources and time periods. Retain experiment identity and training provenance, and monitor whether optimization reduces discovery for rare professions, languages, or regions. A successful strategy can become shared public memory; private content cannot become general training or source-expansion data through this mechanism.

## Frontier and scheduling

The frontier is the durable queue of pages, queries, cursors, and source checks awaiting work. It must preserve the reason for each item, not merely its URL.

### Work identity

A frontier item records source instance, capability, canonical target, public query or cursor, access scope, source/configuration revision, parent observation, depth, expected category/language, next eligible time, priority inputs, attempt history, and remaining logical budget.

Canonicalization must be source-aware. Tracking parameters can often be removed; filters, pagination, locale, and listing identifiers may change meaning. Preserve original and normalized URLs and the normalization policy version. Do not merge private and public work merely because their URLs match.

### Scheduling policy

Apply hard eligibility checks before ranking: access permission, supported capability, valid destination, due time, remaining budget, source status, and ownership. Within eligible work, prioritize using explainable factors:

- Expected novel and useful opportunities, with uncertainty retained.
- Overdue freshness and imminent deadlines.
- Coverage gaps by category, language, geography, and source family.
- Waiting age and reserved exploration allocation.
- Estimated incremental request, render, extraction, and storage cost.
- Recent failure and throttling history.

Use separate capacity allocations for monitoring, source exploration, user-triggered discovery, and consequential research. Allocate minimum service to supported underserved cohorts. Cost-based ranking alone would otherwise favor cheap, familiar sources indefinitely.

Throttle by source/provider account as well as destination host where appropriate. Every browser subrequest participates in destination controls across workers. Retries use bounded backoff and jitter; provider instructions such as retry timing inform scheduling. Rate limits remain effective across restarts and region changes.

### Crawl traps and stopping rules

Bound query variations, pagination, link depth, unique targets, bytes, browser time, and elapsed case duration. Detect repeated result sets, endless calendars, faceted-navigation explosions, redirect loops, session identifiers, and repeated empty pages. Retain a continuation only when another bounded attempt has a clear purpose.

Record whether the stop means completed scope, partial capture, exhausted budget, access limitation, unsupported capability, cancellation, or failure. Stopping a crawl never establishes that no opportunities exist elsewhere.

Persist the remaining frontier, visited targets, unresolved objective, evidence versions, and reason for continuation. A policy may admit a larger browser/document workload or another finite investigation when expected value warrants it. Recheck permissions, freshness, and cumulative cost on admission. Repeated continuations share lifetime accounting so dividing work into smaller runs cannot evade a platform or user budget.

## Retrieval and browser execution

Choose the cheapest supported method that can produce sufficient evidence. Remember successful source capabilities, but revalidate them when a site changes.

| Method | Appropriate use | Required controls |
| --- | --- | --- |
| Native API or partner feed | Structured listings and documented search | Quotas, cursor semantics, source identity, and completeness |
| RSS or Atom | Incremental discovery from known publishers | Stable item identity, edits, retention window, and detail follow-up |
| Stream, webhook, or change feed | Prompt delivery of supported source changes | Event authenticity where available, durable acceptance, ordering, replay, and reconciliation |
| Sitemap | URL discovery and revisit hints | Nested-index limits, deduplication, and subsequent content validation |
| Direct HTTP | Static pages and supported site-search results | Destination checks, robots policy, redirects, response limits, and validators |
| Browser rendering | Material content missing from supported cheaper paths | Isolated session, network policy, resource/time limits, and capture validation |
| Document extraction | Attached briefs and image-based demand | Type/size/page limits, isolated parsing, and source-linked uncertainty |
| Connected account adapter | Authorized content unavailable publicly | Credential scope, tenant isolation, revocation, and private retention |

Sitemaps help discover URLs; their change-frequency and priority fields are hints, not proof of freshness or completeness. [Sitemaps protocol](https://www.sitemaps.org/protocol.html)

Native interfaces can eliminate unnecessary rendering. For example, Greenhouse documents public GET access to its Job Board API; the application-submission endpoint is a separate capability. [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html#authentication)

### Site search and dynamic interfaces

Generate source queries from a versioned public discovery plan that preserves the user's confirmed requirements. Queries and source choices can adapt to observations without changing those requirements. Record each query revision and its rationale. Do not send a user's private profile, identity, salary preferences, or confidential text to a public form.

Extend the existing observed GET-form support through explicit adapters for selected controls, pagination widgets, and read-only search operations. A POST endpoint can be a read-only search interface, but it needs an explicit contract proving permitted parameters and effects. Do not enable arbitrary browser submissions to accommodate it.

Cross-origin data endpoints, frames, and authenticated sessions require declared source capabilities and destination policies. Preserve endpoint provenance and account scope. A publicly visible browser request alone does not establish that an endpoint is suitable for unrestricted collection.

Browser workers should reuse safe runtime infrastructure while isolating contexts and credentials between scopes. Limit scripts, network attempts, decoded bytes, memory, CPU, navigation depth, and wall time. Block irrelevant heavy resources where evidence remains complete. A successful page load does not prove that the relevant brief was captured.

### Live events and historical reconciliation

Use native streams, webhooks, and change feeds when a source supports them and the resulting freshness justifies the connection cost. Event ingestion shares the observation and evidence pipeline with polling. Authenticate events using the provider's supported mechanism, reject duplicate identities, and apply source revision or ordering rules before updating current state.

Persist accepted events and progress before acknowledging delivery where the protocol allows. Record replay positions, reconnect windows, and missing intervals. Backfill gaps through a supported history or snapshot interface; if neither exists, preserve the coverage gap. Periodic reconciliation detects missed edits and deletions even when live delivery appears healthy.

Stream connection ownership, account quotas, and downstream backlog need independent limits. Reconnecting workers must not create duplicate collectors or overwhelm analysis. A live channel can reduce discovery delay, but source delivery latency and the analysis queue still determine recommendation freshness.

## Change detection and source freshness

Persist HTTP validators by resource representation and access scope. Where supported, conditional requests using ETags or modification dates can avoid transferring unchanged content; a valid 304 response allows reuse of the corresponding stored representation. [HTTP conditional requests](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1)

Maintain separate fingerprints for captured content, extracted opportunity facts, and navigable collection membership. A link-only change can expose a new opportunity even when visible text is unchanged. A rotating banner should not trigger a new personal assessment. Reprocessing identity also includes extractor, schema, and policy versions.

Check volatile listing collections more frequently than stable organization pages. Revisit near-deadline opportunities when the result could affect delivery. Back off unchanged sources within category freshness limits, and periodically reconcile sources whose incremental mechanisms can miss updates.

Keep four times distinct: source publication time, source-reported update time, observation time, and last successful verification time. Preserve the reference time for relative deadlines. Reprocessing yesterday's “closes in two days” must not move the deadline forward.

Absence means closure only under a source contract that provides an authoritative complete membership observation for the relevant scope. Missing search results, partial feeds, failed cursors, and unavailable pages establish uncertainty. A changed document can invalidate dependent claims; an outage must not manufacture withdrawals.

## Opportunity understanding and evidence

### Extraction stages

1. Identify page type and locate the substantive content, separating listings from navigation, comments, bids, and promotional material.
2. Prefer reliable native fields and structured metadata, then targeted parsing, then model extraction for genuinely ambiguous content.
3. Classify demand: employment opening, client project, service request, seller advertisement, referral, general discussion, or unresolved signal.
4. Extract category-specific facts with original evidence references and explicit unknowns.
5. Resolve identity and variants, preserving contradictory or newer evidence.
6. Decide whether to normalize an opportunity, retain an incomplete lead, investigate further, or reject it with a reason.

The model proposes facts; validation controls acceptance. Treat source pages and attachments as untrusted data, including instructions addressed to an AI system. Extraction output cannot invoke tools or change collection policy.

### Category distinctions

| Category | Facts that matter | Common false positives |
| --- | --- | --- |
| Job | Role, employer, arrangement, geography, eligibility, compensation when stated, application route | Career advice, expired openings, recruiter marketing |
| Project | Buyer request, deliverables, scope, budget when stated, deadline, engagement and response route | Portfolio pages, completed showcases, seller bids |
| Service request | Expressed buyer need, service type, location or remote feasibility, timing, engagement | Provider directories, “hire me” posts, advertisements |

Missing budget or a formal title does not automatically invalidate a client request. Missing evidence must not become invented facts. “Remote” does not establish worldwide eligibility, and an author's location does not establish a buyer's contracting restriction.

### Multilingual discovery and early signals

Search for native terminology, local buyer phrasing, abbreviations, and category-specific concepts. Preserve original language, translated meaning, and the method used. Interface language, source language, working-language requirements, and applicant eligibility remain separate fields. Locale-aware parsing must handle dates, time zones, currencies, units, and engagement terms without inventing equivalence.

Evaluate discovery and retrieval across languages, including opportunities whose wording differs from the user's query. Combine terminology expansion with semantic retrieval and preserve original evidence for final decisions. Translation success does not establish eligibility or personal fit.

Maintain relationships among organizations, people acting in a professional role, requests, discussions, skills, locations, and source histories where permitted. Link indirect signals to investigation hypotheses. For example, a company announcing an expansion can justify checking its hiring sources; it does not itself establish a vacancy. Promote a hypothesis to an opportunity only when evidence supports actual demand, and measure the useful lead time contributed by early signals separately.

### Evidence and identity

Every consequential claim links to a document version, passage or structured field, source identity, observation time, extraction method, and applicability scope. Keep original language and any translation relationship. OCR confidence and partial capture remain visible to review and publication policy.

Deduplicate in stages: source-native identifier, source-aware canonical URL, exact content, then evaluated similarity. Distinguish a repost from a separate project with similar wording. Preserve materially different locations, budgets, deadlines, and engagement terms. Record reversible merges and invalidate affected assessments and delivery identities consistently.

Source authenticity, claim support, availability, and personal fit remain separate dimensions. A high combined score must not conceal a failed mandatory requirement. Unresolved leads can remain useful in an explicitly provisional product view without being presented as verified recommendations.

## Owned search and personal matching

Build retrieval around ScoutAlert's opportunity and evidence records. The target combines structured filtering, lexical retrieval, semantic retrieval, multilingual expansion, and measured reranking. Start with PostgreSQL filtering and full-text projections, then implement and evaluate the additional retrieval capabilities against independent labels before enabling them in production. Any dedicated search service remains a rebuildable projection behind the candidate-index contract.

Use category, concepts, engagement, geography, language, evidence freshness, and availability to retrieve plausible candidates. Preserve uncertain values so early filtering does not wrongly discard informal demand. Routing must include a fallback for broad or poorly understood goals and periodic reconciliation for missed candidates.

Combine candidate sets from complementary retrieval methods before final assessment. Version embedding models and index projections, support rebuilds, and compare new retrieval versions against the existing path. Measure discoveries lost at ingestion, normalization, retrieval, assessment, and publication separately. Improving final ranking cannot compensate for silently losing useful opportunities earlier in the pipeline.

Shared public work includes compatible fetching, extraction, demand classification, and indexing. Personal assessment remains tied to the owner's confirmed requirements and current Scout revision. Private evidence never enters the public index through a matching or deduplication shortcut.

An index hit can answer a read quickly. New Scout requirements, stale evidence, and coverage gaps can still schedule targeted research or external discovery. Shared exploration continues under its own allocation.

Before recommendation or notification, recheck source/evidence versions, Scout lifecycle, mandatory requirements, freshness, access permission, consent, and duplicate suppression. Expensive research should resolve a question likely to change that decision.

## Data ownership and repository boundaries

The following are logical records; they are not a mandate to create duplicate tables where existing records already serve the responsibility.

| Record | Essential responsibility |
| --- | --- |
| Source instance | Capability, configuration revision, access/reuse scope, health, cadence, and credential reference |
| Source candidate | Discovery provenance, coverage hypothesis, validation, and admission decision |
| Coverage objective and source interest | Independent platform exploration, shared collection, and personal monitoring reasons |
| Frontier item | Stable work identity, due time, reason, cursor/target, and continuation |
| Operation receipt | Lease/fence, reservation, attempt, outcome, usage, and reconciliation |
| Capture and observation | Original/retrieved URL, status, method, content reference, timestamps, completeness, and access scope |
| Evidence claim | Supported value, source version, applicability, uncertainty, and invalidation |
| Investigation dossier | Versioned questions, attempted approaches, evidence relationships, contradictions, and continuation |
| Lead and opportunity | Demand identity, category, normalized variants, lifecycle, and merge history |
| Private assessment | Owner and Scout revisions, candidate/evidence versions, fit, and unresolved requirements |
| Outbox and delivery receipt | Durable downstream intent, consumer progress, suppression, and delivery outcome |

Business policy and use cases belong in `packages/core/src/discovery`. Contracts there use domain types and contain no database, Redis, HTTP-client, or query-builder dependencies. Network access, persistence mapping, indexing, and cache operations belong in repository implementations under the relevant adapter feature.

Composition roots construct clients and bind contracts. Services receive repository contracts through dependency injection and do not instantiate or access data sources. NestJS owns API transport, validation, guards, and composition; Next.js presents state and handles server/client rendering deliberately. Neither host duplicates discovery policy.

PostgreSQL remains authoritative for durable state, budgets, ownership, consent, and dispatch. Redis can provide expiring caches and bounded coordination, with correctness preserved after cache loss. Content storage can move to an object-store repository when measured volume warrants it; references, versions, access rules, and lifecycle remain explicit.

Use explicit transaction participation for related writes. Keep external requests outside transactions. Retention and deletion must propagate to raw captures, text, embeddings, search projections, caches, assessments, and queued delivery as applicable. Backups need documented expiry and restore-time deletion reconciliation.

## Reliable execution and recovery

The execution model is retryable work with idempotent durable acceptance. External providers may still charge for ambiguous or repeated requests; universal exactly-once network execution is not assumed.

1. Atomically admit eligible work, reserve its budget, and establish a bounded lease with a fencing token.
2. Perform the external operation outside the transaction with the saved action identity and limits.
3. Persist its receipt and permitted capture. If content lives outside PostgreSQL, write a stable object first and reconcile orphaned objects.
4. Atomically accept domain changes, record cursor progress where appropriate, settle reservations, and create downstream outbox intent.
5. Let idempotent consumers process extraction, indexing, matching, and delivery. Periodically reconcile incomplete dispatch.

Stale workers cannot commit current ownership decisions after lease reassignment. Cursor advancement follows durable acceptance. Unsupported replay produces an explicit collection gap and bounded backfill. Logical retries inherit remaining budgets; a new allowance requires a recorded new admission.

| Failure | Required behavior |
| --- | --- |
| Worker crashes before or after capture | Reconcile the stable operation identity; preserve accepted content and account for uncertain usage |
| Search provider unavailable | Continue eligible direct collection; record reduced source-discovery coverage |
| Model provider unavailable | Continue affordable deterministic collection; bound the analysis backlog and mark delayed review |
| Database unavailable | Stop new admission and consequential effects; recover through durable receipts and reconciliation |
| Source returns throttling or access challenge | Defer or pause the source, preserve the reason, and avoid retry storms |
| Parser or page structure changes | Quarantine low-confidence output, retain evidence, and signal extraction drift |
| Permission revoked | Fence new access and publication; propagate deletion or restriction according to policy |
| Scout paused or revised | Prevent stale publication and delivery; preserve shared work still useful to other Scouts |
| Feed or stream loses history | Record the missing interval and attempt supported backfill without asserting completeness |

Temporal sequences bounded activities, retries, waits, and cancellation. Workflow history is distinct from the crawl frontier and product event records. Keep histories finite, test replay-compatible deployments, and avoid one workflow event per browser resource. Existing delivery ambiguity handling remains authoritative.

## Access isolation and crawler security

Public and connected-private collection have separate scopes throughout retrieval, cache identity, content storage, indexing, and matching. Credential references resolve only inside the authorized connector environment. Recheck permission before retrieval and publication; expired sessions must not silently fall back to another account.

Apply destination validation to redirects, DNS resolution, connections, browser subrequests, and document-linked resources. Block unintended local/private destinations and metadata services. Use infrastructure network isolation alongside application checks, with bounded decompression and sandboxed parsers/browser processes.

Use an identifiable crawler identity and source-specific request limits. The Robots Exclusion Protocol specifies crawler rules and is not access authorization. Preserve the project's current conservative crawl policy until any change has explicit design and tests; distinguish missing robots files from network failures in the recorded outcome. [Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html)

Source content cannot instruct the system to reveal credentials, broaden access, contact people, or run code. Connector capabilities constrain all model-proposed actions. Retain enough provenance for investigation while removing credentials and sensitive query content from logs.

## Efficiency and cost

### Where efficiency comes from

| Mechanism | Work avoided | Quality protection |
| --- | --- | --- |
| Shared collection | Re-fetching the same public source for each user | Private matching still evaluates each owner's requirements |
| Equivalent-query reuse | Repeated provider requests | Match query semantics, provider, locale, scope, versions, and freshness |
| Native interfaces and HTTP first | Unnecessary browser execution | Validate evidence completeness; escalate when needed |
| Conditional retrieval and fingerprints | Re-transfer and repeated extraction | Track representation, links, facts, and parser versions separately |
| Adaptive revisits | Checking quiet pages too frequently | Enforce freshness limits and periodic reconciliation |
| Staged understanding | Model calls on obvious irrelevant or structured content | Evaluate early-stage false negatives |
| Incremental routing | Reassessing every user for every change | Retain broad-goal fallback and reconciliation |
| Bounded exploration | Spending indefinitely on low-yield paths | Reserve capacity for novelty and underserved cohorts |

For example, 1,000 Scouts interested in the same public board can share one collection cycle while keeping 1,000 private matching decisions. This reduces duplicated acquisition; it does not make all subsequent work free.

If a hypothetical monitoring interval contains 100,000 documents and 5% have meaningful changes, change-aware processing could limit routine content reanalysis to about 5,000 documents, plus periodic audits and version-driven reprocessing. Those figures illustrate the mechanism and are not ScoutAlert measurements.

### Cost accounting

Track both marginal execution cost and total cost of ownership:

```text
Total period cost =
  external search and source API usage
  + fetch and browser compute
  + model and embedding usage
  + bandwidth and storage
  + database, workflow, and observability infrastructure
  + operational and connector maintenance effort

Cost per useful new opportunity =
  comparable period cost / independently judged unique useful opportunities
```

Count failures, retries, empty results, duplicate work, and deferred analysis. A zero-result period has no finite cost-per-opportunity value. Report it explicitly. Keep planned reservations, estimated usage, provider-confirmed billing, and prepaid cash purchases distinct. Allocate shared work consistently across cohorts and count it once in platform totals.

Serper's published starter package is $50 for 50,000 queries, equivalent to $1 per thousand; credits are valid for six months and taxes are additional. At that rate, avoiding 10,000 queries saves about $10 of consumed credits. Recheck package terms before a purchase. [Serper pricing, checked 15 October 2026](https://serper.dev/)

The economic test is whether avoided external and repeated processing costs exceed added collection, infrastructure, and maintenance costs while retaining useful coverage and freshness. A reduced Serper bill alone does not establish lower total cost.

### Budget enforcement

Maintain platform, provider, access-scope, source, and work-class limits. Meter network attempts and bytes inside browser bundles as well as top-level documents. Reserve before execution, account for ambiguity conservatively, release unused allowance, and reconcile provider statements where available. Admission pauses at a hard limit; background retries cannot reset it.

## Capacity and deployment

Start with the existing PostgreSQL, Temporal, and worker foundations. Separate queues and concurrency settings for API/feed collection, HTTP fetches, browsers, document extraction, model analysis, indexing, matching, and delivery. Browsers need independent resource isolation because their workload differs from lightweight HTTP requests.

Scale according to measured bottlenecks. More workers cannot overcome a source quota or a database hot spot. Use backpressure when downstream analysis or indexing falls behind; preserve urgent verification and bounded exploration allocations rather than collecting an unbounded backlog.

Before each expansion, declare source count, request mix, arrival rates, document sizes, browser share, service-time distributions, cache reuse, model latency, database load, retention, and target queue age. Estimate average in-flight work from arrival rate multiplied by average service time, then test burst recovery and tail latency under the same workload.

Use one authoritative owner per collection partition and fenced failover. Multi-region collection requires tested ownership transfer, consistent budget enforcement, residency controls, and deletion propagation. Add dedicated search, event streaming, or analytical storage only when representative measurements justify their operational cost.

## Operational visibility

Every recommendation must be traceable through source discovery, admission, capture, extraction, evidence, assessment, and delivery. Record why a source was skipped, an opportunity rejected, a case deferred, or an alert suppressed.

| Operational question | Required signals |
| --- | --- |
| Are we finding useful new demand? | Unique useful yield, buyer-request precision, source novelty, and known-opportunity recall |
| Where is coverage weak? | Category, language, region, source family, and access-path gaps |
| Is collection fresh? | Publication-to-discovery delay where known, due-work age, verification age, and missed freshness objectives |
| What is consuming money? | Search requests, HTTP attempts, bytes, browser seconds, model usage, reuse, and total cost |
| What is failing? | Access outcomes, source throttling, parser drift, incomplete captures, retries, dead letters, and ambiguous operations |
| Is recovery safe? | Lease contention, stale completion rejection, dispatch lag, cursor gaps, duplicate effects, and restore results |

Observe stage transitions so an empty recommendation list can be explained: no source coverage, failed access, missed demand, incomplete extraction, overly strict retrieval, mandatory-constraint mismatch, stale evidence, or delivery suppression. These are distinct failure modes with different remedies.

The user-facing product should describe coverage, freshness, and useful unresolved facts in plain language. Worker identifiers, provider internals, and operational debugging details belong in internal views. Follow the [monitoring and audit architecture](scoutalert-observability-and-auditing.md) for cross-platform ownership and retention.

## Example discovery journeys

### Project brief inside a searchable portal

A coverage gap points to design projects in a particular region. Exploration finds a public procurement portal. The source adapter submits a supported public query and follows the observed results. A PDF contains the scope and submission deadline. Extraction preserves the page references, recognizes the buyer request, and keeps unknown eligibility unresolved. Research resolves eligibility where possible; matching compares the brief with relevant Scouts. The portal enters monitoring only after its access path and collection semantics pass validation.

### Service request in a discussion

A permitted community source contains “We need help migrating our reporting system this month.” Context establishes that the author is requesting work. The system retains a lead despite missing budget and a formal application link. It distinguishes vendor replies from the original request, investigates only consequential missing facts, and applies the product's provisional or verified publication policy. An edit or withdrawal invalidates affected assessments.

### Employer board with limited search visibility

An organization directory links to a previously unknown careers page. The page points to a supported recruitment system. ScoutAlert validates the board as a new source instance, collects structured openings, and monitors updates directly. Discovery records retain the link path; subsequent collection does not depend on repeating the original search-engine query.

### Private opportunity available through a connected account

A user connects an eligible account and grants a defined read scope. The connector collects permitted opportunities into that account's isolated evidence space. Matching remains private. Revocation fences future collection and publication and initiates the applicable retention/deletion process. Public exploration does not inherit that account's credentials or content.

## Evaluation and acceptance

### Comparative pilot

Compare the current discovery flow with direct collection plus the owned index using the same confirmed goals and a declared evaluation period. Include jobs, client projects, and service requests separately, with regional, language, source-family, and access-path cohorts.

Run a controlled replay for repeatability and a live observation period for actual freshness and access behavior. Hold out source instances and time periods to test expansion. Keep assessors independent of model verdicts. Label known opportunities, buyer/seller distinctions, mandatory constraints, and whether a recommendation is actionable. Synthetic fixtures prove mechanics; live samples assess usefulness.

Add a capable manual-research baseline and the existing general-search-assisted flow. Declare the brief, allowed sources/accounts, research time, observation window, and cost accounting for each. Compare unique useful discoveries, time to discovery, evidence correctness, and researcher effort; report infrastructure and human time separately. This is the test for exceeding realistic human research, rather than assuming a larger query count proves it.

Measure acquisition recall over the known-opportunity sample, candidate retrieval recall at a declared shortlist size, final match precision, and recommendation usefulness separately. Track false exclusions at each transition. An apparent saving achieved by dropping difficult categories, languages, or rare goals fails the coverage objective.

Report quality at comparable cost and cost at comparable quality. Count maintenance and shared processing consistently. Include sample sizes, uncertainty, failures, and rare cohorts. Define acceptable quality changes and freshness objectives before examining pilot outcomes. There is no measurable whole-internet recall denominator.

### Required acceptance scenarios

These scenarios supplement the existing DACC gates. They are specified checks, not recorded passes.

| Scenario | Required result |
| --- | --- |
| New source absent from seed registry | Discover, validate, collect, and retain its provenance through a supported adapter |
| Supported source instance passes admission | Enable and monitor it automatically under recorded policy without a per-domain manual gate |
| No personal Scout currently subscribes | Continue collection justified by an active platform coverage objective |
| First query returns weak results | Reformulate or change the source strategy using observed evidence while preserving hard requirements |
| Useful investigation exceeds its first allowance | Resume admitted work with saved evidence and cumulative budget accounting |
| Public database with no useful indexed detail | Retrieve demand through a supported source search and verify original evidence |
| Dynamic listing with missing static content | Escalate within budget and distinguish complete from partial capture |
| Ordinary static listing | Avoid browser execution when evidence is sufficient |
| Project and service demand | Separate buyer briefs from seller profiles and bids; preserve incomplete useful leads |
| Opportunity uses another language or different terminology | Retrieve and assess it with original evidence and evaluated translation or semantic handling |
| Indirect organizational signal | Investigate without presenting inferred demand as an established opening |
| Sources disagree on eligibility or deadline | Preserve the conflict, investigate applicability, and prevent unsupported verified recommendations |
| Unchanged source followed by link-only change | Reuse unchanged work, then detect the newly linked opportunity |
| Pagination or stream interruption | Preserve accepted work, resume correctly, and disclose unrecoverable gaps |
| Duplicate or out-of-order source events | Preserve correct current state and avoid duplicate downstream effects |
| Partial feed omits an active opportunity | Preserve uncertain availability rather than infer closure |
| Two Scouts share a source | Collect once within the compatible refresh scope and assess privately |
| Identical URL under different accounts | Prevent cross-account cache, evidence, and search leakage |
| Worker crash and expired lease | Reject stale completion and avoid duplicate durable acceptance |
| Concurrent browser workers | Respect destination and provider limits across main pages and subrequests |
| Access revocation or Scout pause | Prevent stale publication and notification and propagate restrictions |
| Provider credits exhausted | Degrade visibly, preserve remaining budgets, and avoid claiming a completed empty search |
| Crawl trap or malicious document | Stop within bounds without unauthorized network access or side effects |
| Extraction change and index rebuild | Reprocess by version and preserve current evidence, ownership, and deletion state |
| Source layout drifts or a new strategy regresses | Detect the change, validate a repair, and roll back without silently corrupting opportunity facts |
| Representative load and restart | Meet declared freshness and recovery objectives with measured headroom |

Production readiness additionally requires operator runbooks for provider outage, backlog recovery, source shutdown, extraction rollback, deletion reconciliation, credential rotation, and database restore. Test the runbooks against the declared deployment.

## Delivery phases

The [phase-by-phase implementation plan](../engineering/scoutalert-crawling-implementation-plan.md) provides ordered checklist items, stable work IDs, dependencies, deliverables, and exit evidence for these six phases. It also identifies work that can overlap and existing foundations to extend.

| Phase | Deliverable | Exit evidence |
| --- | --- | --- |
| 1 Measure the current funnel | Stage-level outcomes and actual/estimated cost ledger for jobs, projects, and services | Explain empty or poor results by stage and establish a comparable baseline |
| 2 Strengthen shared collection | Independent platform collection, automatic source admission, reuse, freshness, and supported live ingestion | Fewer repeated operations with preserved quality, continued exploration, and recovery behavior |
| 3 Expand crawler reach | Adaptive investigation, new-instance discovery, broader site search, dynamic interfaces, and document briefs | Useful discoveries from held-out sources, durable continuations, and beyond-index access paths |
| 4 Improve the owned index | Multilingual lexical and semantic retrieval, evidence relationships, identity, invalidation, and change routing | Independent recall/precision evidence and lower total cost at comparable usefulness |
| 5 Extend authorized private discovery | Existing connection/import foundations extended into private assessment, ongoing collection, and additional scoped sources | Permission, isolation, retention, and useful-discovery tests |
| 6 Prove sustained scale | Representative load, distributed pacing, operational recovery, and deployment controls | Declared freshness, cost, fairness, and recovery objectives met under load |

Phases organize outcomes and dependencies; compatible increments can overlap. A valuable authorized connector need not wait for every public crawling capability or retrieval enhancement, provided its isolation and revocation prerequisites are ready. New-source exploration continues during each phase. Source families expand according to useful coverage gained, unmet demand, maintenance burden, and access feasibility.

The first implementation increment should connect cost and quality observations to the existing project/service discovery funnel, then strengthen direct collection and reuse for sources that produce actual buyer requests. This establishes whether expansion, extraction, matching, or access is the dominant constraint before adding infrastructure.

## Architecture decisions

- ScoutAlert owns its crawler system, source registry, opportunity/evidence index, and matching policies.
- Continuous platform collection, adaptive personal investigation, and automatic source expansion are first-class capabilities.
- Serper remains an optional source-discovery input while its incremental contribution is measured. Removing it is an evidence-based decision, not a prerequisite for owning discovery.
- Public collection is shared; private content and personal assessments remain access-scoped.
- Deep discovery includes structured interfaces, site search, dynamic pages, document briefs, and authorized connected sources.
- Broad reach grows through source expansion; every execution remains finite, inspectable, and budgeted.
- Durable continuation, multilingual understanding, semantic retrieval, live ingestion, and learning from outcomes extend the initial implementation without relaxing user requirements.
- Business rules remain in the framework-independent core, and all data access stays behind repository contracts.
- PostgreSQL and the existing Temporal foundation remain the initial durable infrastructure. Additional systems require measured justification.
- Recommendation quality, useful coverage, freshness, recovery, and total cost jointly determine success.
