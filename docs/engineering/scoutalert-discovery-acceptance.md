# ScoutAlert — Discovery Acceptance and Release Gates

**Version:** 0.3

**Date:** 1 October 2026

**Status:** Required acceptance specification; D1 component/recovery checks and a bounded recaptured web source → private assessment → Mailpit smoke have run locally. Demand classification and cited source extraction are implemented, but the full release scenarios and independent quality gates remain open. See the [implementation evidence and limitations](scoutalert-web-discovery.md).

**Design:** [Discovery architecture](../architecture/scoutalert-discovery-architecture.md)

**Backlog:** [Platform user stories](../user-stories/scoutalert-platform-user-stories-v0.1.md)

## 1. Acceptance boundary

The first internet-discovery milestone demonstrates a confirmed Scout finding a relevant opportunity from a previously unconfigured public source, preserving evidence, assessing current requirements, producing an eligible recommendation and sending a consent-aware local alert. It also demonstrates native social discovery and recurring monitoring. Existing configured-source collection alone does not satisfy this milestone.

The first implementation package can deliver contracts, lead storage and one live web-search adapter. That is a foundation increment, not completion of this release gate. X access, independent quality review and recovery evidence remain explicit dependencies. No documentation change, passing mock or newly installed SDK makes an integration live.

## 2. Test evidence contract

Every scenario result records scenario/story IDs, code and schema revision, provider/capability configuration, fixture or live source identity, source observation time, Scout revision, policy/model versions, access class, expected outcome, observed outcome, usage and test-artifact location. Redact private user data and credentials.

Use deterministic fixtures for reproducible policy/fault cases and separately recorded live runs for actual connectivity and discovery. A live smoke pass is not a quality benchmark. Historical results in existing evaluation packets retain their original scope and date.

Allowed statuses are not run, passed, failed or blocked with a stated dependency. Partial implementation does not count as passed. A production gate needs its target workload, thresholds, accountable owner and evidence approved before measurement; missing values keep the gate open.

## 3. Functional and recovery scenarios

### DACC-001 — Discover an unconfigured public source

**Stories:** DISC-001, DISC-007, DISC-010, AGENT-002

Given a confirmed international-remote client-project Scout and a relevant public request on a domain absent from the source registry, when live search discovers the URL, then the system admits it through source policy, stores a lead and source evidence, assesses the current brief and publishes an eligible recommendation. No engineer adds the domain to connector code to make the test pass. Record whether the search engine actually returned it; a fixture verifies ingestion separately.

### DACC-002 — Capture an informal social request

**Stories:** DISC-009, EVID-004, SVC-001

Given a native X result asking for a service without a job title, company, price or application URL, when it is classified, then it can remain a useful lead with unknown fields. A paired provider advertising their own services must not become buyer demand. Preserve platform/post identity, permitted context and source timestamps. Native X success and search-engine discovery of an X URL are reported separately. For a reply or quote, capture admitted parent/quote/conversation context with separate authorship; missing or bounded context stays explicit. Primary facts cannot cite another author’s post. Shared references consume one admitted lookup across interested scouts. Edits, expiry and deletion invalidate dependent assessments, and restoration requires fresh review without clearing historical usage.

### DACC-003 — Preserve confirmed intent through planning

**Stories:** AGENT-001, DISC-008, WL-002

Given a Scout with mandatory constraints and an existing plan, when the planner reformulates terminology or searches another language, then constraints remain unchanged, the plan references the confirmed revision and query actions remain inspectable. A material Scout edit supersedes the plan; late outputs cannot publish under the new revision.

### DACC-004 — Explore with an already useful index

**Stories:** DISC-011, DISC-012, AGENT-004

Given sufficient indexed recommendations and an enabled exploration allocation, when a new opportunity appears outside those sources, then due external monitoring/exploration still executes. A source or cohort with little history receives its configured exploration opportunity. A high indexed result count cannot silently cancel that work.

### DACC-005 — Expand and monitor a discovered source

**Stories:** DISC-010, DISC-013, AGENT-004

Given a newly discovered feed or supported recruitment endpoint, when capability and access validation succeed, then a source instance can be registered under an existing adapter and refreshed independently of a single Scout. Unsupported protocols remain candidates with an explicit reason. No agent-generated executable code is installed. Duplicate proposals create one logical monitored instance.

### DACC-006 — Preserve provider-specific behavior

**Stories:** DISC-007, OPS-011

Given paginated search, a windowed feed and a reconnecting stream, when adapters translate their responses, then cursors, completeness, quota outcomes and recovery gaps remain distinguishable. Unsupported filters are rejected or explicitly translated; they are not silently treated as applied. Enabling a new provider does not require changes to matching or notification rules.

### DACC-007 — Avoid false closure

**Stories:** DISC-004, EVID-003, REL-002

Given an existing opportunity, when it disappears from search results, a bounded feed window, a truncated response or an interrupted stream, then its state is not automatically changed to closed. An explicit supported closure/deletion observation follows the source-specific status and retention policy and invalidates affected current assessments.

### DACC-008 — Recover ingestion without losing acknowledged work

**Stories:** DISC-017, OPS-004, OPS-011

Given a batch or stream event, inject crashes before commit, after durable acceptance and after provider acknowledgement. Recovery must preserve every acknowledged accepted observation, safely deduplicate repeated events and resume from durable progress. An unrecoverable provider gap remains visible and triggers available backfill rather than a fabricated complete scan.

### DACC-009 — Enforce fetch admission before network access

**Stories:** DISC-016, EVID-006, OPS-001

Given public URLs, private network destinations, malicious redirects, oversized content and restricted sources, when discovery proposes fetches, then policy permits supported public destinations and rejects disallowed ones before access. Redirect destinations are revalidated. Retrieved instructions cannot alter tool permissions, reveal secrets, initiate user contact or override the confirmed brief.

### DACC-010 — Reuse public work without sharing private data

**Stories:** DISC-015, PRIV-001, RSRCH-002

Given many Scouts with compatible public search intent, when they encounter one content version, then collection and extraction coalesce under stable identities. Two different access classes never share restricted content accidentally. Private profiles, personal assessments and confidential submissions are absent from public cache keys, research results and source-expansion state.

### DACC-011 — Bundle related research and preserve uncertainty

**Stories:** AGENT-003, RSRCH-004, RSRCH-003

Given several consequential questions answered by the same document, when research executes, then it can share a fetch and case while recording separate question outcomes. Evidence applies only within its verified scope. Exhaustion leaves unresolved questions visible; retry cannot create a fresh allowance for the same logical action without a recorded new admission.

### DACC-012 — Preserve multilingual and regional meaning

**Stories:** DISC-012, MATCH-009, SVC-002

Given reviewed cases in different enabled languages, regions and compensation units, when discovery and matching run, then original evidence is retained, translations remain attributable, and residence, employer location, applicant restrictions and service delivery geography remain distinct. Missing local evidence is not replaced with English-market assumptions. Report each cohort separately.

### DACC-013 — Maintain identity across reposts and variants

**Stories:** DISC-003, EVID-005, ALERT-004

Given reposts and multiple pages for one opportunity plus a genuinely different location or project-scope variant, when entity resolution runs, then duplicates consolidate without erasing meaningful variants. A corrected merge is auditable and reversible. Existing accepted alerts are not duplicated solely because a URL or canonical identity changed.

### DACC-014 — Gate recommendations and alerts with current state

**Stories:** MATCH-002, ALERT-006, WL-003

Given an otherwise strong finding, change the Scout revision, pause state, evidence, availability, consent or suppression while work is queued. Publication and email preparation must respect the current state. Prompt alerts require supported required criteria and the exceptional-match policy; a provisional social lead cannot bypass them. Ambiguous provider submission is held for reconciliation.

### DACC-015 — Isolate overload and provider failure

**Stories:** OPS-009, OPS-012, OPS-005

Given a slow provider, exhausted quota and an expensive account workload, when traffic exceeds available capacity, then independent limits, fair scheduling and backpressure preserve unrelated work. Reserved exploration and delivery capacity remain observable. Delayed, failed and exhausted outcomes stay distinct from no matches. Measure queue age and recovery under the declared workload.

### DACC-016 — Recover without cache authority

**Stories:** OPS-004, OPS-009, DISC-015

Given admitted discovery and delivery work, when disposable Redis cache entries are lost, then durable leads, source progress, budgets and delivery identities remain intact. Extra work stays within admission limits; a cache miss cannot authorize duplicate publication or email. Rebuildable indexes recover from durable records and access policy.

### DACC-017 — Accept optional alerts and permission-scoped content

**Stories:** DISC-014, INT-001, DISC-018

Given an authorized forwarded alert or permitted community input, when it supplies a lead, then its links use normal fetch admission and its private scope is preserved. Revoking the connection prevents further access and propagates required restrictions to derived records. Inaccessible LinkedIn content can remain a permitted pointer with an explicit coverage gap; no content or confirmed claim is invented.

### DACC-018 — Expose understandable coverage and progress

**Stories:** DISC-005, DISC-019, REL-001, ONB-030

Given successful, partial, stale, access-blocked, exhausted and failed discovery, then the dashboard explains the meaningful state and last successful observation. It distinguishes a saved Scout from a completed search, and connected sources from planned integrations. Empty results never claim that no opportunities exist anywhere. UI status does not expose raw provider errors or private operational payloads.

### DACC-019 — Validate provider adoption and real usefulness

**Stories:** OPS-006, OPS-013, AI-001

Given proposed search/social providers and a held-out case set, run actual supported capabilities and independently reviewed discovery/relevance evaluation. Record incremental coverage, known-opportunity recall, false demand, unsupported claims, language/region slices, freshness and full operating costs. Fixtures, synthetic model evaluations and one successful API call cannot substitute for this evidence.

### DACC-020 — Demonstrate production capacity and regional recovery

**Stories:** OPS-010, OPS-014, OPS-015

Given a proposed production workload and regional ownership plan, exercise burst load, rate limits, worker loss, durable storage recovery and region failover where enabled. Record source and account ownership fencing, replication/index lag, replay behavior and deletion propagation. Production scale or multi-region operation remains unverified until the declared targets pass; the local Temporal smoke benchmark does not establish these results.

## 4. Gate groups and required evidence

| Gate                            | Required evidence                                                                                         | Current status                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery foundation            | Lead/plan/provider contracts, persistence invariants and adapter contract checks; DACC-003, 006, 007, 009 | Partly implemented: public contracts, durable reuse/admission, incremental source review, alternative-role planning and bounded model-selected actions; expanded gates still open    |
| Live web and native social path | Actual configured providers; DACC-001, 002 and 018, plus current recommendation/delivery gates            | One synthetic live Serper → research → private fit → Mailpit case passed; native social gate remains open                                                                            |
| Continuous expansion and reuse  | DACC-004, 005, 010, 011, 013, 016 and 017                                                                 | Partial: shared page monitoring, bounded link expansion, current-scout dispatch and controlled Mailpit checks pass; organic source yield, feed/stream recovery and scale remain open |
| Quality and efficiency          | DACC-012 and 019 with independent judgments and declared thresholds                                       | Diagnostic same-brief baseline comparison recorded; independent labels, missed opportunities and release thresholds still outstanding                                                |
| Release recovery and scale      | DACC-008, 014, 015 and 020 on the intended deployment/workload                                            | Existing local recovery tests are partial evidence only                                                                                                                              |

These groups may be implemented in overlapping increments. A dependency delay does not erase a gate or relabel the complete milestone as done.

## 5. Metrics and threshold ownership

The engineering owner defines throughput, queue-age, latency, fault recovery and cost envelopes. The product/quality owner defines useful-result, missed-opportunity, cohort and evidence thresholds. Both review tradeoffs before the held-out run; do not choose passing thresholds after observing results.

Measure at least known-opportunity discovery recall, useful demand precision, retrieval recall on the acquired corpus, personalized relevance, source novelty, provider overlap, evidence support, duplicate effects, freshness, total cost per useful recommendation and tail queue delay. Keep source discovery failures separate from extraction and ranking failures.

Hard invariants block release regardless of averages: cross-account exposure, unsupported confirmed claims, silent mandatory-constraint changes, unauthorized access, lost acknowledged observations, stale publication and duplicate business effects under the tested idempotency contract. Provider-ambiguous email outcomes are explicit states requiring reconciliation, not proof of exactly-once external delivery.

The [evaluation protocol](../../evaluations/discovery/README.md) specifies sample construction, labeling, workload manifests and report contents. No percentage represents whole-internet recall.

### 2 October monitoring evidence

The DACC-005/010/011/013 implementation now includes a reviewed public-page registry, private current-revision interests, shared per-capture link allowance, adaptive revisits and durable coalesced outbox updates. A controlled directory update feeds two private assessments and two local Mailpit recipients with no duplicate sends. Database checks cover pause/version changes, expired leases, budget/concurrency admission and replay; the new Temporal workflow passes failure recovery and history replay. This is mechanics evidence for supported page URLs. It does not satisfy the full continuous expansion gate's organic-source, other-protocol, reserved-exploration, independent-quality or production-load requirements. See [the controlled report](../../evaluations/discovery/continuous-monitoring.json) and [runtime snapshot](../../evaluations/discovery/continuous-monitoring-local.json).

### 3 October native social implementation evidence

Native X recent-search/lookup, shared query subscriptions, exact pagination recovery, separate spending limits, unavailable-post withdrawal, source expiry and downstream review dispatch are implemented. Captured contracts and isolated database checks cover the local mechanics; a separate finite Temporal definition has retry/replay coverage. With credentials configured, a real recent-search request returned seven posts and local scheduled discovery is enabled. DACC-002 and the live web/native social gate remain open for paired organic buyer-versus-seller cases and independent relevance/coverage measurement. The bounded context increment verified live refresh and context lookups, separate attribution, incomplete-context withholding and dependent-assessment invalidation; it does not claim whole-thread capture. The live connectivity result is recorded separately from fixture evidence. See [the implementation record](scoutalert-native-social-discovery.md).

## Scheduling evidence — 3 October

Public query/source measurements, bounded outcome sampling, adaptive native revisits and daily pacing now support the existing exploration, budget and efficiency requirements. Database fixtures verify shared accounting, replay/rollback, stale-label exclusion, measured query order, oldest-due selection and raised-limit pacing. The worker regression suite passes 223 tests; API/web types and architecture checks pass. The additive migration is applied locally and all eight worker pools started successfully.

The first live scheduling report records 15 completed Serper requests and four completed document checks after deployment. X had already consumed its separate 100-request allowance before this deployment, so live X admission under the new pacing policy is not yet verified; its database fixtures pass. The synthetic empty-query comparison observes 16 polls versus 288 with fixed five-minute polling. This is scheduling evidence only: independent organic relevance, missed-opportunity recall, cross-cohort fairness and production-scale gates remain open. See [policy and interpretation](scoutalert-discovery-scheduling.md) and the [recorded snapshot](../../evaluations/discovery/performance-local.json).
