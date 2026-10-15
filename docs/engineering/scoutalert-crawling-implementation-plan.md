# ScoutAlert Crawling and Deep Discovery Implementation Plan

**Revision:** 0.1

**Date:** 15 October 2026

**Status:** Planned implementation and verification work

Build ScoutAlert's owned crawler, source-expansion system, opportunity index, and adaptive investigation capability in six phases. Each phase produces an integrated capability with evidence of usefulness, cost, and recovery. Jobs, client projects, and service requests remain separate evaluation cohorts throughout.

This plan turns the [crawling and deep discovery architecture](../architecture/scoutalert-crawling-and-deep-discovery.md) into ordered work. It supplements the [delivery roadmap](scoutalert-delivery-roadmap.md), which remains the implementation-status authority, and the [discovery acceptance gates](scoutalert-discovery-acceptance.md), which remain release requirements. Existing code should be extended where it already meets the design.

Unchecked items represent obligations to implement or verify. They do not mean that every underlying capability is absent. Mark an item complete only when its deliverable and evidence are recorded; distinguish implemented, connected, verified, and operationally ready states.

## Phase overview

| Phase | Outcome | Primary dependency | Existing roadmap relationship |
| --- | --- | --- | --- |
| 1 Establish the baseline | Explain current discovery failures and measure quality, coverage, and full cost | Existing discovery and evaluation paths | D1 through D4 evidence |
| 2 Strengthen shared collection | Collect productive sources once, continuously and reliably | Phase 1 measurement and scope contracts | D3 continuous expansion and reuse |
| 3 Expand deep discovery | Find unfamiliar sources and investigate beyond indexed pages | Phase 2 admission, frontier, and recovery | D2 adaptive discovery and D3 source expansion |
| 4 Improve the owned index | Retrieve and match useful opportunities across wording and languages | Existing index plus versioned evidence from Phase 2 | D3 owned knowledge and D4 quality |
| 5 Extend authorized private discovery | Turn explicitly connected content into private opportunity intelligence | Scope isolation, consent, evidence, and publication prerequisites | D3 permission-scoped sources and D5 expansion |
| 6 Prove sustained scale | Demonstrate operating quality, efficiency, resilience, and capacity | Integrated capabilities selected for release | D4 measured release and D5 operation |

## Ordering and parallel work

```text
Phase 1 Baseline and measurable gates
                   |
                   v
Phase 2 Shared collection and durable admission
                   |
         +---------+----------+
         |                    |
         v                    v
Phase 3 Deep discovery    Phase 4 Owned retrieval
         |                    |
         +---------+----------+
                   |
                   v
Phase 6 Integrated operating proof

Phase 5 Private discovery can overlap Phases 3 and 4 once its
consent, isolation, evidence, and publication prerequisites are ready.
```

These are capability dependencies, not a requirement to finish every task in one phase before starting any task in the next. Baseline measurements, source exploration, security checks, recovery tests, and cost accounting continue throughout. Basic indexing and matching remain available from the existing foundation while Phase 4 extends them.

Every increment should connect collection to evidence, retrieval, private assessment, and a controlled product outcome. A separate unintegrated crawler that only accumulates URLs does not satisfy a phase.

## Phase 1 Establish the baseline

**Objective:** Identify where useful opportunities are lost and establish a fair comparison for later changes.

**Starting foundation:** Existing search, public documents, source monitoring, opportunity assessment, local delivery, and [evaluation tooling](../../evaluations/discovery/README.md).

### Ordered work

- [ ] **CRAWL-1.1 Inventory current capabilities.** Record implemented protocols, source instances, access scopes, runtime configuration, supported interactions, retention, and known limits. Separate code presence from actual account connectivity and verified usefulness. Identify which existing components already satisfy later checklist items.
- [ ] **CRAWL-1.2 Trace the complete funnel.** Connect search, capture, demand review, normalization, retrieval, assessment, research, and publication with stable identities. Record retained and rejected counts, reason codes, incomplete outcomes, and the evidence version used at each transition.
- [ ] **CRAWL-1.3 Reconcile costs.** Record search/API requests, failed attempts, browser time, transferred bytes, model usage, storage, and shared-work reuse. Separate reservations, usage estimates, confirmed provider charges, and prepaid purchases; account for ambiguous outcomes.
- [ ] **CRAWL-1.4 Prepare independent evaluation sets.** Include jobs, projects, services, buyer-versus-seller pairs, informal demand, restrictive eligibility, rare goals, and multiple source families. Separate tuning samples from held-out sources and time periods. Retain original evidence and reviewer judgments.
- [ ] **CRAWL-1.5 Capture comparison baselines.** Measure the existing flow and capable manual research under declared briefs, access, time windows, and costs. Record known-opportunity recall, retrieval losses, match precision, freshness, useful yield, and unresolved cases.
- [ ] **CRAWL-1.6 Set gates before tuning.** Define numeric quality thresholds, tolerated regressions, freshness objectives, workload assumptions, spending limits, and recovery objectives for each release cohort. Record ownership and sample-size requirements. Missing thresholds keep the corresponding release gate open.
- [ ] **CRAWL-1.7 Rank the repair backlog.** Attribute empty or poor recommendations to coverage, access, demand detection, extraction, filtering, assessment, or delivery. Prioritize fixes by expected useful coverage, correctness, cost, and dependency. Re-run the affected baseline after each material repair.

**Deliverables:** Capability matrix, stage-outcome report, cost ledger, labeled evaluation set, comparison baseline, and prioritized repair backlog.

**Exit evidence:** Each failed or empty sampled run has a traceable stage outcome. Baseline and rerun results are reproducible on captured inputs. Live results are identified separately, and unavailable provider access leaves live checks pending without blocking fixture or instrumentation work.

**Acceptance references:** DACC-018 and DACC-019; OACC-010, OACC-013, OACC-015, and OACC-017 in the [monitoring and audit gates](scoutalert-observability-acceptance.md).

## Phase 2 Strengthen shared collection

**Objective:** Operate a shared collection system that stays useful independently of individual Scout subscriptions and repeated paid searches.

**Starting foundation:** Existing public document repositories, reviewed-source monitoring, feeds, sitemaps, durable budgets, leases, and Temporal execution. Reuse these contracts and records before introducing replacements.

### Ordered work

- [ ] **CRAWL-2.1 Complete source and scope contracts.** Represent source identity, capability/version, collection completeness, reuse scope, freshness policy, credential reference, and lifecycle. Make scope and configuration revision part of durable work and cache identities. Preserve protocol-specific behavior.
- [ ] **CRAWL-2.2 Separate reasons for collection.** Persist platform coverage objectives, source-exploration work, and private monitoring interests independently. Continue admitted platform collection when the last personal subscription disappears. Keep private ownership out of public evidence.
- [ ] **CRAWL-2.3 Automate source-instance admission.** Validate candidate identity, destinations, supported protocol, sample evidence, scope, and reuse policy. Automatically activate passing instances under versioned policy. Record rejection/deferment and a next action for unsupported capabilities.
- [ ] **CRAWL-2.4 Strengthen the durable frontier.** Implement source-aware canonicalization, shared operation identity, due times, fences, resumable cursors, per-source/provider limits, and fairness across work classes. Coordinate main requests and browser subrequests across workers. Reserve exploration and freshness capacity.
- [ ] **CRAWL-2.5 Reduce repeated collection.** Add or verify conditional requests, content/fact/link fingerprints, compatible-query reuse, and stampede protection. Include extractor and policy versions in reprocessing identity. Confirm that unchanged pages avoid unnecessary model work while link-only changes remain discoverable.
- [ ] **CRAWL-2.6 Complete ingestion recovery.** Persist observations and progress with downstream intent before acknowledging accepted work where the protocol allows. Reconcile outbox receipts, cursor gaps, duplicate captures, partial scans, and stale leases. Never infer closure from incomplete membership.
- [ ] **CRAWL-2.7 Integrate supported live changes.** Add a permitted stream, webhook, or change-feed path with stable event identity, authentication where supported, ordering, replay/backfill, and periodic reconciliation. Verify it separately from polling; absence of a usable live source remains an explicit integration dependency.
- [ ] **CRAWL-2.8 Prove shared collection end to end.** Run a controlled source update through two Scouts with isolated assessments and duplicate-safe delivery to test recipients. Exercise search-provider outage, cache loss, worker restart, and platform collection without personal subscribers. Compare costs and useful yield with Phase 1.

**Deliverables:** Source registry/admission extension, independent collection objectives, durable frontier, shared retrieval/reuse, live-change ingestion, and recovery evidence.

**Exit evidence:** Compatible public acquisition occurs once per refresh scope; private assessment remains separate. Platform exploration continues with a useful index and without individual subscribers. Restarts, duplicate events, and partial scans preserve correct state. Direct collection continues within its available resources when external search fails.

**Acceptance references:** DACC-004 through DACC-010, DACC-015, and DACC-016, plus the architecture's independent-collection and automatic-admission scenarios.

## Phase 3 Expand deep discovery

**Objective:** Discover unfamiliar sources, read deeper access paths, and adapt investigations based on what the system learns.

**Dependencies:** Phase 2 scope/admission contracts, durable frontier, operation accounting, and recovery. Discovery strategy experiments can begin earlier on captured evidence.

### Ordered work

- [ ] **CRAWL-3.1 Implement adaptive action selection.** Maintain versioned plans, public query portfolios, observed actions, unresolved objectives, and expected information value. Support reformulation, source-family changes, regional terminology, and native-language queries while preserving confirmed constraints.
- [ ] **CRAWL-3.2 Expand source discovery.** Follow useful outbound links and discover observed recruitment systems, directories, feeds, sitemaps, community sources, and supported endpoints. Allocate external search by incremental coverage. Route new instances through CRAWL-2.3 and record source provenance.
- [ ] **CRAWL-3.3 Broaden source-site search.** Extend constrained GET-form support with evaluated controls, pagination, and explicit read-only search adapters. Document effects and parameters for any POST search. Keep private profile text and confidential material out of public queries.
- [ ] **CRAWL-3.4 Extend dynamic-page retrieval.** Improve mixed static/dynamic detection and supported browser interactions. Add declared frame, cross-origin endpoint, or session capabilities only with destination and scope controls. Introduce larger workload classes where justified and retain complete versus partial capture outcomes.
- [ ] **CRAWL-3.5 Process attached briefs.** Add bounded PDF/document parsing and evaluated OCR with original page/region references, language, limits, and uncertainty. Detect unsupported or incomplete content and prevent it from becoming unsupported verified claims.
- [ ] **CRAWL-3.6 Deepen social and community context.** Extend native search and permitted thread/context retrieval. Preserve authorship, linked briefs, timestamps, edits, and withdrawals. Separate original buyer demand from seller replies, reposts, and unrelated discussion.
- [ ] **CRAWL-3.7 Add persistent investigations.** Bundle consequential research questions, evidence relationships, contradictions, and prior attempts. Save remaining frontier and next actions when an allowance ends. Resume through explicit admissions with cumulative budgets, current permissions, and unchanged user requirements.
- [ ] **CRAWL-3.8 Detect and repair source drift.** Monitor extraction completeness and source yield. Try supported alternate paths; validate declarative recipe changes on retained permitted samples, roll out narrowly, and provide rollback. Keep executable connector changes in the engineering review process.
- [ ] **CRAWL-3.9 Prove useful discovery beyond initial sources.** Exercise held-out domains, searchable portals, dynamic pages, attached briefs, and informal buyer requests. Compare useful discoveries and total cost with the baseline; verify both successful investigations and honest unresolved outcomes.

**Deliverables:** Adaptive discovery loop, broader source adapters, document extraction, social context, investigation dossiers, durable continuation, and source-drift handling.

**Exit evidence:** A previously unconfigured source produces a supported opportunity through the full assessment path. A weak first query leads to a useful strategy change. A saved investigation resumes without resetting budgets. Jobs, projects, and services each have independent quality evidence; one category cannot stand in for another.

**Acceptance references:** DACC-001 through DACC-003, DACC-005, DACC-009, DACC-011, DACC-012, and the architecture's deep-access, continuation, contradiction, and drift scenarios.

## Phase 4 Improve the owned index

**Objective:** Make ScoutAlert's own knowledge broadly retrievable, current, and useful for private matching, including opportunities expressed differently from the user's words.

**Dependencies:** Existing opportunity persistence and Phase 2 version/scope contracts. Work can proceed alongside Phase 3; deeper discovery contributes additional evaluation cohorts as it becomes available.

### Ordered work

- [ ] **CRAWL-4.1 Strengthen opportunity and evidence identity.** Preserve category-specific fields, original language, incomplete leads, versions, and claim applicability. Implement auditable and reversible merges that retain distinct locations, scopes, engagement types, and deadlines.
- [ ] **CRAWL-4.2 Complete keyword and structured retrieval.** Measure query plans, selective filters, candidate caps, and false exclusions against the declared workload. Preserve unknown values where rejecting them would lose useful informal demand. Include broad-goal fallback and reconciliation.
- [ ] **CRAWL-4.3 Add semantic and multilingual retrieval.** Version embeddings, language handling, and index projections. Evaluate native terminology, translated concepts, and paraphrased requests against independent samples. Provide rebuild, migration, and rollback paths before production activation.
- [ ] **CRAWL-4.4 Combine candidate methods.** Fuse structured, lexical, and semantic candidates and evaluate reranking at a declared shortlist size. Attribute missed known opportunities to the specific retrieval stage. Keep eligibility checks and final private assessment separate from candidate ranking.
- [ ] **CRAWL-4.5 Maintain evidence relationships and change routing.** Connect sources, organizations, opportunities, claims, and investigations. Route material changes to plausible active Scouts, invalidate dependent claims/assessments, and reconcile missed routes. Keep indirect signals as research hypotheses until actual demand is supported.
- [ ] **CRAWL-4.6 Learn from outcomes.** Record explicit corrections, missed opportunities, exposure history, and evaluation provenance. Improve query/source routing with controlled experiments and holdouts. Preserve user control, rare-cohort exploration, and the separation between private feedback and shareable public evidence.
- [ ] **CRAWL-4.7 Verify publication freshness.** Recheck evidence, access, opportunity and Scout revisions, availability, mandatory requirements, consent, and suppression before recommendations or delivery. Test merges, deadlines, withdrawals, edits, and contradictory evidence.
- [ ] **CRAWL-4.8 Evaluate index and external discovery together.** Measure acquisition recall, candidate recall, match precision, usefulness, freshness, and total cost separately. Verify that a good shortlist does not stop shared exploration or necessary personal investigation. Evaluate dedicated search infrastructure only against a measured bottleneck.

**Deliverables:** Versioned opportunity/evidence index, combined retrieval, multilingual evaluation, relationship and invalidation handling, change routing, and controlled learning.

**Exit evidence:** Useful opportunities survive nonliteral wording and supported language differences. Changes invalidate or update affected recommendations correctly. Retrieval quality and cost meet the predeclared cohort thresholds without hiding losses among rare goals.

**Acceptance references:** DACC-010 through DACC-014, DACC-019, and DACC-021.

## Phase 5 Extend authorized private discovery

**Objective:** Convert explicitly connected content into private opportunity intelligence while preserving source permissions, owner isolation, and revocation.

**Starting foundation:** [Private email connections](scoutalert-private-mail-connections.md) records an existing Gmail consent, selected-label import, encrypted storage, and local revocation implementation. It also identifies private assessment and automatic ongoing collection as follow-up work. Treat those records as a starting point and verify current behavior before extending it.

**Dependencies:** Scope-aware work and evidence contracts, consent/revocation fencing, and a private assessment/publication path. This phase may overlap Phases 3 and 4 once those specific prerequisites are ready.

### Ordered work

- [ ] **CRAWL-5.1 Audit the existing connection lifecycle.** Verify consent revisions, selected source scope, credentials, import limits, retention, account isolation, and disconnected state. Identify current code and live-setup gaps without assuming any account is connected.
- [ ] **CRAWL-5.2 Define private processing permission.** Specify what content may be imported, which processing providers may receive it, what may be retained, and which product outcomes are enabled. Connecting an account must not silently authorize broader collection or global reuse.
- [ ] **CRAWL-5.3 Integrate private understanding and matching.** Extract owner-scoped leads and evidence through appropriate repositories and policies. Assess against the owner's Scouts, preserve uncertainty, and enable recommendations only after current permission and evidence checks. Keep private content out of public caches, indexes, and learning datasets.
- [ ] **CRAWL-5.4 Add ongoing collection and reconciliation.** Support explicitly enabled continuous checks or provider change mechanisms, durable cursors, scope-change handling, expiry, and removal reconciliation. Retain a gap when historical recovery is unavailable.
- [ ] **CRAWL-5.5 Extend private access paths.** Select additional connected communities, institutional portals, newsletters, or licensed sources by useful demand and available access. Treat links from private messages as separate retrieval decisions; connection to email does not grant access to a linked account.
- [ ] **CRAWL-5.6 Propagate revocation and deletion.** Fence in-flight acceptance and publication, remove or restrict dependent evidence/indexes/assessments/caches, and reconcile retention and backups. Test disconnect, expired grants, changed scope, deletion during work, and failed remote revocation.
- [ ] **CRAWL-5.7 Verify a connected private journey.** Use approved test content and a deliberately connected account to verify ingestion through private assessment and eligible test delivery. Run a second-owner isolation case and negative revocation cases. Keep fixture, live connectivity, and recommendation-quality results distinct.

**Deliverables:** Private processing and consent contracts, integrated private opportunity pipeline, ongoing collection, additional source capability where justified, and revocation evidence.

**Exit evidence:** Authorized private opportunities are useful only to the entitled owner. A disconnected or out-of-scope source cannot recreate retained content or produce stale recommendations. Actual enabled account capabilities and remaining gaps are documented.

**Acceptance references:** DACC-010, DACC-014, and DACC-017; OACC-008, OACC-009, OACC-012, and OACC-020.

## Phase 6 Prove sustained scale

**Objective:** Establish that the integrated system can sustain its declared workload, recover from failures, and deliver useful coverage at an acceptable total cost.

**Dependencies:** The capabilities selected for release have passed their functional and scope gates. Private-source capability is required for a private-source release claim; public discovery can be evaluated independently with its narrower release scope stated.

### Ordered work

- [ ] **CRAWL-6.1 Define representative workloads.** Declare source count, categories, languages, request mix, browser share, document sizes, arrival rates, subscriber distribution, retention, and burst patterns. Set queue/freshness percentiles, recovery objectives, spend envelope, and required headroom before testing.
- [ ] **CRAWL-6.2 Exercise capacity and fairness.** Load and soak-test the separate collection, browser, extraction, indexing, matching, and delivery pools. Measure database contention and backpressure. Verify that popular sources cannot starve exploration, smaller cohorts, or urgent verification.
- [ ] **CRAWL-6.3 Inject failures.** Exercise provider outage, throttling, ambiguous paid calls, cache loss, database interruption, process crashes, parser drift, cursor expiry, and stale leases. Confirm bounded retries, correct accounting, explicit gaps, and recovery without duplicate consequential effects.
- [ ] **CRAWL-6.4 Prove recovery and deployment.** Test backup restore, deletion reconciliation, workflow replay, schema/index migrations, release rollback, and credential rotation. Regional claims additionally require fenced ownership transfer, residency rules, and cross-region budget/deletion tests.
- [ ] **CRAWL-6.5 Complete operational visibility.** Provide source/queue health, stage outcomes, collection gaps, coverage cohorts, cost, and recommendation-to-evidence traceability. Validate actionable alerts and the runbooks for source shutdown, backlog recovery, failed extraction, and provider outage.
- [ ] **CRAWL-6.6 Run the comparative quality and cost pilot.** Compare with Phase 1 and capable manual research on held-out sources and time windows. Report maintenance, failed attempts, shared-work allocation, human effort, sample sizes, and uncertainty. Confirm that savings do not come from silently reducing difficult coverage.
- [ ] **CRAWL-6.7 Roll out progressively.** Enable validated capabilities for declared cohorts, observe their quality/freshness/cost gates, and expand with rollback triggers. Reallocate external search according to incremental yield. Add dedicated search, event, or analytics infrastructure only when evidence justifies it.
- [ ] **CRAWL-6.8 Record readiness and the next expansion.** Update the delivery roadmap with implementation references, migrations, enabled configuration, passed scenarios, open gaps, operational evidence, and the next source/language/region objectives. Keep exploration funded within the declared operating budget.

**Deliverables:** Capacity report, fault/recovery results, runbooks, quality/cost comparison, rollout controls, and an evidence-backed readiness record.

**Exit evidence:** Predeclared functional, quality, isolation, freshness, recovery, and cost gates pass on the intended deployment. Any unmet gate remains explicit; a provider connection, synthetic example, or single source-to-delivery success cannot establish overall production readiness.

**Acceptance references:** DACC-008, DACC-014 through DACC-016, DACC-018 through DACC-021, and the applicable monitoring and audit operational gates.

## Repository ownership

| Area | Implementation responsibility |
| --- | --- |
| `packages/core` | Domain rules, plans, source policy, evidence, assessment, and repository contracts in their owning features |
| `packages/adapters` | Source access, database repositories, persistence mapping, model providers, index projections, and cache operations |
| `packages/workflows` | Deterministic durable execution definitions and activity contracts |
| `apps/worker` | Activity composition, queue/concurrency wiring, and worker lifecycle |
| `apps/api` | NestJS transport, validation, authorization, and dependency injection |
| `apps/web` | Coverage, connection, evidence, and recommendation presentation using shared application rules |
| `infrastructure` | Deployment, isolation, secrets references, operational configuration, and recovery setup |
| `evaluations` and `scripts` | Reproducible fixtures, measurements, independent review inputs, and evaluation reports |
| `docs` | Architecture decisions, capability records, acceptance evidence, and current implementation status |

Follow [repository ownership](scoutalert-repository-layout.md) and [working agreements](../../AGENTS.md). Services depend on inward contracts; repository implementations own all data access; composition roots construct and bind clients. Preserve existing feature boundaries and avoid empty scaffolds or replacement subsystems without a demonstrated need.

## Definition of done for every work item

A work item is complete when its intended behavior is implemented or verified in the existing implementation, with the following evidence as applicable:

1. Requirement, scope, dependencies, and affected acceptance gates are linked to its stable ID.
2. Domain policy, contracts, repository changes, and composition respect the architecture and working agreements.
3. Migrations, backfill, version compatibility, retention, invalidation, and rollback are addressed where state changes.
4. Relevant contract, integration, failure, or quality checks pass; controlled and live evidence are distinguished.
5. Usage, uncertainty, and partial outcomes are observable, and resource/access limits remain enforceable.
6. The capability reaches its intended product path without unsupported claims or duplicate effects.
7. Implementation and evidence references are added to the delivery roadmap; remaining dependencies and rollout scope are explicit.

Store the work-item ID, implementation reference, configuration version, dataset/split, run time, environment, actual source/account scope, results, reviewer, cost, and unresolved gaps with the evidence record. Use verified references rather than copying historical results onto changed code.

## First implementation sequence

Begin with **CRAWL-1.1 through CRAWL-1.7** to establish what exists, why sampled results fail, and how improvements will be judged. Then take the smallest integrated slice through **CRAWL-2.1, CRAWL-2.2, CRAWL-2.4, CRAWL-2.5, CRAWL-2.6, and CRAWL-2.8** for an already supported productive source.

That slice should demonstrate one shared source update, versioned evidence, two isolated personal assessments, and a controlled delivery outcome, with failure and cost records. Complete automatic new-source admission and live changes alongside it, then extend the same pipeline through Phase 3 discovery and Phase 4 retrieval. This sequence produces a measurable improvement while keeping the full architecture intact.
