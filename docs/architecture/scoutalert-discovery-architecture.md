# ScoutAlert — Internet Discovery Architecture

**Version:** 0.4

**Date:** 2 October 2026

**Status:** Agreed target design; broad web and social discovery are not implemented by this document

**Authority:** Specializes the [platform architecture](scoutalert-platform-architecture-v0.1.md). Product scope belongs to the [platform PRD](../prd/scoutalert-platform-prd.md); delivery gates belong to the [discovery acceptance criteria](../engineering/scoutalert-discovery-acceptance.md).

**Implementation note (1 October):** new AI-enabled local cases now separate alternative public role targets, review source evidence during discovery, and select from policy-approved queries and observed links. Public research reuses captured application/employer pages for cited eligibility, requirements and deadline findings. A bounded live synthetic search-to-Mailpit path and a negative location-restriction case are recorded. Learned query yield, unrestricted semantic expansion, broader source-protocol admission, native social integrations, independent quality and production scale remain open. See [implementation evidence](../engineering/scoutalert-web-discovery.md); the architecture below remains broader than this increment.

**Implementation note (2 October):** complete source reviews now admit shared URL monitoring, bounded persistent link expansion, adaptive revisit intervals and source-only outbox runs feeding the existing matching/delivery pipeline. A two-scout controlled update reached Mailpit without duplicate delivery; native Temporal retry/replay and database budget/ownership checks pass. Public HTML/text URLs are supported; independent organic yield, additional feed/stream protocols and scale gates remain open.

## 1. Product commitment

ScoutAlert discovers opportunity signals across the publicly discoverable internet and authorized connected sources. Jobs, contracts, international remote client projects and requests for a person's services are first-class goals. A useful signal may be an informal post or discussion before a formal listing exists.

Coverage expands through general and specialized search, native platform integrations, streams, feeds, focused crawling, permitted community and email inputs, partnerships, user submissions and ScoutAlert's own index. Named providers are examples and release integrations, never an architectural ceiling. Private or inaccessible content remains an explicit coverage gap; discovering a URL does not establish permission or ability to retrieve its contents.

Runtime budgets bound individual attempts. They do not permanently bound supported providers, languages, regions, source count or the number of agent specializations. A stopped run records why it stopped and whether later continuation is appropriate.

## 2. Continuous collection and personal scouting

Two complementary loops share evidence:

```text
Shared discovery
  known-source monitoring + web/social search + reserved source exploration
    → candidate URLs/posts/feeds → admitted fetch → leads and evidence
    → opportunity index → changed-opportunity routing to plausible Scouts

Personal scouting
  confirmed goal + coverage gaps + current requirements
    → versioned discovery plan → index retrieval and targeted external discovery
    → assessment → consequential research → current recommendation → eligible alert

Useful discoveries
  new domains/accounts/feeds → source candidates → policy/capability validation
    → monitored source registry → future shared discovery
```

An adequate indexed shortlist can satisfy a current read without stopping shared external exploration. Reserve a configurable exploration allocation and freshness schedule even when existing results are strong. Monitor whether popular sources, languages, regions or accounts starve smaller cohorts. Dashboard-only Scouts still receive discovery; a paused Scout cannot publish or notify, while public collection may continue for other Scouts.

## 3. Four initial agent responsibilities

An agent chooses a next action from permitted tools using observed results. A single structured model call is an AI service, not inherently an agent. Agent type, logical run, concurrent execution slot and worker process are different units.

| Agent                   | Owns                                                                               | Trigger and persisted output                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Scout Planner           | Search strategy, query families, source mix, gap priorities and proposed intensity | Activation, material brief change, stale plan, weak coverage or poor yield; produces a versioned `DiscoveryPlan`              |
| Deep Discovery Agent    | Iterative searches, result inspection, context following and query reformulation   | An admitted discovery case; produces evidence-linked leads, source candidates, coverage observations and continuation state   |
| Evidence Research Agent | Investigation of consequential unresolved or conflicting facts                     | An admitted research case; produces scoped evidence proposals and explicit supported/conflicting/unresolved question outcomes |
| Source Expansion Agent  | Discovery and evaluation of additional useful source instances                     | Shared coverage gaps and discoveries; produces source candidates and validated monitoring proposals                           |

Extraction, demand classification, embeddings, retrieval, fit evaluation, ranking and message rendering remain focused services unless a particular task needs iterative tool choice. Application policies authorize tools, budgets, source activation, publication and delivery. An agent cannot rewrite confirmed constraints, grant itself access or directly send an email.

Source expansion is shared platform work. It can activate a source under an existing adapter and an explicit automatic-admission policy; unsupported protocols require an implementation and contract tests. Agent output never becomes executable connector code automatically.

## 4. Plans, cases and action selection

A `DiscoveryPlan` contains its identity/version, owner scope, Scout and confirmed-specification revisions, relevant profile version, goal/category, concept and query families, geography and language strategy, mandatory constraints, source capabilities, monitoring interests, freshness objectives, budgets, policy versions, expiry and replanning conditions.

External query plans use the minimum relevant public search intent. Private profile text, identity, credentials, sensitive facts and confidential submissions do not enter globally shared query keys or source-expansion memory. Outbound provider disclosure follows the data-use policy for that task.

Query portfolios cover exact and related terminology, skills and deliverables, buyer/hiring language, regional and multilingual wording, organization/person monitoring, domain-focused queries, freshness windows and long-tail exploration. Exclusions are evaluated for false negatives; a negative keyword must not erase an otherwise relevant informal request. The planner preserves hard requirements rather than silently broadening them to improve yield.

Each agent case records:

- Logical case ID, type, input revisions, access scope and reason for admission.
- Questions or discovery objective, existing evidence IDs and known gaps.
- Allowed tool capabilities and source/network policy version.
- Reserved monetary/request/token budgets, deadline, attempt limits and concurrency class.
- Actions, observations, provider result identities, evidence proposals and usage.
- Terminal result or a resumable continuation with unresolved gaps and next eligible time.

Cases can finish as completed, partial, exhausted, blocked by access, failed, cancelled or superseded. These outcomes do not imply internet-wide completeness. Resuming uses the same remaining logical budget or a separately recorded new admission; retries cannot reset allowances.

Select actions using expected useful discovery, novelty, evidence value, freshness, marginal cost and observed provider health. Begin with explainable policies and measured query performance. Introduce learned selection only against a baseline, preserving exploration and cohort coverage. A model's self-reported confidence is not a substitute for outcome measurement.

## 5. Provider capabilities and source instances

The provider registry records implemented capability, configuration version, credential reference, access/reuse scope, language/region coverage, category coverage, costs, quota units, latency, health, cursor semantics and recovery support. Credentials remain in infrastructure secret storage.

| Capability    | Contract must preserve                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Search        | Query/filter semantics, language/region controls, result provenance, pagination, freshness window, truncation and partial-result state |
| Stream        | Durable acceptance boundary, reconnect/replay mechanism, offsets or watermarks, delivery gaps, edits/deletions and duplicate events    |
| Feed/snapshot | Complete versus windowed membership, cursor, item versions and absence semantics                                                       |
| Fetch/render  | Canonical URL and redirect chain, access decision, content type/size, timestamps, extraction coverage and document version             |
| Monitor       | Entity/query/source identity, cadence, change watermark, due state, failure history and recovery                                       |
| Research      | Question scope, cited documents, evidence applicability, unresolved outcomes and tool usage                                            |

A common planning vocabulary does not flatten these into one lossy `discover(): Promise<Result[]>` contract. Core owns provider-independent business types; adapters preserve useful native provider capabilities and translate vendor errors and responses.

Distinguish an **adapter** from a **source instance**. One feed adapter can serve many approved feeds; one recruitment-system adapter can serve many company boards. New instances generally require validated registry data. A new protocol or capability requires code, tests and operational configuration.

Provider families include general/regional search engines, native social platforms, recruitment systems, marketplaces, focused crawlers, RSS/Atom and structured feeds, sitemaps, licensed data, newsletters, user-authorized communities and user submissions. This is an extensible taxonomy, not an exhaustive provider enum scattered through business code.

## 6. Web, social and alert discovery

### Web search

Use multiple evaluated provider options over time. Measure their incremental useful coverage rather than assuming more providers always improve results. Track query, filters, execution time, result rank, returned URL, snippet, completeness and provider identity. A snippet is a discovery observation; it is not sufficient evidence for every eligibility or availability claim.

The first delivery work includes a general web-search adapter and a separate native X discovery path. Actual access and enabled capabilities must be recorded before either is called connected. Publicly indexed LinkedIn results can supply leads; authorized integrations and content retrieval have separate adoption checks. Search-engine results cannot establish complete LinkedIn coverage.

### Native social sources and communities

Recognize requests, hiring announcements, recommendations/referrals, offers of services, discussion, spam and irrelevant content separately. Preserve author/platform identity, source post ID, thread relationships, linked documents, language and timestamps where available. Author location does not prove applicant restrictions. Reposts, quote posts and replies can refer to one opportunity without being interchangeable evidence.

Support relevant context retrieval where permitted. Image/document extraction is an evaluated capability with original references and extraction uncertainty, not a guarantee that every attached artifact is understood. Do not discard a promising lead merely because a formal application link or budget is missing.

### Standing searches and Google Alerts

ScoutAlert owns durable standing queries and comparison of observed results over time. A search result disappearing is not proof that an opportunity closed. Refresh intervals respond to urgency, source activity, demand, quotas and freshness targets.

Google Alerts can contribute authorized forwarded email or other supported inbound delivery. It is an optional signal, not the discovery scheduler or a presumed general search API. Inbound messages and their links remain untrusted source data. Source authorization and account scope are preserved; an inbound alert does not authorize outgoing messages or global reuse of private mail.

## 7. Source expansion and the crawl frontier

Source candidates record discovery origin, proposed entity/domain/feed, capability clues, access/reuse decision, expected coverage, language/category, supporting evidence, duplicate checks and next validation action. Lifecycle is candidate → validating → enabled, rejected or deferred; enabled sources can be paused or revoked.

Admission occurs **before fetching**. Validate schemes, resolved network destinations, redirects, source permissions and applicable crawl policy. Repeat destination checks on redirects and connections. Newly found public domains can pass the policy without a code change; private network endpoints or inaccessible content cannot bypass it.

The focused crawl frontier owns canonical URLs, visit priority, per-host scheduling, deduplication, fetch leases, revisit times, failure backoff, content versions and retention class. Protect against crawl traps, unbounded query parameters, enormous documents and repeated low-value pages. Use conditional fetches where supported. Browser rendering is a separately budgeted fallback for sources that need it.

Discover structured endpoints, feeds, sitemaps, careers pages and relevant outbound links. Preserve why a page was scheduled and what useful lead/source it produced. Source expansion accepts data through configured adapters; it does not disable access checks because an agent wants broader coverage.

## 8. Leads, observations, opportunities and evidence

These records have separate identities:

| Record                  | Meaning                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Discovery observation   | A provider returned a URL/post/item at a particular time under a query or stream context |
| Opportunity lead        | A potentially relevant demand signal, possibly informal and incomplete                   |
| Source document/version | The admitted content or permitted pointer/metadata supporting interpretation             |
| Opportunity and variant | A normalized opportunity with category-specific terms and materially distinct variants   |
| Evidence claim          | A scoped value with supporting passage/field, source version, validation and freshness   |
| Private assessment      | A versioned comparison with one owner's confirmed requirements                           |

Leads can be unresolved, under investigation, linked to an opportunity, rejected with a reason, or stale/withdrawn. A lead need not contain a company name, role title, compensation, application URL or confirmed open status. Unknowns are represented, not fabricated to satisfy a posting schema.

Classification distinguishes buying/requesting work from selling/advertising services. Employment, hourly services and fixed-price projects preserve their own terms. Original wording and language remain available under retention policy; translations link back to the original evidence and have method/version metadata.

Deduplication uses source identity, canonical URLs, linked entities and evaluated similarity. It preserves location, arrangement, pay, scope and deadline variants. Merges are auditable and reversible; propagated identity changes coordinate assessment invalidation and notification suppression.

Trust has separate dimensions: source authenticity, content provenance, opportunity availability and claim support. A verified account or official-looking domain does not prove every claim. Record suspicious signals and quarantine decisions without presenting an unsupported safe/scam certainty. Low trust cannot silently become a verified prompt alert.

## 9. ScoutAlert-owned index and retrieval

The owned index is a core capability from the first discovery slice. PostgreSQL initially holds durable records and rebuildable keyword projections; evaluated semantic retrieval can extend them. This does not require an internet-sized index or a separate graph database on day one.

Index permitted lead/opportunity content, concepts, source and organization relationships, evidence references, language, geography, category and freshness. Keep private submissions and personal assessments in access-scoped projections. A logical opportunity/evidence graph describes relationships; its storage technology remains a measured choice.

Share public fetching, extraction, classification and embedding per compatible content/version. Coalesce equivalent public query work using provider, query semantics, language, region, access scope, policy and freshness window. Do not share privileged results solely because URL or text is identical. Prevent stampedes with bounded leases and durable completion identity.

Opportunity changes route to plausible active Scouts; Scout changes retrieve existing candidates and trigger targeted discovery where necessary. Broad/uncertain goals retain catch-all routing and periodic reconciliation. Retrieval and routing are evaluated for false exclusions, including rare professions and underserved regions.

## 10. Evidence research and recommendation gates

Research questions remain individually tracked, but related questions can share one case, fetched document and evidence cache. Reuse requires compatible entity, opportunity/role applicability, question, geography, engagement type, source version, access class and freshness. General employer policy cannot override a more specific restriction.

Research results propose supported, conflicting or unresolved facts. Deterministic validation controls their acceptance and whether another assessment is needed. Unavailable evidence stays unresolved at budget exhaustion. Expensive research is selected for its likely effect on a decision; unresolved facts do not automatically justify a stronger model.

Persist private assessments separately from shareable evidence. Before publication or delivery, recheck owner, Scout lifecycle and revision, evidence/opportunity version, availability, uncertainty policy, consent and suppression. Leads with unresolved facts may appear in an explicitly provisional review area according to policy. Prompt alerts require the agreed verified exceptional-match standard; a high score cannot replace required supported criteria. Scheduled digests follow their explicit uncertainty policy.

## 11. Execution, transactions and recovery

Temporal is the selected durable workflow foundation and is already used locally. Deterministic definitions sequence activities, waits, retries and cancellation. Agent tool choice happens inside bounded application steps/activities, with durable observations and action identities. No workflow imports database, model, search or browser clients.

PostgreSQL transactions commit accepted observations/leads, version changes and downstream outbox intent together. Store stream/batch progress atomically with accepted durable work where the provider protocol permits. Acknowledge only after durable acceptance. Retry duplicates safely; do not lose leads after an acknowledged cursor advances. If replay is unavailable, record a gap and attempt bounded backfill or disclose it.

Record complete, windowed, truncated and failed scans distinctly. Absence from search results, a partial feed or a broken stream never closes an opportunity. Edits/deletions trigger version changes and dependent invalidation; permission revocation propagates to permitted caches, indexes and retained evidence.

External effects and paid calls execute outside database transactions. Fenced leases protect ownership; stable action identities, reservations, timeouts and reconciliation handle retries. An ambiguous provider response can still incur cost. Email submission has no universal exactly-once guarantee; preserve the existing delivery ledger and ambiguity handling.

Finite workflows and bounded histories avoid permanently growing per-user histories. New workflow versions need replay/compatibility tests. High-volume ingestion and product event replay are separate responsibilities from workflow history; adopt a dedicated event system only when measured workload requires it.

## 12. Global scheduling and capacity

Scale search I/O, streams/collection, fetching/rendering, extraction/indexing, private matching, evidence research, source expansion and delivery independently. Four agent types do not mean four processes or four agents running for every user. Routine updates can reuse a plan and evidence with no new agent case.

Scheduling enforces provider request/token limits, per-host politeness, account/plan fairness, deadlines, global budgets and reserved exploration capacity. Provider quotas and access remain real throughput constraints even when worker capacity increases. Superseded work releases unused reservations and cannot publish.

Each capacity decision declares arrival rate, task mix, service-time distribution, quota envelope, cache hit rate, target queue delay, database/index load and headroom. Little's Law can estimate average in-flight work; tail latency, burst recovery and provider limits still need load tests. Illustrative concurrency numbers are never production capacity evidence.

Private account state has an explicit home region and failover ownership. Collection has a designated owner/lease to prevent duplicate regional work. Shared evidence distribution follows access and residency policy. Failover fencing, replication lag, restore and deletion propagation must be tested before a multi-region claim.

## 13. Measurement and release evidence

Measure distinct stages: provider discovery, lead detection, source coverage, extraction, retrieval, personal assessment, research and notification. Include provider overlap, newly found sources, lead-to-useful-opportunity conversion, false exclusions, duplicate ratio, queue age, freshness, cost and failure recovery.

Report cohorts by category, language, region, source family and common versus rare goals. Hold out sources and time periods. Independent reviewers label known opportunities and relevance without seeing model verdicts; model-generated labels are not independent validation. Whole-internet recall cannot be measured against an unknown denominator. Report recall on a defined sample plus observed coverage gaps.

The [evaluation protocol](../../evaluations/discovery/README.md) defines evidence to collect. The [acceptance criteria](../engineering/scoutalert-discovery-acceptance.md) define pass/fail behavior and the [delivery roadmap](../engineering/scoutalert-delivery-roadmap.md) sequences implementation. Documentation approval does not pass those gates.

## 14. Provider adoption notes

The following facts were checked against official documentation on 1 October 2026. Recheck before implementation or commercial commitment; these notes do not select a vendor or claim credentials exist.

- [X post search](https://docs.x.com/x-api/posts/search/introduction) exposes recent and archive search with different access requirements. Enabled endpoints, recovery windows and quotas must be recorded for our account.
- [Google Custom Search JSON API](https://developers.google.com/custom-search/v1/overview) is closed to new customers; existing customers must transition by 1 January 2027.
- [Microsoft Bing Search API retirement](https://learn.microsoft.com/lifecycle/announcements/bing-search-api-retirement) took effect on 11 August 2025. Do not implement against the retired API as a live provider.
- [Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search/) returns model-synthesized answers with citations and search metadata. Evaluate research suitability separately from raw result discovery and storage/reuse requirements.
- [Google Alerts](https://support.google.com/websearch/answer/4815696?hl=en) is a topic-email service. Optional authorized inbound alerts supplement ScoutAlert's own monitors.
- [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) has permission-scoped access. Public index discovery, authorized API access and full-content availability are separate capabilities.

Search providers must pass real result-quality, incremental coverage, retention/attribution, privacy, latency, failure-recovery and cost checks. No particular search engine, social platform, model vendor or orchestration library defines the platform's maximum scope.
