# ScoutAlert — Platform PRD

**Version:** 0.3

**Date:** 1 October 2026

**Status:** Agreed platform product baseline; implementation and release evidence tracked separately

**Scope:** The complete opportunity scouting lifecycle and platform operations

## 1. Product direction

ScoutAlert is a continuously operating opportunity intelligence platform with internet-wide discovery as a core capability. Each person can operate persistent personal Scouts that understand their goals, search beyond preconfigured sites, discover relevant opportunities, investigate important unknowns, evaluate suitability, monitor changes, and deliver useful recommendations.

An opportunity can begin as a company listing, a founder's social post, a recruiter announcement, a client asking for help, a community discussion, a feed item or a permitted newsletter. The product finds demand wherever supported public or authorized discovery paths can reach it and continuously expands those paths. General web search, native social discovery, focused crawling and ScoutAlert's own opportunity index are first-class capabilities.

The product must become advanced, robust, and efficient while preserving user control and evidence quality. Its continuing discovery and intelligence work is central to the product. Onboarding establishes the initial brief and is one supporting feature.

The product loop is:

**Understand → Confirm → Discover → Investigate → Evaluate → Recommend → Monitor → Notify → Pursue → Learn.**

Implementation milestones cover increasing capability, coverage, and operating scale. They do not cap the architecture or remove platform capabilities from the product direction.

## 2. People and goals

Support individuals across professions, experience levels, languages enabled by the product, and local and international markets. Search quality must account for different kinds of work and opportunities rather than assuming one profession, geography, or compensation model. International remote client projects are the first client-work coverage priority. Languages and regions expand through evaluated discovery and matching support; interface language, source language and applicant eligibility are separate concepts.

A person can maintain several independent Scouts. For example, one Scout can seek a permanent role while another seeks part-time client projects. Each has its own goal, constraints, uncertainty policy, discovery policy, and notification settings.

Separate:

- confirmed professional facts from inferred facts and aspirations;
- a reusable profile from Scout-specific preferences;
- explicit requirements from learned ranking signals;
- professional fit from geographic and engagement eligibility;
- account ownership from notification consent;
- an active Scout from any particular run or email delivery.

## 3. Opportunity categories and services

| Category                            | Required product concepts                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employment                          | Full-time, part-time, internships; responsibilities, compensation, arrangements, geography, authorization, qualifications, application stages                               |
| Contracts and service opportunities | Freelance work, gigs, client projects, service requests, relevant tenders; deliverables, scope, budget/rate, duration, availability, client requirements, engagement stages |
| Category expansion                  | Scholarships, fellowships, grants, accelerators, founder programs, and other selected opportunities; dedicated eligibility, evidence, terms, and source coverage            |

Jobs, paid contracts, and scouting demand for a person's services are core product requirements. Informal requests count even before they have a formal listing, budget or application URL. Enabled categories and source integrations are release configuration, not universal coverage claims or a permanent provider list.

The working meaning of **services** is finding suitable demand for work a person can provide. It does not establish a separate career-services marketplace, payment escrow, or service fulfillment product. If the intended services include those capabilities, define their actors, transactions, and lifecycle explicitly before implementation. Preserve this as an open product decision rather than silently treating employment rules as sufficient.

Do not force non-employment categories into job-only fields. Shared opportunity identity, provenance, retrieval, and delivery infrastructure can support category-specific terms and policies.

## 4. Platform capability requirements

| Capability                 | Required behavior                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal entry and onboarding  | Interpret ordinary language, clarify consequential gaps, review a versioned specification, preserve guest/account boundaries, activate a persistent Scout           |
| Profiles                   | Maintain confirmed background, qualifications, portfolio/document references, availability, and aspirations separately; optional imports remain reviewable          |
| Scouts                     | Multiple independent goals; create, edit, pause, resume, archive, duplicate; versioned policies, schedules, and lifecycle                                           |
| Discovery                  | Adaptive general/regional web search, native social discovery, feeds, focused crawling, permitted community/email inputs, standing queries and source expansion     |
| Discovery planning         | Versioned strategy from the confirmed brief; query families, languages, provider capabilities, coverage gaps, deadlines and budgets                                 |
| Source ecosystem           | Extensible adapters and validated source instances; access, reuse, cursors, recovery, freshness and health; no fixed provider ceiling                               |
| Opportunity knowledge      | Incomplete leads, canonical opportunities and meaningful variants; organization/author relationships; versioned source records, evidence and change history         |
| Retrieval                  | Structured, lexical, and semantic candidate retrieval; safe routing, fusion, measured reranking, multilingual and category-specific evaluation                      |
| Matching                   | Evaluate professional fit, transferable experience, eligibility, compensation/budget, arrangement, availability, evidence, and freshness separately                 |
| Research                   | Investigate consequential missing or conflicting evidence with explicit questions, authorized tools, budgets, deadlines, and stopping rules                         |
| Recommendations            | Prioritized actionable results, evidence-backed explanations, uncertainty states, current/historical assessments, saves and dismissals                              |
| Monitoring                 | Track openings, closures, term changes, deadlines, evidence corrections, and changed user requirements; selectively re-evaluate                                     |
| Notifications              | Relevant prompt alerts, digests, change alerts, and reminders; recipient-level deduplication, quiet hours, volume controls, consent and suppression                 |
| Opportunity workspace      | Saved records and private notes; application stages for employment and lead/engagement stages for client work; preserve useful history                              |
| Assistance                 | Prepare truthful, reviewable application or client-proposal material; keep external action permissions explicit and separate from scouting                          |
| Feedback                   | Explicit reasons, relevance signals, outcomes, reversible personalization, controlled exploration, evaluation/training provenance                                   |
| Integrations               | Source, identity, research, delivery, document, and user-authorized product integrations with distinct permission and health states                                 |
| Commercial operations      | Plans, entitlements, usage accounting, quotas, billing and billing reconciliation; financial provider events do not directly dictate domain rules                   |
| Administration and support | Source management, restricted troubleshooting, quality correction, run recovery, delivery investigation, access auditing                                            |
| Intelligence evolution     | Curated evaluation data, experiment/rollout controls, model lineage, provider and ScoutAlert-owned extraction, embeddings, rerankers, fit and research capabilities |

Scouts provide a persistent product experience. That does not prescribe one permanently growing workflow execution per Scout or an always-running agent team for every user. The four initial agent responsibilities are Scout Planner, Deep Discovery Agent, Evidence Research Agent and Source Expansion Agent. Extraction and fit assessment remain focused services unless a task actually requires iterative tool choice.

## 5. Discovery and coverage

### 5.1 Open-ended discovery

Support an extensible ecosystem of general and regional search, X and other native social integrations, public/authorized LinkedIn paths, recruitment systems, marketplaces, company sites, feeds, sitemaps, focused crawling, licensed data, permitted communities, newsletters and user submissions. Examples identify useful integration families; they do not define the limit of the product.

Provider capabilities must retain search filters, streams, pagination, historical recovery, entity monitoring, fetching and source-specific completeness. A newly discovered source using an existing adapter should be onboarded as validated configuration. Novel protocols require implementation and verification.

### 5.2 Adaptive and continuous search

The Scout Planner translates the approved brief into a versioned strategy. The Deep Discovery Agent executes staged searches, inspects results, follows promising context and adjusts terminology or source choices. Query portfolios include synonyms, skills, deliverables, hiring/buyer language, geography, multiple languages, domain-focused searches and long-tail discovery. Requirements remain unchanged unless the user changes them.

Run shared collection and source exploration continuously alongside personalized searches. Existing good indexed matches do not cancel external monitoring. Reserve exploration capacity and measure whether rare goals, languages, regions or source families receive meaningful discovery effort. Increasing query volume alone is not evidence of better coverage.

### 5.3 Source expansion and our own index

The shared Source Expansion Agent finds and evaluates additional domains, accounts, feeds, structured endpoints and communities. Successful admitted discoveries can become monitored source instances, improving future coverage. The focused crawler prioritizes useful pages and revisits them under source policy and bounded resource use.

Build ScoutAlert's searchable lead/opportunity/evidence index from the first discovery increment. Its growth, source relationships, terminology and feedback improve future retrieval. Separate infrastructure can be introduced when measurements justify it; an owned index is not deferred until we can build a general web search engine.

### 5.4 Informal demand and trust

Preserve incomplete opportunity leads. Distinguish requests to hire/buy services from offers selling services, commentary, spam and unrelated discussion. Retain permitted author/thread/link context and original language. Missing formal job fields cannot automatically reject an otherwise useful lead.

Keep source authenticity, claim support, availability and personal fit separate. Suspicious or unsupported content follows an explicit review/quarantine policy. A trustworthy source does not establish every requirement or make an unresolved lead eligible for a verified prompt alert.

### 5.5 Honest coverage and permission

Maintain provider and source registries with category/geography/language coverage, access and reuse policy, adapter version, refresh expectations, completeness, cursor, failure state and last successful scan. Public URL discovery, content access and permission to reuse are separate states. Private groups and inaccessible pages cannot be represented as fully covered.

Google Alerts and similar authorized inbound signals can supplement discovery; ScoutAlert owns its standing searches, schedules and change detection. Optional user connections do not authorize outgoing contact or global reuse of private material.

Before claiming an integration works, demonstrate its live supported capabilities. Distinguish no matches within a checked scope from partial scans, unsupported access, stale evidence, provider failures and exhausted budgets. There is no whole-internet completeness claim.

### 5.6 Reuse and change tracking

Collect and process shareable public content once per compatible meaningful version. Coalesce equivalent public searches and reuse still-valid evidence; personal evaluation remains private. Account scope and content rights constrain reuse. Query plans minimize personal information sent to external providers.

Retain published-at, first-seen, last-successfully-checked and closure/deadline times separately. Missing items in search results, windowed feeds or broken streams cannot establish closure. Durable progress and explicit recovery gaps prevent lost observations being presented as complete scans.

## 6. Evidence and matching quality

Important conclusions reference actual source versions and passages or structured fields. Evidence includes its scope, freshness, extraction/validation versions, conflicts, and access/reuse scope.

Professional fit does not cancel a confirmed hard conflict. Unknown does not mean eligible or ineligible. Remote does not imply worldwide availability. A client's project budget does not imply an annual salary. A learned preference cannot rewrite confirmed experience or mandatory requirements.

Retrieval must be broad enough to find useful alternatives and precise enough to control downstream cost. Evaluate false exclusions as well as weak inclusions. Final rankings are prioritization signals, not hiring or contract-win probabilities.

Research returns supported evidence, conflicts, or an explicit unresolved outcome. More model reasoning cannot manufacture absent evidence. Result limits are maxima; recommendations are not filled with weak items to meet a quota.

Research questions are individually tracked, but related questions can share one investigation and fetched evidence. Reuse respects role/entity applicability, geography, engagement terms, source version and freshness. A lead, investigated opportunity and private recommendation have separate identities and quality states.

## 7. Alerts and continuing monitoring

Discovery cadence and delivery cadence are independently configurable. Dashboard-only Scouts continue discovery.

Prompt alerts support verified exceptional new matches, with required evidence, relevance, novelty, urgency, quiet hours and frequency limits. A high ranking score or a user's tolerance for unknowns does not satisfy the prompt verification standard. Provisional leads can remain reviewable and scheduled digests follow their explicit uncertainty policy. Digests combine current recommendations across Scouts for a recipient. Change alerts and reminders use validated material changes and deadlines.

Before submission, check current opportunity and assessment state, Scout revision/lifecycle, recipient eligibility, consent, and suppression. Coordinate deduplication across Scouts and alert types while allowing deliberate re-alerting for material changes.

Delivery history distinguishes preparation, suppression, submission, ambiguous provider outcome, failure, and verified provider-reported outcomes. Provider acceptance is not proof of inbox delivery or user engagement.

## 8. Pursuing opportunities and learning

Keep employment application stages and service lead/engagement stages separate. Private notes and saved historical snapshots survive source closure according to retention policy.

Feedback references the recommendation and evaluation versions shown to the user. Explicit corrections outrank inferred behavior. Users can undo signals; inferred ranking preferences remain distinguishable from approved requirements.

Preserve controlled exploration within hard constraints. Evaluation and future training data include exposure/ranking context so that clicks and applications are not treated as unbiased relevance labels. Curated datasets require documented access, permitted use, lineage, and quality review.

## 9. Reliability and efficiency requirements

- Durable state and intended asynchronous work commit together; retries, duplicate events, and process failures are expected operating conditions.
- Revalidate revisions before publishing or sending; paused, archived, deleted, or superseded Scouts cannot publish stale results.
- Use bounded attempts, deadlines, budgets, concurrency, provider limits, and backpressure. Expensive model work operates on shortlists.
- Public extraction and indexing are reusable; private assessments are keyed by compatible inputs and versions.
- Reconciliation repairs missed dispatches and stale projections without duplicating visible effects.
- Cache loss may increase work; it must not erase Scouts, consent, recommendations, or delivery identity.
- Source or research-provider failure remains isolated from unrelated workloads, and partial results retain their coverage state.
- Durable source progress advances only with accepted work; retries cannot lose acknowledged observations or reset a logical budget.
- Search, fetch/render, extraction/indexing, matching, research, source expansion and delivery have independent capacity controls and fair scheduling.
- Agent types are distinct from execution slots and worker processes. Scale from measured demand, provider quotas, latency and cost rather than one swarm per account.
- Regional account/source ownership, failover fencing and permitted evidence distribution are explicit before claiming multi-region operation.
- Restore and recovery procedures are exercised before broad release.

## 10. Operating targets

Targets must be recorded with workload, category/source coverage, region, percentile/window, owner, and alert/response policy. The following are required measures; numeric budgets remain to be established through capacity tests and beta evidence.

| Measure                  | Required definition                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery quality        | Known-opportunity recall within a declared observable sample; demand precision, false exclusions and stage-specific failure attribution      |
| Coverage growth          | Newly validated useful sources, provider contribution/overlap, exploration yield and underserved cohort coverage                             |
| Source freshness         | Publication/change to successful observation where a reliable source timestamp exists; configured refresh and collection lag                 |
| Recommendation freshness | Observation to eligible published recommendation, including research escalation                                                              |
| Alert latency            | Eligible publication to provider submission for prompt alerts; scheduled-window adherence for digests                                        |
| Retrieval quality        | Recall@K and false exclusions across categories, languages, geography, and restrictive filters                                               |
| Recommendation quality   | Ranking usefulness, unsupported claims, hard-conflict violations, uncertainty handling, user corrections                                     |
| Research quality         | Question resolution, evidence validity, unnecessary calls, missed evidence, stopping quality                                                 |
| Reliability              | Availability, dispatch/execution/index lag, recovery time, retry and duplicate-effect rate, restore evidence                                 |
| Efficiency               | Cost per processed opportunity, active Scout period, research case, and useful recommendation; cache/research reuse and resource utilization |
| Delivery quality         | Suppression correctness, ambiguous submissions, bounces, complaints, provider-reported outcomes                                              |

Do not claim a production service level or cost target without defining the test workload and measuring it. Whole-internet recall has no known denominator; evaluate defined samples and disclose coverage gaps. Independent human judgments, source/time holdouts and cohort reports are required for quality claims. Critical consent, authorization, constraint and evidence regressions block release independently of aggregate quality scores.

## 11. Delivery milestones

The current local baseline has configured-source discovery, assessment and delivery. Its limited coverage does not satisfy the internet-discovery milestone. The [delivery roadmap](../engineering/scoutalert-delivery-roadmap.md) owns implementation status and detailed sequencing:

1. **Discovery foundation:** Lead/observation/plan contracts, source/provider capabilities, persistence, owned index and a first live web-search path.
2. **Adaptive and social discovery:** Scout planning, iterative deep discovery, native X integration and separately verified public/authorized LinkedIn paths; informal demand classification.
3. **Continuous expansion:** Shared exploration even with good existing matches, source expansion, monitoring, focused crawling, query coalescing and bundled evidence research.
4. **Measured release:** Independent discovery/relevance evaluation, failure recovery, freshness/cost measurement, cohort coverage and workload-specific capacity evidence.
5. **Continuing breadth and product growth:** Additional providers, languages, regions, communities and categories; opportunity workspace, assistance, integrations, commercial operations and owned intelligence.

These increments can overlap; no fixed provider count completes coverage permanently. The first acceptance path is a confirmed Scout discovering a relevant opportunity on a previously unconfigured public source, preserving evidence, assessing fit and delivering an eligible alert. Native social discovery, continuing exploration and recovery remain explicit gates, not optional work hidden after a job-board milestone.

## 12. Related documents and open decisions

The [platform user stories](../user-stories/scoutalert-platform-user-stories-v0.1.md) contain feature acceptance criteria. The [discovery acceptance gates](../engineering/scoutalert-discovery-acceptance.md) define cross-component pass/fail scenarios and the [evaluation protocol](../../evaluations/discovery/README.md) defines quality evidence. The [platform architecture](../architecture/scoutalert-platform-architecture-v0.1.md) and [discovery architecture](../architecture/scoutalert-discovery-architecture.md) define implementation boundaries; the [repository layout](../engineering/scoutalert-repository-layout.md) owns code locations.

Open release decisions include actual search/social provider access and reuse terms, refresh targets, services beyond client-work scouting, enabled interface/source languages, commercial plans, external action permissions, retention, regional deployment and measured operating budgets. Temporal is already integrated locally; production operations and capacity remain unverified. These decisions refine delivery without reducing the full platform scope.
