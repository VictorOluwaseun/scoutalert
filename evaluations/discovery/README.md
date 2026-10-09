# Internet discovery evaluation protocol

**Revision:** 0.7 · **Date:** 3 October 2026

**Status:** Planned benchmark protocol with recorded connectivity and bounded source-to-delivery smoke checks. Independent quality labels and global-scale benchmarks remain outstanding.

## Recorded connectivity check

[`latest-serper-smoke.json`](latest-serper-smoke.json) records the first live Serper contract check on 1 October 2026 at 20:20 WAT. One synthetic public query returned ten leads; PostgreSQL admission, owner isolation and terminal-case replay passed. The single checked source page restricted access, so the case remained partial. No models, real accounts or email were used. The $0.01 reservation is a configured bound, not measured billing.

Run `node scripts/check-web-discovery.mjs` for an explicitly requested live repeat after building core/adapters. Each invocation makes at most one paid search and one document operation in a disposable test schema, separately from the worker's daily ledger. This report establishes live connectivity and bounded persistence only; the benchmark protocol and release gates below remain open.

[`local-activation.json`](local-activation.json) records aggregate observations from the first scheduled local runs at 20:24 WAT: seven partial cases reused eight successful search operations and retained 57 leads. Six document operations captured two pages and recorded four access restrictions; 51 leads remained unchecked. The worker reserved $0.08 under its separate daily budget. This snapshot establishes that scheduled execution reached live search and storage, not that these leads passed matching or reached email.

This protocol evaluates the [internet discovery design](../../docs/architecture/scoutalert-discovery-architecture.md) against [DACC-001–020](../../docs/engineering/scoutalert-discovery-acceptance.md). Existing [opportunity-quality](../opportunity-quality/README.md) and [marketplace-discovery](../marketplace-discovery/README.md) results cover narrower implemented paths; preserve their original dates, inputs and conclusions.

## Recorded lead-review and delivery check

[`latest-lead-review.json`](latest-lead-review.json) records the `lead-evidence-v2` check on 1 October at 21:10 WAT. Two freshly recaptured public pages produced one specific job and one rejected directory. Four authored excerpt examples received the expected offer, discussion, buyer-request and closed labels; excerpt facts remained unknown and none was promoted. The job's extraction was reused for one private assessment of a synthetic brief, then fresh actionable source evidence enabled one ordinary Mailpit digest. Repeating delivery submitted no duplicate.

The check took 29.6 seconds, reserved $0.30 across four AI calls and estimated $0.0200 in model usage. Estimated costs use the repository's recorded pricing version and are not a provider invoice. This is a small diagnostic/integration sample. The job was already found by earlier local search and recaptured by URL; this run does not measure held-out source discovery, independent relevance, social platform coverage or multilingual recall.

[`initial-lead-review.json`](initial-lead-review.json) retains the first run, which exposed full-time/permanent terms misclassified as work arrangement. The separate fit policy kept location arrangement unknown, but the public facts were misleading. The provider schema now separates work arrangement from engagement, and deterministic citation/value validation downgrades unsupported arrangement facts. The second run correctly kept arrangement unknown and put employment under engagement.

Run `node scripts/evaluation/check-web-leads.mjs` only for an authorized live check after building core/adapters. Each invocation creates and removes its own schema in `scoutalert_test`, permits two public document reads and at most five AI reservations ($0.375), and binds SMTP to `127.0.0.1:1025`. Any test digest targets a synthetic `@scoutalert.test` address in Mailpit. The budget is separate from the local worker's shared daily ledger. Both diagnostic runs together used eight AI calls and produced two synthetic Mailpit digests. The script preserves unresolved results rather than relaxing policy to force mail.

## Recorded adaptive discovery check

[`initial-adaptive-discovery.json`](initial-adaptive-discovery.json) preserves the first live run that spent follow-up checks on restricted search results instead of captured directory links. The policy now prioritizes relevant observed links, preserves their page order, and defers a host after access fails within a case.

[`latest-adaptive-discovery.json`](latest-adaptive-discovery.json) records the corrected run: 55 leads, six Google-result requests through Serper, four document operations, four AI calls, about 48 seconds and a $0.36 configured reservation. Two observed directory links were fetched and accepted by cited demand review as jobs. This check uses no real account, private-fit evaluation or email. Some access remained unavailable and the small review budget left leads pending. Native X/LinkedIn access and independent recall/relevance are not established.

Run `node scripts/evaluation/check-adaptive-discovery.mjs` only for an authorized live repeat. Each run uses its own disposable schema and small budget, separately from the live worker. Both diagnostic runs together made twelve searches, eight document operations and eight model calls. Public reports include sources and model judgments; they are not independent labels or a matched fixed-versus-adaptive benchmark.

## Model-guided planning and complete delivery check

[`latest-model-guided-discovery.json`](latest-model-guided-discovery.json) records the 23:29 WAT positive synthetic US-profile run: separate product-design and UX-design searches, observed source/application links, cited source review, public research, private matching and one eligible ordinary Mailpit digest. It used four searches, four source checks, twelve AI reservations and eleven recorded model calls in 48.6 seconds. Recorded model usage estimates $0.035849; conservative reservations were $0.90 AI/$0.04 search. A repeated delivery pass sent no duplicate. Work-authorization uncertainty remained explicit, so this does not verify exceptional prompt-alert eligibility.

[`restricted-location-model-discovery.json`](restricted-location-model-discovery.json) keeps the earlier UK-profile run, which rejected concrete US-location/experience conflicts. [`directory-model-discovery.json`](directory-model-discovery.json) keeps a fallback/directory-only run with no recommendation. [`initial-model-guided-discovery.json`](initial-model-guided-discovery.json) documents the first failed smoke whose diagnostic runner asserted before exporting rows. Preserve these outcomes alongside success.

[`planning-comparison.json`](planning-comparison.json) compares the successful model-guided case with [`paired-baseline-discovery.json`](paired-baseline-discovery.json), using the same synthetic brief and ceilings. The deterministic run used six searches and four document checks, took 83.3 seconds and delivered no recommendation. Its $0.042008 recorded model estimate excludes four attempts without usage. Source results changed between successive runs and the synthetic US profile was chosen after a separate UK trial exposed restrictions. This is a tuning/engineering comparison, not independent quality evidence; precision and known-opportunity recall remain null.

Use `node scripts/evaluation/check-model-guided-discovery.mjs --scenario=us` for an authorized positive-path repeat; omit `--scenario=us` for the UK case, or add `--baseline` for the prior deterministic policy. Each invocation is limited to six paid searches, four document checks and twenty AI reservations ($1.56 maximum combined reservation) in a disposable test schema. Mail targets a synthetic address and SMTP is bound to `127.0.0.1:1025`. `node scripts/evaluation/compare-discovery-runs.mjs` only reads saved reports and makes no paid calls.

The final local regression suite passed 100 deterministic checks, 48 database checks, four Temporal recovery/replay checks and fourteen API checks. These cover public-word constraints, exact approved action selection, review-before-follow-up, shared public work/private ownership, budget and lease fencing, terminal replay, linked evidence and source-review reuse. Independent judgments and production workload tests remain required by the protocol below.

## Continuous monitoring check

[`continuous-monitoring.json`](continuous-monitoring.json) is a controlled two-scout fixture with real local PostgreSQL and Mailpit. A directory gains a posting; the scouts share two fetch calls and one posting extraction, each receives a separate private fit assessment and an ordinary digest, and repeating delivery sends none. Source bodies and model outputs are authored fixtures; external search/AI cost is zero. Due timestamps are explicitly advanced. This is scheduling/reuse/delivery evidence, not organic relevance or recall.

Seven isolated database scenarios and four pure policy tests cover source admission, changed destinations, pause/revision fencing, uncertain attempts, duplicate receipts, per-scout ceilings, shared document concurrency and four-link expansion per capture. A separate Temporal check exercises retries and replay. Run the source-monitoring integration file with `WEB_DISCOVERY_INTEGRATION=1`; add `MONITOR_MAILPIT=1` only for the authorized local SMTP check.

[`continuous-monitoring-local.json`](continuous-monitoring-local.json) records an aggregate snapshot of the running registry, current interests, observed changes, pending updates and shared budgets. Produce it with `node scripts/evaluation/report-source-monitoring.mjs --write`. `--learn-existing` additionally enrolls up to 100 current reviewed scout cases using core policy; no paid/network/mail operation is made by that command. It does not reset any ledger. Indexed monitored pages can predate enrollment, so those totals are not attributed discovery yield. Independent relevance and known-opportunity recall stay null until reviewed labels exist.

## 1. Separate the questions

1. Did the source/provider expose the opportunity within the observation window?
2. Did ScoutAlert discover and admit it?
3. Did classification recognize actual demand and preserve a useful lead?
4. Did extraction retain the necessary evidence without inventing facts?
5. Did retrieval route it to plausible Scouts without false exclusion?
6. Was private fit assessment useful and appropriately uncertain?
7. Did research add decision-relevant supported evidence?
8. Did a current eligible recommendation reach the dashboard and permitted delivery channel?

Report stage failures separately. Strong fit quality on already-selected postings does not measure discovery recall. A successful live request does not measure relevance.

## 2. Sample construction

Create a versioned manifest covering jobs, contracts, fixed-price projects, hourly services and informal requests; common and rare professions; international remote and restricted-location work; multiple enabled languages and regions; recent, stale, closed, edited and reposted content.

Include known opportunity references independently collected by reviewers, provider-discovered candidates, negatives such as service advertisements and commentary, incomplete leads, inaccessible content and adversarial documents. Record when and how references were observable. Hold out domains, authors or source instances and later time windows to test generalization beyond configured integrations.

Use synthetic fixtures for deterministic boundaries and fault injection. Keep them labeled synthetic. Live samples need observation times, permitted snapshots or references, source lineage and retention/access metadata. A controlled public fixture tests collection mechanics, not organic marketplace usefulness.

## 3. Independent labels

Reviewers see the confirmed brief and relevant original evidence without model rankings or verdicts. Label actual demand, category, relevance, hard conflicts, unresolved facts, evidence support and whether further investigation would be worthwhile. Record reviewer identity/pseudonym, rubric version and disagreements; adjudicate consequential conflicts.

The model under evaluation cannot supply its own independent ground truth. Model-assisted preliminary labels remain separate until human review. Behavioral clicks and saves carry exposure bias and supplement rather than replace this benchmark.

Freeze the held-out split and thresholds before the final run. Keep tuning samples separate and record any subsequent dataset change. Missing independent labels keep the quality gate pending, even if the evaluation runner works.

## 4. Required measurements

| Measure                            | Definition and important qualification                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Known-opportunity discovery recall | Discovered eligible references divided by observable eligible references in the declared sample/window; report inaccessible cases separately    |
| Demand precision                   | Reviewed discovered leads that are genuine relevant demand; report service-offer and commentary false positives                                 |
| Retrieval Recall@K                 | Known relevant items retrieved from the acquired corpus; distinguishes acquisition failure from retrieval failure                               |
| Recommendation usefulness          | Independently reviewed ranking/relevance with unknowns and hard conflicts reported separately                                                   |
| Provider contribution              | Unique useful leads and sources added beyond other providers, with overlap, duplicates and cost                                                 |
| Exploration contribution           | Useful new sources and underserved-cohort discoveries attributable to the reserved exploration allocation                                       |
| Evidence and research quality      | Supported claims, incorrect scope, unresolved outcomes, useful resolutions, unnecessary calls and missed evidence                               |
| Freshness                          | Publication/change-to-observation where trustworthy timestamps exist; observation-to-recommendation and recommendation-to-submission separately |
| Reliability                        | Lost acknowledged events, duplicate effects, recovery time, stale publications, stream gaps and reconciliation outcomes                         |
| Efficiency                         | Search/fetch/render/model/storage/egress cost, amortized shared work, cache reuse and cost per reviewed useful recommendation                   |

Report category/language/region/source-family slices, sample sizes and uncertainty intervals where meaningful. A global average cannot hide a severely degraded cohort. Avoid an unsupported percentage for coverage or recall across the entire internet.

## 5. Baselines and experiments

Compare configured-source collection, a simple fixed-query web baseline and the adaptive discovery strategy under matched time/access/cost envelopes. Isolate improvements from planner changes, provider breadth, exploration allocation and evidence reuse. Compare model-assisted classification with deterministic baselines. Retain both successes and exclusions.

Measure source expansion beyond its proposal count: validated instances, sustained useful yield, duplication, monitoring cost and failed admission. Measure shared-work efficiency with overlapping Scouts and with distinct/private searches. Research experiments account for related-question batching and cache freshness.

## 6. Workload and failure manifest

Declare active Scouts, arrival/change rates, source and provider mix, document sizes, language/category distribution, expected reuse, burst shape, model/request quotas, worker slots, database/index configuration and network region. State target queue delay, latency percentiles, recovery bounds and cost ceiling before running.

Inject failures around durable ingestion/acknowledgement, provider timeouts, cursor expiry, cache loss, worker termination, outbox dispatch, source revocation, Scout edits and delivery ambiguity. Preserve failing artifacts and explain whether backfill was possible. Regional claims need actual failover and ownership-fencing exercises.

## 7. Run report and promotion

A run report includes manifest version, code/policy/model/provider configuration, source window, privacy controls, independent label status, baseline comparison, cohort results, stage failures, complete usage/cost accounting, DACC results and unresolved dependencies. Estimates are labeled and separated from measured bills; cached shared work is charged consistently across compared strategies.

Promotion requires the declared acceptance thresholds and hard invariants to pass, followed by a bounded rollout with rollback and operational ownership. This protocol does not itself authorize a paid benchmark, source access, outbound contact or a production deployment; execution follows the user's authorized task and configured platform policies.

## Native X integration checks — 3 October 2026

The native recent-search/lookup path has captured-contract and isolated database tests, plus a separate Temporal retry/replay check. The worker regression run passed 181 non-Temporal checks and six Temporal checks. These are fixture and recovery results. After credentials were supplied, a separate live recent-search request returned HTTP 200 with seven original posts, reserved $0.05 and dispatched six scout cases. Scheduled native access was initially enabled under 20 requests/$1 per UTC day and subsequently raised by the operator to 100 requests/$10. Later runs verified native refresh and bounded context lookup; organic relevance and complete coverage are not established.

`WEB_DISCOVERY_INTEGRATION=1 SOCIAL_MAILPIT=1 pnpm --filter worker exec vitest run test/social-discovery.integration.spec.ts -t 'shares search and public extraction' --no-file-parallelism` records the controlled two-scout source/review/private-fit/delivery path in `native-social-fixture.json`. Provider and model responses are authored; SMTP is bound to local Mailpit. The same test verifies duplicate suppression and expiry of retained source/assessment/delivery copies.

`node scripts/evaluation/report-social-discovery.mjs --write` saves aggregate runtime state to `native-social-local.json`, including enablement, retained reservations, query gaps, latency and known Google overlap. Independent relevance, useful incremental coverage and known-opportunity recall remain unmeasured. See [native social implementation and limits](../../docs/engineering/scoutalert-native-social-discovery.md).

The 3 October budget-recovery follow-up passed 38 focused configuration/native checks. It verifies resumed review after larger admission limits without additional X reads, historical-ledger resets, changed source timestamps or revival of paused/obsolete scout subscriptions. A live restart then produced completed native source classifications; the saved runtime report distinguishes those from independent relevance judgments. Historical deferred review cases remain audit records, and current dispatched-case counts include the replacement cases.

The bounded-context increment passed 209 worker checks, including all isolated persistence suites. Two initial live context requests resolved 13 referenced IDs, with nine complete and two incomplete packets recorded at 01:21:47 WAT. `native-social-local.json` now separates ordinary lookup, context lookup, reference state and bounded packet completeness. Capture counts are not independent classification scores. The corpus still needs paired organic buyer/reply/quote cases and independent judgments.

## Discovery scheduling measurements

`node scripts/evaluation/report-discovery-performance.mjs --write` records newly admitted query/source attempts, canonical route novelty, current model intent labels, selection reasons and unchanged-post timing in `performance-local.json`. Historical daily spend is shown separately; no backfill is implied. Core and PostgreSQL fixtures verify pacing, oldest-due selection, bounded samples and stale-label exclusion. The always-empty-query simulation measures repeat polling only; independent real-world relevance, known-opportunity recall and global workload gates remain open. See the [policy and operating notes](../../docs/engineering/scoutalert-discovery-scheduling.md).

[`native-pacing-2026-10-04.json`](native-pacing-2026-10-04.json) records the first live paced admission after the UTC reset: three startup requests, a fourth successful search after 13 minutes 18 seconds, unchanged previous-day spend and a reconciled $0.20 current-day reservation. Three continuation windows remain open. Source-review failures and pending work remain explicit; independent quality is null. Reproduce the read-only audit with `node scripts/evaluation/report-native-pacing.mjs`; `--write` creates a dated file without overwriting prior evidence. Timing checks assume unchanged configured limits/prices during the observed day and permit one second of transaction timestamp tolerance. No new provider/model requests or mail are made by the report.

## Review recovery and local load — 4 October

[`review-recovery-2026-10-04.json`](review-recovery-2026-10-04.json) is a later read-only snapshot after fixing native cases lost before review initialization. All 48 current retained posts had ready public reviews, covering 212 active scout-source subscriptions; no incomplete/non-demand posts were promoted. These are operational counts, not independent quality labels or private recommendations. Indexed LinkedIn remains a coverage gap: 241 observed leads and no original-source reviews. `node scripts/evaluation/report-review-recovery.mjs` reproduces the aggregate report; `--output=path.json` saves a new artifact exclusively.

[`retrieval-load-before-2026-10-04.json`](retrieval-load-before-2026-10-04.json) preserves the original 50,000-posting import timeout. [`retrieval-load-after-2026-10-04.json`](retrieval-load-after-2026-10-04.json) uses the same workload after source publication was divided into bounded SQL batches within one transaction. All 1,000/10,000/50,000 sizes pass with the unchanged ten-second statement timeout; 50,000-posting retrieval p95 at concurrency eight is 312.73 ms. The dataset repeats frozen public text with synthetic identities, so this is a local microbenchmark, not internet recall or global production capacity.

Run `SCOUT_BENCH_SIZES=1000,10000,50000 node scripts/evaluation/benchmark-retrieval.mjs evaluations/opportunity-quality/runs/2026-10-01-held-out/corpus.json path-to-new-report.json` for an isolated database repeat without provider/model/email calls. The runner preserves completed sizes and safe failure codes even when a later workload fails. See [implementation, validation and limitations](../../docs/engineering/scoutalert-discovery-scheduling.md#review-recovery-and-load-check--4-october-0418-wat). The existing human-review packet remains open; automated checks cannot supply independent human relevance labels.

## Deeper source discovery — 4 October

[`deeper-source-discovery-2026-10-04.json`](deeper-source-discovery-2026-10-04.json) records 82 focused checks, including actual Chromium against controlled job, contract and service-request pages, durable PostgreSQL form decisions/reuse, and resource-flood cancellation. Static fixture result HTML exposes no listing links; the rendered path exposes and follows the detail link. This establishes the access mechanism, not independent match quality.

The live check initially missed a small JavaScript page because its login and pagination anchors looked like useful content. The corrected detector rendered the public demonstration in 13.5 seconds, with seven network attempts and 218,085 captured bytes. The Ashby jobs portal remained incomplete because it required an unsupported browser request. No live opportunity, personal assessment or email is attributed to these checks.

`node scripts/evaluation/check-deep-discovery.mjs <public-https-url>` runs a read-only smoke check on one to three explicit URLs. It uses the normal per-page bounds, no models or accounts, and does not write to the application database; it is separate from the worker's daily reservation ledger. See [implementation and remaining access paths](../../docs/engineering/scoutalert-deeper-source-discovery.md).

## Ashby access and deeper navigation — 4 October

[`ashby-public-access-2026-10-04.json`](ashby-public-access-2026-10-04.json) replaces the earlier Ashby access gap for supported hosted board/detail URLs. The documented public API yielded 62 listed jobs; one detail and a repeated directory read reused the same Redis snapshot and original observation time. The three reads required one provider request, captured 2,053,650 response bytes and took 2.028 seconds. This is live access/reuse evidence on one known employer board, not search recall, independent relevance or a verified personal match.

[`portal-navigation-checks-2026-10-04.json`](portal-navigation-checks-2026-10-04.json) combines the latest results of 117 focused checks. The first database run exposed legacy two-hop/four-round constraints; the versioned migration resolved that mismatch, and the durable suites passed on rerun. Checks include Chromium, observed pagination, frozen plan limits, conflicting/unlisted feed records, source monitoring, Redis lease fencing and timestamp preservation.

For an authorized live repeat, run `node scripts/evaluation/check-ashby-discovery.mjs --write`. It uses an isolated Redis namespace and cleans up its own cache. No model, search-provider query, application submission, email or real account is used. Its source fetch is bounded separately from the running worker's daily reservation ledger.

## Public feed access — 10 October

[`feed-access-2026-10-10.json`](feed-access-2026-10-10.json) records one live RSS capture and one observed detail-page read through normal public-address/crawl-policy enforcement. We Work Remotely supplied 89 entries; 80 unique readable links were retained and nine omitted by the declared window. The selected detail was readable but received no AI review or personal assessment. Four HTTP requests, including robots, took 6.639 seconds. These are access results, not relevance or whole-site recall measurements.

Reproduce with `node scripts/evaluation/check-feed-discovery.mjs`; `--write` saves the dated receipt. No secrets, application database, SMTP or paid provider are loaded. Source requests are independently bounded and separate from the worker's daily ledger.

The associated 100 passing focused checks include two synthetic owners sharing three source reads, with just two model-fixture calls (board and detail). Feed directory recognition uses zero AI reservations. A changed feed creates shared child probes and cannot publish an unread entry. Six optional browser checks were not enabled. See [the implementation record](../../docs/engineering/scoutalert-deeper-source-discovery.md#public-rss-and-atom-discovery--10-october) for scope and remaining work.
