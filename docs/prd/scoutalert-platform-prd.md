# ScoutAlert — Platform PRD

**Version:** 0.2

**Date:** 29 September 2026

**Status:** Platform product direction and proposed delivery baseline

**Scope:** The complete opportunity scouting lifecycle and platform operations

## 1. Product direction

ScoutAlert is a continuously operating opportunity intelligence platform. Each person can operate persistent personal Scouts that understand their goals, discover relevant opportunities, investigate important unknowns, evaluate suitability, monitor changes, and deliver useful recommendations.

The product must become advanced, robust, and efficient while preserving user control and evidence quality. Its continuing discovery and intelligence work is central to the product. Onboarding establishes the initial brief and is one supporting feature.

The product loop is:

**Understand → Confirm → Discover → Investigate → Evaluate → Recommend → Monitor → Notify → Pursue → Learn.**

Implementation milestones cover increasing capability, coverage, and operating scale. They do not cap the architecture or remove platform capabilities from the product direction.

## 2. People and goals

Support individuals across professions, experience levels, languages enabled by the product, and local and international markets. Search quality must account for different kinds of work and opportunities rather than assuming one profession, geography, or compensation model.

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

Jobs, paid contracts, and scouting demand for a person's services belong in the platform direction. Enabled categories and source integrations are release configuration, not universal coverage claims.

The working meaning of **services** is finding suitable demand for work a person can provide. It does not establish a separate career-services marketplace, payment escrow, or service fulfillment product. If the intended services include those capabilities, define their actors, transactions, and lifecycle explicitly before implementation. Preserve this as an open product decision rather than silently treating employment rules as sufficient.

Do not force non-employment categories into job-only fields. Shared opportunity identity, provenance, retrieval, and delivery infrastructure can support category-specific terms and policies.

## 4. Platform capability requirements

| Capability                 | Required behavior                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal entry and onboarding  | Interpret ordinary language, clarify consequential gaps, review a versioned specification, preserve guest/account boundaries, activate a persistent Scout           |
| Profiles                   | Maintain confirmed background, qualifications, portfolio/document references, availability, and aspirations separately; optional imports remain reviewable          |
| Scouts                     | Multiple independent goals; create, edit, pause, resume, archive, duplicate; versioned policies, schedules, and lifecycle                                           |
| Discovery                  | Continuously collect supported sources; adaptive refresh, change detection, source health, targeted discovery, user-submitted opportunities                         |
| Opportunity knowledge      | Canonical opportunities and meaningful variants; employer/client identity; versioned source records, terms, status, evidence, and change history                    |
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

Scouts provide a persistent product experience. That does not prescribe one permanently growing workflow execution per Scout.

## 5. Discovery and coverage

Maintain a source registry with category/geography coverage, access and reuse policy, connector version, refresh interval, completeness semantics, cursor, failure state, and last successful scan.

Before enabling a category for release, name its initial sources and demonstrate live collection. Record refresh expectations and coverage gaps. An empty result set must remain distinguishable from unsupported coverage, partial scans, source failures, and a complete scan without suitable opportunities.

Collect and process shareable public content once per meaningful source version. Personalized evaluation uses private confirmed data. Targeted research can address gaps without repeating a full public-source crawl per user.

Retain published-at, first-seen, last-successfully-checked, and known closure/deadline times separately. A failed response or missing item in an incomplete scan cannot automatically close an opportunity.

## 6. Evidence and matching quality

Important conclusions reference actual source versions and passages or structured fields. Evidence includes its scope, freshness, extraction/validation versions, conflicts, and access/reuse scope.

Professional fit does not cancel a confirmed hard conflict. Unknown does not mean eligible or ineligible. Remote does not imply worldwide availability. A client's project budget does not imply an annual salary. A learned preference cannot rewrite confirmed experience or mandatory requirements.

Retrieval must be broad enough to find useful alternatives and precise enough to control downstream cost. Evaluate false exclusions as well as weak inclusions. Final rankings are prioritization signals, not hiring or contract-win probabilities.

Research returns supported evidence, conflicts, or an explicit unresolved outcome. More model reasoning cannot manufacture absent evidence. Result limits are maxima; recommendations are not filled with weak items to meet a quota.

## 7. Alerts and continuing monitoring

Discovery cadence and delivery cadence are independently configurable. Dashboard-only Scouts continue discovery.

Prompt alerts should support highly relevant newly discovered opportunities, with configurable urgency, thresholds, quiet hours, and frequency limits. Digests combine current recommendations across Scouts for a recipient. Change alerts and reminders use validated material changes and deadlines.

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
- Restore and recovery procedures are exercised before broad release.

## 10. Operating targets

Targets must be recorded with workload, category/source coverage, region, percentile/window, owner, and alert/response policy. The following are required measures; numeric budgets remain to be established through capacity tests and beta evidence.

| Measure                  | Required definition                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Source freshness         | Publication/change to successful observation where a reliable source timestamp exists; configured refresh and collection lag                 |
| Recommendation freshness | Observation to eligible published recommendation, including research escalation                                                              |
| Alert latency            | Eligible publication to provider submission for prompt alerts; scheduled-window adherence for digests                                        |
| Retrieval quality        | Recall@K and false exclusions across categories, languages, geography, and restrictive filters                                               |
| Recommendation quality   | Ranking usefulness, unsupported claims, hard-conflict violations, uncertainty handling, user corrections                                     |
| Research quality         | Question resolution, evidence validity, unnecessary calls, missed evidence, stopping quality                                                 |
| Reliability              | Availability, dispatch/execution/index lag, recovery time, retry and duplicate-effect rate, restore evidence                                 |
| Efficiency               | Cost per processed opportunity, active Scout period, research case, and useful recommendation; cache/research reuse and resource utilization |
| Delivery quality         | Suppression correctness, ambiguous submissions, bounces, complaints, provider-reported outcomes                                              |

Do not claim a production service level or cost target without defining the test workload and measuring it. Critical consent, authorization, constraint, and evidence regressions block release independently of aggregate quality scores.

## 11. Delivery milestones

1. **Platform foundation:** Domain ownership, public contracts, persistence/versioning, dependency enforcement, execution interfaces, source registry, evaluation fixtures, and operating metrics.
2. **Complete scouting loop:** A confirmed Scout, a live supported source, canonical evidence, retrieval, assessment/research, durable recommendation, an eligible alert, user feedback, and fault recovery.
3. **Production breadth:** Multiple Scouts and sources, service-opportunity policies, recurring monitoring, prompt/digest coordination, opportunity workspace, support, usage/entitlements, and operational recovery.
4. **Advanced intelligence and scale:** Richer representations, measured reranking, wider categories/languages, assistance/integrations, curated models, independent worker scaling, and search/event/analytics infrastructure when measured requirements justify it.

Deliver vertical slices through the complete product loop. A working onboarding flow alone does not satisfy the first complete scouting-loop milestone. Sequence features within milestones through the platform backlog without removing them from this product direction.

## 12. Related documents and open decisions

The [platform user stories](../user-stories/scoutalert-platform-user-stories-v0.1.md) contain detailed acceptance criteria. The [platform architecture](../architecture/scoutalert-platform-architecture-v0.1.md) defines implementation boundaries, and the [repository layout](../engineering/scoutalert-repository-layout.md) defines their code locations.

Open release decisions include named initial sources and refresh targets, exact services beyond client-work scouting, enabled categories/languages, commercial plans, external action permissions, providers, retention, operating budgets, and measured execution-engine adoption. They refine delivery; they do not reduce the full platform scope.
