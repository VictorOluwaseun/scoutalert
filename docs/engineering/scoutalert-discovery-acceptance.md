# ScoutAlert — Discovery Acceptance and Release Gates

**Version:** 0.4

**Date:** 10 October 2026

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

### DACC-021 — Preserve useful candidates beyond literal wording

Given observed listings or buyer requests that express a confirmed goal using different words, when a model-enabled case selects its next action, then those sources can enter a bounded action menu without a literal target-word match. Menus retain provenance, source/excerpt distinctions, access policy and frozen budgets. Source-reviewed negative pages and their links remain excluded; provider failure uses a conservative fallback.

Given a fresh source-reviewed posting discovered by that case, matching can pass it to the same current scout's private assessment even if full-text retrieval misses it. A candidate is not a recommendation. Verify ownership, scout/posting versions, source fingerprint, freshness, hidden feedback, current requirements and alert policy. Replay must not invent or duplicate actions. Record inclusion and routing separately from end-to-end recall, and compare on independently labeled held-out cases before claiming a quality gate passed.

## 4. Gate groups and required evidence

| Gate                            | Required evidence                                                                                         | Current status                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery foundation            | Lead/plan/provider contracts, persistence invariants and adapter contract checks; DACC-003, 006, 007, 009 | Partly implemented: public contracts, durable reuse/admission, incremental source review, alternative-role planning and bounded model-selected actions; expanded gates still open    |
| Live web and native social path | Actual configured providers; DACC-001, 002 and 018, plus current recommendation/delivery gates            | One synthetic live Serper → research → private fit → Mailpit case passed; native social gate remains open                                                                            |
| Continuous expansion and reuse  | DACC-004, 005, 010, 011, 013, 016 and 017                                                                 | Partial: shared page monitoring, bounded link expansion, current-scout dispatch and controlled Mailpit checks pass; organic source yield, feed/stream recovery and scale remain open |
| Quality and efficiency          | DACC-012, 019 and 021 with independent judgments and declared thresholds                                  | Diagnostic same-brief baseline comparison recorded; independent labels, missed opportunities and release thresholds still outstanding                                                |
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

## Live pacing evidence — 4 October

The worker resumed after a local stop, admitted its three-request startup burst and then waited 13 minutes 18 seconds before a fourth successful X search. The [dated audit](../../evaluations/discovery/native-pacing-2026-10-04.json) reconciles all four requests/$0.20 with the existing caps and retained prior-day ledger. Four fixed-window comparisons have no unexplained gap; three pagination windows remain unfinished. Current incomplete/non-demand source reviews promoted no postings. Seventeen source reviews were ready; four failed and eight unstarted reviews remain explicit. This closes the first live pacing/resumption check, not the independent quality, complete-pagination or scale gates. The successful-retry status cleanup passes its regression and preserves failed attempt history; [operating details](scoutalert-discovery-scheduling.md#live-pacing-verification--4-october-0346-wat) distinguish that defect from earlier provider errors whose cause was not reproduced.

### Recovery and bounded local load — 4 October

Recovery now covers cases superseded before review starts, expired review windows and due transient failures while preserving current ownership, leases, source observation times, reservations and the two-attempt ceiling. The deployed [04:18 WAT snapshot](../../evaluations/discovery/review-recovery-2026-10-04.json) shows all 48 current retained native posts reviewed and no incomplete/non-demand publication violations. This closes the observed stuck-review defect, not every historical failure or future queue.

A 50,000-posting import exposed a ten-second statement timeout. Bounded SQL batches within the same atomic source transaction resolved it; late-batch rollback and duplicate-ID checks pass. The [local workload](../../evaluations/discovery/retrieval-load-after-2026-10-04.json) completed at 1,000, 10,000 and 50,000 postings, with no unavailable queries. At the largest size and concurrency eight, retrieval p95 was 312.73 ms. This provides limited local evidence toward DACC-020; burst/soak tests, provider contention, deployed capacity and regional recovery remain unverified.

Ninety-one focused worker tests and seven evaluation-integrity checks pass. The frozen 56-pair human review packet remains unlabelled, so no independent relevance or recall score is reported. The coverage audit records 241 indexed LinkedIn leads with zero original-source reviews; broader coverage and source-access work remain open. See the [complete operating record](scoutalert-discovery-scheduling.md#review-recovery-and-load-check--4-october-0418-wat).

## Deeper source discovery — 4 October

The first deeper-source increment adds observed public GET searches and bounded rendering for thin JavaScript pages. Acceptance requires the source portal → submitted query → rendered result → observed detail-page chain, preserved parent provenance, private-intent exclusion, shared capture reuse, bounded resource cancellation and explicit incomplete outcomes. The cases cover employment, contract and service demand; discovering a page alone does not establish a verified personal match.

Implementation and test commands are in [deeper source discovery](scoutalert-deeper-source-discovery.md). The live checks distinguish a successfully rendered public demonstration from an unsupported employer portal. Wider form/widget support, authenticated access, multilingual discovery, independent quality, coverage and production-scale gates remain open.

### Public API fallback and later result pages

A previously unreadable Ashby board must yield listed source records through its documented public API while preserving original job URLs and API provenance. Unlisted, malformed, cross-board and conflicting records cannot become published demand. Directory/detail cache reuse preserves observation time and consumes one provider fetch; stale lease completion cannot overwrite a newer holder.

A public source form → first results page → observed next page → specific demand chain must execute with durable parent/depth records under unchanged document and spending ceilings. Repeated result sets, reordered query aliases, hidden controls and excessive page/depth/action counts must stop expansion. These gates establish access and routing mechanics; independent relevance and global coverage remain open.

## Private email connection increment — 5 October

The first private-source slice implements explicit Google readonly consent, user-label selection, requested durable imports, owner-isolated encrypted evidence and disconnect erasure. Twenty-four focused provider, application, PostgreSQL and HTTP checks pass. Google credentials are absent; no real account has been connected or imported. Automatic recurring mailbox discovery and private matching/research/notification acceptance remain open. See [private email connections](scoutalert-private-mail-connections.md) for full acceptance evidence and bounds.

A private email cannot satisfy public-evidence acceptance or become a verified recommendation merely because import succeeded. Revoked or superseded work must not restore deleted imports; no grant or email body may enter public caches, model prompts or workflow history in this increment.

## Public feed increment — 10 October

The feed portion of the continuous expansion gates now has implemented RSS 2.0/Atom reads, observed head advertisements, bounded entry windows, parent-linked exploration, shared monitoring and deterministic directory recognition. A feed must never publish as a listing or supply private-fit facts. Its child remains a probe until separately captured and reviewed. Repeated imports must reuse public work across owners without exposing private scout associations. Empty valid windows must remain monitorable; malformed XML and denied crawl policy must remain explicit failures.

100 focused checks pass, including two-owner reuse and changed-feed dispatch in an isolated database. Six optional browser checks were not enabled in this pass. One documented public feed and one linked source page were read successfully; no live scout subscription, recommendation or email was created. See [access limits and evidence](scoutalert-deeper-source-discovery.md#public-rss-and-atom-discovery--10-october).

This is partial DACC-005/010/011/013/017 evidence. Broader feed formats, push/stream recovery, archive completeness, organic source yield, independent match quality and deployment-scale gates remain open. SMTP setup is independent of this increment.

## Contextual routing and live feed persistence — 10 October

DACC-021 is partly implemented: new model-planned cases offer bounded, diverse observed candidates beyond exact words; matching admits up to eight current source-reviewed discoveries for their owning scout alongside full-text results. Unit and database checks cover menu limits, fallback, observed-action validation/replay and private assessment with ownership/version/fingerprint/freshness guards. The six-case development comparison improved expected routing from 2/6 to 6/6; it does not replace independent quality evidence. See [the report and method](../../evaluations/discovery/README.md#contextual-routing-and-live-feed-persistence--10-october).

The real feed diagnostic adds durable DACC-005/010 evidence: a single public capture and zero-call directory review were reused by two synthetic owners, with one monitor and four probes registered in an isolated database. It used a supplied seed, not live search, and ran no child assessment or delivery. Neither result closes the broad discovery, independent quality or production-scale gates. The account worker was not restarted while its normal database was stopped.

### Sitemap and access-outcome evidence — 10 October

DACC-005/010/011/013/017 now also cover same-origin robots-advertised XML sitemaps and sitemap indexes. Required behavior: save parent provenance, respect each target's access policy and existing budgets, record retained/omitted entries, share public captures, classify collections without model cost, and keep every child unassessed until independently read. Sitemap dates, absent entries and missing HTTP pages must never independently establish eligibility or closure. Denied pages may expose other explicitly advertised permitted paths; site-wide denial/throttling must not be evaded.

Controlled database checks pass for index-to-sitemap-to-detail discovery, two-owner reuse and changed-map monitoring. Unit checks cover XML/namespace admission, bounded gzip, redirect policies/loops/hop limits, private-address/credential rejection and page-versus-host access failures. Dashboard details show known access reasons, while historical responses without a reason remain compatible.

The live sample adds 78 URLs relative to a bounded homepage capture, including directory/filter pages; no independently assessed new match is claimed. Large maps, cross-site sitemap submissions, resumable coverage, measured organic yield and deployment-scale evidence remain open. See [implementation and receipts](scoutalert-deeper-source-discovery.md#advertised-sitemaps-and-checked-redirects--10-october). These checks extend the gates; they do not close the full platform's coverage or quality gates.

## Live search and fit correction — 12 October

Seven bounded real-provider runs now cover employment, client projects and service requests using predefined synthetic briefs, isolated PostgreSQL schemas and local Mailpit. The [results and limitations](../../evaluations/discovery/README.md#live-search-quality-checks--12-october) retain unsuccessful runs, source-access failures, token cost estimates and the original false-positive email. They do not establish independent precision, missed-opportunity recall, global capacity or useful-result cost.

The following regression gates pass:

- Account/sign-up and automated-application marketing links are excluded from candidate navigation even when labelled “Apply now”; valid listing pages containing sign-in instructions remain eligible. An observed redirect destination cannot be selected again as a new page in that case.
- Source-backed experience conflicts exclude a recommendation. A narrowly supported numerical shortfall must override an incorrect positive model verdict; ambiguous tenure, unrelated experience and preferred criteria must not invent a shortfall.
- Current assessments use `supported-criteria-v4`. Older persisted AI assessments are withheld from digest and prompt delivery until reassessed. Cached extraction/fit proposals are checked against current domain rules without requiring a model call solely for the policy revision.
- One grouped delivery is captured in Mailpit; retrying does not send a second digest. Isolated delivery tests cover current consent, ownership, freshness and assessment policy. The historical live job digest contained two candidates, including the subsequently rejected experience mismatch; it must not be cited as two useful matches.
- Live reports count all case leads separately from the dashboard's 40-item sample, preserve missing cost estimates and distinguish complete from incomplete browser captures. Browser diagnostics use the worker's validated rendering default.
- Web lint checks real TypeScript/TSX and fails on unused values or syntax errors. Browser checks cover onboarding restoration, Back/Forward and rejection of a stale review after editing.

The saved job replay changes two accepted candidates to one reviewable candidate, with unresolved skills and authorization explicitly retained. Both project runs and all service runs produced zero accepted matches. The rendered service case still encountered denied social access, an incomplete portal capture and a seller page. These results keep the organic demand-quality and useful-coverage gates open. Next evidence must include readable client demand, independently judged results and a known-opportunity set for recall; increasing URL counts cannot substitute for those outcomes.


## Buyer-request routing increment — 12 October

New client-project/service plans now use distinct buyer-demand query families and a bounded, diverse candidate menu. The [implementation and six-run record](../../evaluations/discovery/README.md#client-demand-search-refinement--12-october) preserve failures as well as improvements. The discovery, source-expansion and contextual-routing gates gain these regression requirements:

- Buyer queries use only approved public target words. Splitting a skill stack or omitting “remote” from retrieval must never alter the confirmed private brief or weaken required fit criteria.
- Specific relevant client requests survive a crowd of employee vacancies, seller pages and unrelated tenders. Observed directory children carry parent context as a hint, never as verified child evidence. Alternative wording remains eligible for semantic inspection.
- Generic previous/next listing navigation cannot consume a demand investigation. Descriptively labelled related opportunities remain eligible.
- Failed access must influence the next action. Repeated crawl-denied siblings pause only that route within the case; another path or native connector is not prohibited by inference.
- No refined search is admitted after all document reads are consumed. Search/page/depth/model ceilings, durable admission and current ownership remain authoritative.
- Buyer/source classification remains separate from personal relevance and delivery. Closed notices, incomplete captures, unresolved mandatory requirements and supported conflicts cannot be promoted merely to produce a successful-looking result.

The final full-path project run reached a specific website-services tender and matching rejected its Drupal-versus-React/TypeScript conflict. The service run found a concrete website buyer brief with an incomplete capture. Neither produced an accepted match or email. Final planner v7 passes the six-case development routing packet after a retained v6 buyer/seller error; this is not a held-out or independent quality score. Readable matching client requests, independently reviewed usefulness, missed-opportunity recall and global operating gates remain open.

### Primary buyer captures and relative deadlines — 12 October

DACC-005/010/014 now require primary buyer attribution when a page also contains supplier proposals or related requests. A full server-rendered client brief may use HTTP without rendering optional scripts, but completeness requires source identity and the expected closed primary sections. A broken layout, oversized brief or required-resource browser failure must not publish buyer demand. Sign-in-gated RFP summaries remain incomplete even if the summary itself loads successfully; sign-in to apply does not invalidate a readable brief.

A relative closing counter must not become an invented absolute deadline or automatically reject an otherwise open request. Normalization follows citation validation, leaves explicit calendar/conflicting evidence unchanged, versions reused reviews and preserves the original source text. New review policy versions must be admitted within the same budget and retry rules.

The [capture repair evidence](scoutalert-deeper-source-discovery.md#client-request-capture-repair--12-october) records two repaired marketplace captures, four withheld gated summaries and a seeded current-planner → private assessment → local Mailpit run. One reviewable recommendation is pipeline evidence; independent fit quality, currency interpretation and missed-opportunity measurements remain open.
