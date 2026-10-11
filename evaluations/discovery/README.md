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

## Contextual routing and live feed persistence — 10 October

[`candidate-selection-cases.json`](candidate-selection-cases.json) is a six-case **development** set with implementation-authored expected actions. Two cases reuse public Figma job text from the development opportunity corpus; four are synthetic, including client work, services, Spanish wording and a negative seller/advice case. It is not a held-out set and must not be used to claim independent relevance.

[`candidate-selection-2026-10-10.json`](candidate-selection-2026-10-10.json) records both action menus against the same observations and current model prompt. The legacy menu offered 1/5 expected positive sources; contextual selection offered 5/5. Expected routing passed 2/6 versus 6/6. Twelve requests used an estimated $0.010219, with a conservative maximum diagnostic reservation of $0.90. This measures source inclusion and one-step selection only, not personal fit, total discovery recall or complete search cost. Prompt size, latency and token usage are retained per case/request.

Reproduce without paid calls with `node scripts/evaluation/check-candidate-selection.mjs`. Add `--live` only for an intentional bounded model run; `--output=<new-path>` writes an exclusive receipt. The live diagnostic reads the worker's model configuration/key but no application database, real account, search provider or SMTP. Its allowance is separate from the worker ledger. Both policies use the same current prompt, isolating candidate input changes rather than comparing complete old/new deployments.

[`feed-pipeline-2026-10-10.json`](feed-pipeline-2026-10-10.json) records a real public feed through the source repository, durable coordinator, directory review and monitor registration in an isolated PostgreSQL schema. Two synthetic owners reuse one capture and one public review; one directory monitor and four child probes are saved, with no AI reservations. The feed contains 89 entries, of which nine are omitted by the declared 80-link window. Two HTTP requests captured 788,432 bytes; the diagnostic took 4.089 seconds. The seed was supplied explicitly, so this does not prove organic feed discovery. No private recommendation, child-page review, email or running production worker was exercised. The schema is removed afterward.

Reproduce with `FEED_TEST_DATABASE_URL=postgresql://.../scoutalert_test node scripts/evaluation/check-feed-pipeline.mjs --output=<new-path>`. Only a loopback test database is accepted; it loads no application configuration. The single live feed read remains separate from the worker's source ledger.

Focused regression commands:

```sh
pnpm --filter worker exec vitest run test/contextual-candidates.spec.ts test/scout-planning.spec.ts test/adaptive-discovery.spec.ts test/feed-discovery.spec.ts test/web-discovery.spec.ts test/matching.spec.ts test/intelligence-policy.spec.ts
DATABASE_URL=postgresql://.../scoutalert_test WEB_DISCOVERY_INTEGRATION=1 pnpm --filter worker exec vitest run test/web-discovery.integration.spec.ts test/feed-discovery.integration.spec.ts --no-file-parallelism --hookTimeout=30000
```

The first command passed 84 checks. The database suite passed 27 cases, including action replay and a zero-keyword-overlap posting reaching private assessment with source, ownership, version and freshness guards. Fixtures test mechanics, not AI relevance. Broader independent usefulness, corpus-wide semantic retrieval and global-scale gates remain open.

[`contextual-retrieval-load-2026-10-10.json`](contextual-retrieval-load-2026-10-10.json) records 240 retrievals over 50,000 synthetic postings, including eight source-reviewed discoveries with no target-word overlap. Both modes use the current repository; one has no admitted discovery IDs. At concurrency eight, p95 was 40.04 ms without those IDs and 46.66 ms with them; all results stayed within 200 unique candidates and the eight discoveries received priority. This is a warm local microbenchmark with one scout and eight review records, not a paired old/new deployment, large-history join test or global-capacity result. Lower times in another run do not prove a speed improvement.

Reproduce with `DATABASE_URL=postgresql://.../scoutalert_test node scripts/evaluation/benchmark-contextual-retrieval.mjs --output=<new-path>`. Only a loopback test database is accepted. Initial fixture setup hit the existing ten-second timeout when inserting all postings at once; batches of 500 resolved setup without changing application timeouts. No external source, AI or SMTP is used.

## Local contextual discovery activation — 10 October

[`contextual-activation-2026-10-10.json`](contextual-activation-2026-10-10.json) records startup of the rebuilt local API, worker and web preview with the existing PostgreSQL, Redis, Temporal and Mailpit services. Nine worker pools started and the three HTTP surfaces responded. Live discovery cases adopted `contextual-v1`; completed choice tasks included candidate context. User-configured limits and SMTP configuration were retained. One startup database deadlock recovered on Temporal retry; inaccessible sources left cases partial. These aggregate runtime counts establish activation, not independently useful results, complete coverage or scale.

## Sitemap capture and checked redirects — 10 October

- `sitemap-discovery-2026-10-10.json`: initial public access/window measurement.
- `sitemap-discovery-prioritized-2026-10-10.json`: final reader, after preferring likely listing paths and excluding self-advertisements.
- Both explicitly seed one homepage, load no application secrets and use no paid search, AI or email. Additional URLs are compared only against the bounded HTML-link window; the followed pages were directories, not verified personal matches. Hosting/compute cost is not priced.

```sh
pnpm --filter @repo/core build
pnpm --filter @repo/adapters build
pnpm --filter worker exec vitest run test/sitemap-discovery.spec.ts test/feed-discovery.spec.ts test/contextual-candidates.spec.ts test/deep-discovery.spec.ts test/source-monitoring.spec.ts test/source-pagination.spec.ts test/lead-review.spec.ts test/adaptive-discovery.spec.ts test/web-discovery.spec.ts test/ashby-discovery.spec.ts
WEB_DISCOVERY_INTEGRATION=1 pnpm --filter worker exec vitest run test/feed-discovery.integration.spec.ts test/source-monitoring.integration.spec.ts test/web-discovery.integration.spec.ts --no-file-parallelism --hookTimeout=30000
node scripts/evaluation/check-sitemap-discovery.mjs
```

The live diagnostic makes at most four document captures and optionally saves a new receipt with `--output=<new-path>`; it refuses to overwrite an existing result. Database tests use random disposable schemas in `scoutalert_test`, fixtures, synthetic owners and no SMTP. The first full pass had 124 unit passes, six opt-in skips and 37 database passes; the added redirect-ceiling check brings unit coverage to 125. A final focused rerun passed all 27 sitemap cases and 29 feed/sitemap/discovery database cases after the last implementation edits.

Core/adapters/API/worker builds, web type checks and architecture checks pass. The existing web ESLint configuration skips TS by default and misinterprets TS/TSX when forced; it is recorded as a tooling limitation, not a passing lint check. Independent relevance, real useful-result yield and global capacity remain unmeasured by this check.

`sitemap-activation-2026-10-10.json` records the subsequent local restart: nine worker pools running, web/API/Mailpit healthy, one new capture with a sitemap advertisement and no sitemap capture yet at the initial snapshot. The worker continues on existing schedules and budgets. This runtime evidence is separate from the isolated fixture and public diagnostic checks.

## Live search quality checks — 12 October

[`live-quality-summary-2026-10-12.json`](live-quality-summary-2026-10-12.json) indexes seven real-provider runs with synthetic accounts and predefined US/remote briefs. Each run has a fresh disposable PostgreSQL schema, at most six searches, six document reads and 36 AI attempts ($0.06 search and $2.70 AI reservation ceilings). They use Serper, the configured assessment model and the normal discovery/review/matching/delivery use cases. SMTP is explicitly local Mailpit. Native X and Freelancer's separate connector loops are outside this diagnostic; no real scout was edited by the runs.

| Scenario/run | Seconds | Leads | Captured pages | Dashboard candidates | Mailpit digests | Estimated AI USD | Search reservation USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Jobs, initial | 81.132 | 55 | 5 | 0 | 0 | 0.072089 | 0.06 |
| Projects, initial | 83.260 | 48 | 3 | 0 | 0 | 0.044428 | 0.05 |
| Services, initial | 57.170 | 49 | 2 | 0 | 0 | 0.038722 | 0.05 |
| Jobs, refined | 94.009 | 54 | 6 | 2 before policy correction | 1 | 0.075915 | 0.06 |
| Projects, refined | 56.844 | 46 | 4 | 0 | 0 | 0.059221 | 0.05 |
| Services, refined | 44.234 | 42 | 2 | 0 | 0 | 0.032171 | 0.05 |
| Services, rendering enabled | 66.419 | 32 | 2 (one incomplete) | 0 | 0 | 0.029848 | 0.04 |

These are small sequential development checks, not paired controlled benchmarks. Queries/results and model decisions can vary between runs. The initial three reports retained only the dashboard's 40-lead sample; their source-label totals are incomplete. Later reports retain every case lead. None has independent usefulness labels or a known-positive recall denominator. Zero results means no useful-result cost can be calculated, not that the search was free. Across seven runs, known AI cost estimates total $0.352394 and configured search reservations total $0.36. These exclude unpriced failed attempts, infrastructure and provider billing adjustments; reservations are not invoices.

### Findings and changes

The initial job run spent page capacity on sign-up and automated-application marketing. Candidate selection now filters those destinations using path/anchor context, retains real listings that mention sign-in and reuses observed redirect identity. Project/service queries now explicitly target hiring/freelance demand and can refine toward project budgets. Navigation regressions pass, but these small repeats do not establish a general recall improvement.

The refined job path captured six pages, published four unique open postings and produced two dashboard repository results. [`live-quality-mailpit-2026-10-12.json`](live-quality-mailpit-2026-10-12.json) verifies one captured synthetic digest with both titles/URLs and no retry duplicate. This exercises the real dashboard data repository and SMTP transport; it is not an authenticated browser test of those results.

Evidence review then caught a false positive: Wander's Staff Product Designer posting asked for 10–13+ years of product design experience, while the brief supplied five. The model marked experience as meeting the requirement despite its own explanation admitting the gap. The old domain policy also failed to exclude experience conflicts. Both paths are now corrected under `supported-criteria-v4`: supported experience conflicts exclude the recommendation, and a narrow English numerical comparison corrects explicit same-area tenure contradictions. It does not infer total tenure from overlapping roles, turn preferred criteria into mandatory ones, or claim universal experience verification.

[`live-quality-policy-replay-2026-10-12.json`](live-quality-policy-replay-2026-10-12.json) replays the two accepted candidates against saved evidence with no model/search/email calls: the Staff role is excluded and the Senior Product Designer remains reviewable with skills and authorization still unresolved. The historical two-result Mailpit message is retained as evidence of the defect. Old persisted AI assessments cannot trigger another digest or prompt until reassessed; current domain rules also run over reused model proposals. The provider prompt/cache identity is unchanged because the correction belongs to domain policy.

Project captures were mostly directories or employment postings; services included seller pages and inaccessible social demand. The first six diagnostics inadvertently disabled browser rendering when its environment setting was omitted, although their reader was named `worker`. That diagnostic default is corrected to use validated worker configuration. The seventh run records actual browser use: Contra returned an incomplete capture (`browser_resource_unavailable`), social sources denied crawling, and the only complete reviewed page offered services rather than requesting them. No blocked or incomplete page became a match. Wider access and useful buyer-demand yield remain open work.

### Reproduction and checks

```sh
pnpm --filter @repo/core build
pnpm --filter @repo/adapters build
pnpm --filter worker build
# Intentional paid diagnostic; output paths must be new. Repeat per desired scenario.
node scripts/evaluation/check-live-scout-quality.mjs --scenario=services --output=/tmp/new-service-report.json
# Frozen monotonic policy replay; no external calls or delivery.
node scripts/evaluation/replay-live-quality.mjs evaluations/discovery/live-quality-jobs-refined-2026-10-12.json /tmp/new-policy-replay.json
node --test packages/eslint-config/config.test.mjs scripts/evaluation/live-quality-summary.test.mjs
pnpm --filter web lint
node scripts/check-onboarding-navigation.mjs
```

The diagnostic requires the existing local PostgreSQL and Mailpit services, worker configuration and browser runtime. It consumes its own small isolated allowances, separate from the running worker ledger, and removes its generated schema on completion. Source URLs, quotes, pending states and costs stay in the saved report. Model labels are not independent judgments.

The focused discovery pass has 93 passing checks and six opt-in browser skips; the final fit/navigation pass has 41 passing checks. Isolated web persistence checks pass 25 cases, and scouting/intelligence/delivery checks pass 17, including Mailpit retry suppression and withholding v3 assessments. Core/adapters/worker/API builds, web type checking and architecture checks pass. Web lint now passes with real TS/TSX coverage, resolving the 10 October tooling limitation. Three lint-config regressions and two summary-integrity checks pass. The ESLint parser uses its supported tooling-local TypeScript 6.0.2; application compiler versions are unchanged. The browser onboarding regression uses mocked review/identity routes and verifies Back/Forward, restored state and stale-review rejection; it does not send mail or save an account.

[`live-quality-activation-2026-10-12.json`](live-quality-activation-2026-10-12.json) records the updated local API, preview and Mailpit responding with HTTP 200 and all nine worker pools starting. Configured budgets, schedules and transport settings are retained. The first aggregate snapshot still has 51 v3 AI assessments and 85 unversioned provisional assessments; no v4 result had yet been persisted. The old AI assessments await normal scheduled reassessment and cannot trigger new mail under the current gate. Provisional title matches retain their existing digest rules. Startup is not proof that every saved scout has been reassessed.
