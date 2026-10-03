# ScoutAlert — Delivery Roadmap and Implementation Status

**Version:** 0.8

**Date:** 3 October 2026

**Status:** Delivery plan; implementation claims below describe the existing local code, not the new design

## 1. Scope and sequencing

The product is a persistent personal scout backed by internet-wide opportunity discovery, investigation, matching, monitoring and delivery. Employment, contracts, client projects and requests for services remain core scope. International remote client work is the first client-project market priority, not a permanent geographic boundary.

The [platform PRD](../prd/scoutalert-platform-prd.md) owns scope. The [discovery architecture](../architecture/scoutalert-discovery-architecture.md) owns discovery mechanics and the [acceptance gates](scoutalert-discovery-acceptance.md) determine completion. Increments sequence delivery; they do not reduce the product to configured job boards or onboarding.

## 2. Existing local baseline

| Capability                              | Current evidence and limitation                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding, identity and activation     | Connected review, Mailpit codes, sessions, transactional save and discovery outbox; arbitrary free text still needs structured user confirmation                                                                                                                                                                                                                      |
| Dashboard and Scout controls            | Account-owned reads, edit, pause/resume and persisted opportunity feedback                                                                                                                                                                                                                                                                                            |
| Configured-source discovery             | Figma and Remote Greenhouse boards; bounded Freelancer buyer-request feed for projects and hourly services                                                                                                                                                                                                                                                            |
| Matching and evidence                   | Keyword retrieval, shared cited demand classification/extraction and private fit; source/excerpt distinction and bounded freshness gates                                                                                                                                                                                                                              |
| Delivery                                | Local grouped digests and evidence-gated prompt policy; SMTP capture in Mailpit, not a production delivery deployment                                                                                                                                                                                                                                                 |
| Execution                               | Finite Temporal workflows, reconciliation, version checks, outbox/effect identities and local recovery tests                                                                                                                                                                                                                                                          |
| Evaluation                              | Synthetic and captured-source assessment packets, cost/latency records and review tooling; independent quality labels and broad discovery benchmarks remain incomplete                                                                                                                                                                                                |
| General web/native social discovery     | Serper adapter/coordinator and private leads UI implemented; bounded live contract passed and local access enabled; native X recent search/lookup implemented, first live recent-search receipt recorded and scheduled local access enabled; bounded native context and live lookup verified; independent relevance gates remain open; no direct LinkedIn integration |
| Adaptive discovery and source expansion | Bounded result-responsive queries, pagination and two-hop observed-link investigation implemented; model-selected actions and alternative-role decomposition are implemented; shared reviewed-page registry, persistent link frontier and adaptive revisits implemented; learned query yield and broader protocol admission remain outstanding                        |
| Semantic retrieval and global operation | Target capabilities; no demonstrated broad multilingual recall or production global-scale capacity                                                                                                                                                                                                                                                                    |

See [connected onboarding and scouting](scoutalert-connected-onboarding.md), [marketplace evidence](../../evaluations/marketplace-discovery/README.md) and [assessment evidence](../../evaluations/opportunity-quality/README.md) for exact implemented behavior and historical results. A source being publicly accessible is not evidence that our worker is connected to it.

## 3. D0 — Align the specification

Deliver the revised PRD, platform/discovery architecture, provider strategy, repository ownership, user stories, acceptance criteria and evaluation protocol. Preserve existing story IDs and distinguish target, implemented and verified behavior.

Completion means documents agree and references resolve. It does not change live source coverage, activate providers, dispatch agents or pass runtime acceptance gates.

## 4. D1 — Discovery contracts and first live web path

Implement in small reviewable increments:

1. Core lead, observation, plan, source-candidate and capability contracts; explicit uncertainty, scope, versioning and completeness.
2. Repository implementations, migrations, durable identities, outbox events and source/query progress.
3. One evaluated general web-search adapter, safe source fetch and normalization; existing connectors continue through compatible boundaries.
4. Lead-to-opportunity/evidence processing, searchable persistence and connection to current assessment/dashboard/delivery.
5. Source-level provenance and honest partial/access/budget states in the product.

The first adapter is an implementation starting point. The registry and contracts must permit additional providers without changing matching or delivery. Do not model a social request as a fabricated fully specified job to fit current `Posting` fields.

**Dependencies:** usable provider access, account-specific quotas, permitted use/storage, captured contract fixtures and runtime cost policy. Contract and persistence work can proceed while access is arranged; live status cannot.

**Exit evidence:** discovery-foundation gate and live unconfigured-source web case. D1 alone does not complete native social discovery or continuous source expansion.

**Current increment:** [implementation and verification notes](scoutalert-web-discovery.md) record the first contracts, Serper adapter, durable coordinator, safe fetch, source-grounded demand review, private fit, fresh-evidence delivery and private UI. Local database/replay checks, a one-query Serper contract, and a separately recaptured real web job → synthetic personal assessment → Mailpit digest pass. The first live review exposed an arrangement/engagement error; the tightened schema/validation passed a second bounded check. The subsequent model-guided increment passed one complete synthetic live discovery-to-delivery case. D1 remains open for broader cases, continuation, independent quality and the remaining gates.

## 5. D2 — Adaptive planning and native social discovery

Implement the Scout Planner and Deep Discovery Agent with recorded plans, actions, observations, validated tool choices and finite cases. Reuse plans until their inputs or usefulness require revision. Add native X discovery as a distinct capability with actual access, pagination/recovery and relevant thread context.

Demand-versus-offer classification and nullable informal lead inputs now exist as foundations. Extend their quality/coverage evaluation alongside multilingual query strategies and provider-specific capability selection. Replanning cannot silently relax mandatory requirements. Evaluate actual provider results independently from the agent's reasoning over them.

LinkedIn coverage work distinguishes public index discovery, authorized access and full-content retrieval; record the path actually enabled. Other social platforms and communities can enter through the same open-ended capability design as access and usefulness justify them.

**Current increment:** new cases record and execute bounded adaptive decisions, productive pagination, and observed source/application links. Concurrent retries, shared reuse, caps and current-revision fencing have database coverage. AI-enabled cases now separate alternative public targets and use source reviews during model-selected exploration. Captured application/employer evidence supplements public research. A synthetic live discovery-to-Mailpit path passed, with failures and a same-brief baseline retained. Native X recent search/lookup, shared cursors, post lifecycle and review dispatch are now implemented and fixture-tested; the first live recent-search request returned seven posts, and scheduled access is enabled locally. Live post refresh and bounded parent/quote/conversation-root expansion are now verified. Measured route utility now orders approved queries and source checks, with native budget pacing, adaptive revisits and oldest-due selections. This bounded heuristic does not complete learned query rewriting or prove organic usefulness. Broader semantic planning, paired organic classification checks and independent relevance/recall remain open. See [scheduling and measurements](scoutalert-discovery-scheduling.md). See [native social implementation](scoutalert-native-social-discovery.md).

**Exit evidence:** live web and native social gate, current-revision planning and paired social-demand cases. Do not substitute search-engine snippets for a claimed native integration.

## 6. D3 — Continuous exploration, source expansion and shared research

Implement reserved external exploration alongside known-source monitoring, independent of whether the index already contains matches. Introduce the shared Source Expansion Agent, candidate admission, focused crawl frontier and automatic registration of supported source instances under explicit policies.

Extend the existing evidence research capability into the Evidence Research Agent contract, bundling related questions and sharing public evidence at the correct scope. Implement durable standing queries, change monitoring, compatible public query coalescing and optional authorized alert/feed inputs.

The owned opportunity/evidence index grows from D1 onward; D3 expands its collection and relationships. A separate search service or graph database is not a prerequisite.

**Current increment (2 October):** reviewed public pages now enter a shared URL registry with revision-bound interests, source health, adaptive revisits and a persistent observed-link frontier. A separate finite Temporal schedule captures changes; durable coalesced updates use the existing review/matching/delivery pipeline without another paid search portfolio. The controlled two-scout scenario shares public work and reaches Mailpit with duplicate suppression. Independent organic yield, additional feed/stream protocols, reserved exploration fairness and production-load gates remain open. See the [recorded implementation](scoutalert-web-discovery.md#continuous-source-monitoring--2-october-2026).

**Exit evidence:** continuous expansion/reuse gate, including positive-index exploration, new-source monitoring, privacy isolation, cursor recovery and deduplication.

## 7. D4 — Prove usefulness and operating efficiency

Run the [discovery evaluation protocol](../../evaluations/discovery/README.md) across known-source and held-out-source cases, common and rare goals, regions, languages, formal listings and informal demand. Obtain independent relevance judgments, adjudicate ambiguity and keep the held-out split separate from prompt tuning.

Measure provider contribution, discovery recall on the known set, false demand, retrieval losses, recommendation usefulness, research value, full costs and latency. Run workload/failure tests with explicit queues, source quotas and dataset size. Correct failed gates before widening release.

**Exit evidence:** quality/efficiency gate and declared deployment recovery/scale gates. Numeric targets must be set before evaluation. More connected providers, agent calls or returned URLs alone do not pass.

## 8. D5 — Expand coverage and production operation continuously

Add sources, regions, languages, communities, marketplaces and licensed feeds according to measured unmet demand and incremental useful coverage. Maintain exploration so low-volume cohorts receive opportunities to improve. Introduce regional placement and failover only with explicit ownership, access and recovery evidence.

Scale worker pools independently. Adopt dedicated search, event streaming or analytical storage when workload evidence justifies each change, with migration and rollback plans. Provider changes retain compatible contracts but require new quality and access checks.

The full platform backlog also retains profiles, opportunity workspace, applications and service engagements, assistance, integrations, commercial operations, support and ScoutAlert-owned intelligence. These proceed in coherent product increments; this discovery roadmap does not remove them.

## 9. Readiness tracking

For each increment, track implementation PR/commit references, migration status, enabled runtime configuration, named live providers, scenario results, known gaps and next dependencies. Separate implemented, connected, verified and production-ready labels. Existing local defaults are tuning parameters, not future product limits.

Do not mark an increment complete because a diagram, provider interface or synthetic test exists. Do not mark the platform complete because one source-to-email path succeeds. Retain the acceptance gate IDs in implementation reviews so remaining work stays visible.
