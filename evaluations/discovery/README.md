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

| Scenario/run                | Seconds | Leads |     Captured pages |       Dashboard candidates | Mailpit digests | Estimated AI USD | Search reservation USD |
| --------------------------- | ------: | ----: | -----------------: | -------------------------: | --------------: | ---------------: | ---------------------: |
| Jobs, initial               |  81.132 |    55 |                  5 |                          0 |               0 |         0.072089 |                   0.06 |
| Projects, initial           |  83.260 |    48 |                  3 |                          0 |               0 |         0.044428 |                   0.05 |
| Services, initial           |  57.170 |    49 |                  2 |                          0 |               0 |         0.038722 |                   0.05 |
| Jobs, refined               |  94.009 |    54 |                  6 | 2 before policy correction |               1 |         0.075915 |                   0.06 |
| Projects, refined           |  56.844 |    46 |                  4 |                          0 |               0 |         0.059221 |                   0.05 |
| Services, refined           |  44.234 |    42 |                  2 |                          0 |               0 |         0.032171 |                   0.05 |
| Services, rendering enabled |  66.419 |    32 | 2 (one incomplete) |                          0 |               0 |         0.029848 |                   0.04 |

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

## Client-demand search refinement — 12 October

The [development summary](client-demand-summary-2026-10-12.json) preserves six additional full-path runs and four planner comparisons, including failures. The same synthetic project/service briefs and per-run ceilings from the earlier checks are retained. The first full-path experiments used planner v4, the corrected pair used v5, and the final pair used v6. Current code uses `scout-planning-v7`; its final change has the saved six-case routing check, rather than another full-path sample.

### Implemented behavior

- New adaptive service plans freeze `client-demand-v1`. Client-project and service-request briefs share this product category. Four initial query families cover scope/budget, buyer requests for a freelancer/contractor, RFPs/RFQs, and bids/proposals. X and LinkedIn remain bounded alternatives; no marketplace whitelist is introduced.
- Public skill stacks can be separated into short retrieval concepts. Remote wording is no longer mandatory in every service query. The complete confirmed brief, required arrangement, eligibility, consent and current fit policy still govern private matching and alerts. Employment and contract query behavior is retained.
- Candidate selection prioritises buyer language, relevant deliverables and budgets. Seller/advice hints and employee-vacancy hints lower priority without becoming semantic exclusion rules. Host and originating-query diversity prevent one technology query from filling the entire menu. Two additional diverse choices preserve exploration beyond those English hints. The menu remains capped at ten document options.
- Observed directory anchors carry nearby parent text as an explicitly unverified routing hint. The child must still be captured and reviewed itself. Generic previous/next job links are excluded; descriptive related-project links remain eligible.
- The planner sees failed access, actual source subjects and review quotes. Two crawl-denied sibling paths pause that exact origin/path family for the current case, without banning the host, losing leads, changing access policy or affecting native connectors. Other observed paths remain eligible.
- Query refinement stops once the case has no remaining document reads. Initial and fallback queries use the same approved public-target templates. No spending ceiling, source access rule or saved scout brief was relaxed.

### Observations, not release-quality scores

| Run         | Search requests | Document reads | Observed outcome                                                                          | Dashboard matches / emails | Estimated AI USD | Search reservation USD |
| ----------- | --------------: | -------------: | ----------------------------------------------------------------------------------------- | -------------------------: | ---------------: | ---------------------: |
| Projects v4 |               6 |              6 | Two unrelated housing/construction requests; no personal fit                              |                      0 / 0 |         0.069836 |                   0.06 |
| Services v4 |               6 |              6 | Closed notice, directories and seller page                                                |                      0 / 0 |         0.052937 |                   0.06 |
| Projects v5 |               6 |              4 | Repeated denied X routes; no captured source                                              |                      0 / 0 |         0.030449 |                   0.06 |
| Services v5 |               4 |              6 | Three relevant website/portal request summaries, incomplete/gated details                 |                      0 / 0 |         0.041281 |                   0.04 |
| Projects v6 |               4 |              6 | Two website tenders; one complete capture entered matching                                |                      0 / 0 |         0.041338 |                   0.04 |
| Services v6 |               5 |              6 | Client website brief found; incomplete capture; unrelated previous-job navigation exposed |                      0 / 0 |         0.047203 |                   0.05 |

The final project path followed an observed tender directory into a specific 511.org website-service request. The source specified Drupal/Pantheon, while the synthetic scout requested React/TypeScript; private fit rejected it and remote arrangement remained unknown. This demonstrates discovery of buyer demand and downstream withholding, not a useful personal match or independently verified procurement opportunity. The service path found Freelancer's “I need a website” request, but its browser capture was incomplete and was not published. The unrelated screenwriting page reached via “Previous job” is retained in the receipt; the final navigation regression excludes that route.

The [routing packet](client-demand-routing-cases.json) mixes authored examples with captured failed routes and records provenance per case. It is a development set with implementation-authored expected actions. The v6 check passed 5/6 contextual cases: it wrongly treated a client building an AI recruitment website as a seller. The corrected [v7 check](client-demand-routing-v7-2026-10-12.json) passed 6/6, including that request, unrelated construction, an advice guide and Spanish bookkeeping demand. The keyword menu passed 5/6 under the same current prompt. This is one-step routing evidence, not independent precision or multilingual/global recall. All earlier receipts remain unchanged.

Across these six full-path checks and four twelve-call planner checks, known model estimates total **$0.356449**; configured search reservations total **$0.31**. Reservations are not invoices. No recommendation or email was produced. Usefulness, missed-opportunity recall and cost per useful result remain unmeasured. Native X and the separate Freelancer collection loop are outside this web-path diagnostic. Gated procurement documents, incomplete marketplace captures and broader organic quality remain open work.

### Verification and reproduction

The discovery regression pass contains 135 passing tests across nine suites, including 25 isolated PostgreSQL checks. After the final navigation/prompt edits, the four affected planning/navigation suites pass 63 tests, including the new previous/next-link case. Core/adapters/worker compilation, API type checking, architecture and report-integrity checks pass.

```sh
# No provider calls: confirm candidate inclusion on the saved development packet.
node scripts/evaluation/check-candidate-selection.mjs --corpus=evaluations/discovery/client-demand-routing-cases.json
# Intentional paid check: at most 12 model calls / $0.90 reserved, using a new output path.
node scripts/evaluation/check-candidate-selection.mjs --live --corpus=evaluations/discovery/client-demand-routing-cases.json --output=/tmp/new-client-routing.json
# Six searches, six document reads, 36 AI attempts maximum; synthetic owner, isolated database and local Mailpit.
node scripts/evaluation/check-live-scout-quality.mjs --scenario=projects --output=/tmp/new-client-projects.json
node scripts/evaluation/check-live-scout-quality.mjs --scenario=services --output=/tmp/new-client-services.json
```

The [local activation receipt](client-demand-activation-2026-10-12.json) records all nine worker queues running with planner v7. The startup aggregate has one newly created discovery case and no new `client-demand-v1` case yet; existing scouts adopt the new plan on their normal future search runs. No account result backfill or forced rescheduling is implied.

## Client-request capture repair — 12 October

The [measured summary](client-request-capture-summary-2026-10-12.json) indexes three runs and verifies the exact synthetic Mailpit message. The [source packet](client-request-capture-cases.json) references URLs already observed in earlier reports; it supplies no fabricated source content. Two initial runs used a fixed diagnostic plan to recapture all six URLs, exposing a relative-deadline publication error. The [saved review replay](client-request-deadline-replay-2026-10-12.json) checks the correction without more model calls.

The [final run](client-request-assessment-2026-10-12.json) uses the current adaptive planner against those recorded search observations, live page reads and observed-link navigation. It makes no paid search request and does not measure fresh organic retrieval or recall. It captured six pages, reviewed two complete website buyer requests and four gated tender summaries, and assessed the two publishable requests. One reviewable recommendation reached the dashboard repository and one synthetic digest reached Mailpit; retry sent no duplicate. The original new-build request was excluded against a redesign brief, and its model assessment also introduced an unsupported currency restriction. These judgments are not independent labels or a completed quality gate.

Freelancer captures now contain primary buyer text, stated skills, budget and status without bidder proposals. In the fixed recapture comparison, each marketplace page needed two HTTP requests rather than five browser-bundle requests. Each of three short gated tenders needed two requests rather than twelve; the fourth tender remains an HTTP summary but is now correctly marked incomplete. Across all six URLs, requests fell from 48 to 12. Browser failures, hidden/missing primary sections, oversized text and sign-in-gated evidence still withhold matching.

Review policy `deadline-evidence-v1` treats recognized relative closing counters as unknown dates after citation validation. Explicit calendar evidence and conflicts remain unchanged. Policy upgrades refreeze the current review round; old receipts and attempt reservations remain intact. The source-reader identity is `public-document-v7` and primary parser is `freelancer-public-html-v1`.

```sh
# Paid AI, no paid search: current planner reviews recorded search observations and fetches live sources.
# Six reads, 36 admitted AI attempts / $2.70 reservation ceiling, synthetic owner and local Mailpit only.
node scripts/evaluation/check-live-scout-quality.mjs --scenario=services --recapture-cases=evaluations/discovery/client-request-capture-cases.json --output=/tmp/new-client-capture-check.json
```

Three saved diagnostics total an estimated **$0.081693** in model usage. This excludes infrastructure and is not an invoice or cost per independently useful result. The final five regression suites pass 91 checks; nine Chromium checks pass separately with browser launch access. Core/adapters/worker builds, API/web type checks, touched web lint, architecture checks and two report-integrity checks pass. No real account, budget, schedule or SMTP setting was changed by the diagnostics. The [local activation receipt](client-request-capture-activation-2026-10-12.json) confirms nine worker queues and the existing web/API/Mailpit routes responding. Two source observations had run since restart, with no new primary buyer capture yet. Saved scouts receive the new reader and review policy on normal future work; no full backfill is claimed.

## Project and service flow repair — 12 October

The [repair summary](client-flow-repair-summary-2026-10-12.json) separates the historical quality failures, new code changes, controlled flow checks and provider-access failures. The historical project run reached a Drupal/Pantheon tender and correctly rejected it against a React/TypeScript brief. The service run lost buyer requests before matching because captures were incomplete. The existing primary buyer parser and relative-deadline repair are retained; their earlier seeded recapture is not evidence of fresh discovery.

New cases freeze `client-demand-v2` under planner `scout-planning-v8`. The initial portfolio includes buyer-brief/project-detail language and first-person requests, with quoted supplied topic terms to reduce generic budget/RFP drift. Formal tenders, general budget/bid searches and social alternatives remain available within the original limits. Resumed `client-demand-v1` cases keep their prior query vocabulary. No private profile details enter queries, and no source or spending limits were relaxed. Fresh yield from this revised vocabulary remains unverified.

Service index retrieval now offers partial target vocabulary to assessment, preserving exact-match priority and the 200-candidate ceiling. The existing eight-new-assessments allowance, owner hiding, source freshness, opportunity kinds and fit rules are unchanged. A PostgreSQL regression covers a React/TypeScript dashboard that lacks generic `web development` wording, exact-match ordering, stale evidence and hiding. This is a separate index recall defect; it does not explain every historical web-path loss. PostgreSQL 18.6 is installed; query behavior follows its [text-search documentation](https://www.postgresql.org/docs/18/textsearch-controls.html).

The saved recapture also contained a model-generated currency conflict when `minimumPay` was empty. That conflict could penalize rank and mislead the user, although it was not the sole rejection reason. Fit prompt `evidence-prompts-v8` and the deterministic policy now prevent default currency/payment-period fields from becoming an unstated pay restriction. Explicit minimum-pay comparisons, undisclosed-pay policy, location, experience and mandatory arrangement checks still apply.

The [complete fixture receipt](client-flow-fixture-2026-10-12.json) runs project and service scenarios through production discovery admission, the primary page parser, source review, PostgreSQL indexing, personal fit, availability, dashboard reads and local Mailpit. Each produces one recommendation and one digest; on-site work and seller advertising are withheld, owner isolation holds and repeated delivery sends zero duplicates. Search responses, HTTP bodies and model judgments are authored fixtures. This verifies integration, not organic usefulness or model accuracy. The first fixture attempt withheld delivery because its authored application evidence was missing; correcting the fixture's cited proposal path passed the existing delivery gate.

Two attempted fresh baselines, [projects](client-flow-projects-baseline-2026-10-12.json) and [services](client-flow-services-baseline-2026-10-12.json), failed every search and model request. Separate minimal provider checks returned Serper `400 / Not enough credits` and model `429 / credit_balance_exhausted`; no useful-result comparison can be made. Reports now include successful/failed search counts and completed fit counts, and identify total search-provider failure separately from an empty successful search. No further complete paid runs were attempted while access remained unavailable.

Validation: 93 focused unit checks, 48 isolated database checks, three report-summary checks and both complete fixture flows pass. Core/adapters/worker builds, API/worker type checks, architecture checks and diff whitespace pass. No runtime restart, saved-account edits or configuration/budget changes are attributed to this increment. A funded live repeat and independent relevance labels remain required.

```sh
# Authored search/HTTP/model fixtures; isolated PostgreSQL and local Mailpit only.
node scripts/evaluation/check-client-flow-fixture.mjs /tmp/new-client-flow-fixture.json
# Fresh paid runs after restoring both provider balances; use new output paths.
node scripts/evaluation/check-live-scout-quality.mjs --scenario=projects --output=/tmp/new-client-projects-live.json
node scripts/evaluation/check-live-scout-quality.mjs --scenario=services --output=/tmp/new-client-services-live.json
```

## Funded project and service validation — 15 October

The [funded validation summary](client-flow-repair-summary-2026-10-15.json) preserves all six fresh runs, including the failures that motivated further changes. Search and model access are working again. These runs use synthetic US-based profiles, the production discovery/review/matching/availability/delivery use cases, isolated PostgreSQL schemas, and local Mailpit.

| Run                                                          | Leads | Complete captures | Completed fit assessments | Recommendations | Digests |
| ------------------------------------------------------------ | ----: | ----------------: | ------------------------: | --------------: | ------: |
| Initial projects                                             |    40 |                 0 |                         0 |               0 |       0 |
| Initial services                                             |    43 |                 4 |                         1 |               1 |       1 |
| Intermediate projects                                        |    48 |                 4 |                         1 |               0 |       0 |
| Intermediate services                                        |    36 |                 3 |                         1 |               1 |       1 |
| [Final projects](client-flow-projects-final-2026-10-15.json) |    58 |                 2 |                         2 |               1 |       1 |
| [Final services](client-flow-services-final-2026-10-15.json) |    30 |                 3 |                         2 |               2 |       1 |

The first project run spent all six reads on inaccessible or missing pages. New cases now freeze `client-demand-v3`: project-route and open-bidding queries lead the portfolio, coherent deliverables such as “Website redesign” stay intact, and two consecutive inaccessible reads trigger an unused query while capacity remains. Both final project recovery queries occurred within the original six-search, six-document and eight-round limits. Frozen v1/v2 query vocabularies remain available.

The intermediate service run incorrectly classified two complete freelance buyer briefs as jobs/contracts, removing them from service matching. Review inputs now preserve parser-confirmed primary buyer provenance. After citation validation, `buyer-category-v1` keeps positive buyer demand in `client_request`; negative verdicts, incomplete captures and unresolved facts remain unchanged. Review prompt `lead-evidence-v3` reinforces that distinction. Review identities change so earlier classifications are not silently reused.

The intermediate project planner also described generic React.js and Enterprise links as though they were their parent buyer brief. Planner `scout-planning-v10` no longer transfers an individual posting's demand into unread child-link hints. Observed collection context remains available, and destinations still require their own permitted capture and review. Synthetic diagnostic receipts now retain rejected review/fit output to make validation failures inspectable; neither final run contains rejected output.

Final recommendations were a flexible-stack collaborative screenwriting web app, a minimalist website redesign, and a dog-grooming website redesign. All three captured briefs explicitly stated remote delivery and open bidding. Location and authorization remain unknown under the confirmed review-unknowns preference. The final project run excluded a generic JavaScript role; the service run withheld a completed historical project. The intermediate Australia-only project was excluded against the US test profile. These are inspected development examples, not independent relevance labels or a recall benchmark. Seven of twelve final source reads remained inaccessible, and all final recommendations came from public Freelancer pages. Native X and the separate marketplace feed loop were not exercised by this diagnostic.

Validation passes 117 focused unit checks, 48 isolated database checks and three report checks. Both [complete fixture flows](client-flow-fixture-final-2026-10-15.json) also pass with deliberately misclassified buyer demand, on-site and seller exclusions, owner isolation, one digest each and zero duplicate delivery. All four workspace builds, API/worker type checks, architecture and whitespace checks pass. Final live replay adds no spending or duplicate digests. The six live runs total $0.242423 in known model estimates and $0.28 in configured search reservations; failed-attempt costs, infrastructure and ordinary worker activity are excluded, and reservations are not invoices.

The [activation receipt](client-flow-activation-2026-10-15.json) confirms the verified worker started at 14:05:57 UTC because the prior worker was stopped. All nine queues are running; Temporal and Mailpit respond successfully, and 37 new planner tasks plus 20 new review tasks use the updated policies. No startup errors were observed. Existing settings, budgets and schedules were retained; no saved-user backfill was forced.

## Source expansion beyond Freelancer — 15 October

The [source-expansion summary](source-expansion-summary-2026-10-15.json) preserves the full live experiments and their failure diagnoses. New source coverage includes PeoplePerHour, Workana and direct organizational RFPs. All end-to-end runs use the same synthetic remote-work briefs, production use cases, disposable PostgreSQL schemas and local Mailpit; they do not modify saved-user scouts or contact buyers.

The early runs exposed several distinct losses: bidder-profile contamination on PeoplePerHour, a 5-second crawl-delay ceiling rejecting permitted RFP pages, a missing Chromium runtime, sparse Workana indexing under a monthly date filter, separate-word queries missing an intact deliverable phrase, navigation inheriting unrelated parent demand, and model countdown/country-code citations failing strict validation. The [capture audit](source-expansion-capture-verification-2026-10-15.json) records actual 30-second and 20-second waits followed by successful HTTP captures. The removed Dayton notice remains negative evidence. [Workana query probes](source-expansion-workana-undated-search-2026-10-15.json) document the difference between dated/tokenized searches and an undated coherent phrase.

Current versions are `client-demand-v6`, `google-search-v2`, `scout-planning-v13`, `peopleperhour-public-html-v2`, `public-document-v9`, `lead-evidence-v5:deadline-evidence-v2:buyer-category-v1`, and `evidence-prompts-v9`. Only Workana discovery queries omit the date filter; availability is still determined from current source evidence. Remote requirements and supplier-eligibility uncertainty remain in private matching. Relative countdown normalization validates every quote against the source before retaining an unknown absolute deadline. The [recorded-output replay](source-expansion-deadline-replay-2026-10-15.json) shows both observed countdown failures repaired while fabricated quotations remain rejected.

Upwork returned source HTTP 403; Guru's robots policy returned HTTP 403. These sources remain inaccessible through the public reader. C40's PDF request was denied; PDF extraction was not added. Social robots denials remain enforced. Workana pages and direct RFPs can establish buyer demand without establishing remote delivery; such requests must not become recommendations for a mandatory-remote brief merely because their deliverables are digital.

The browser failure was environmental: Playwright 1.61.1 had no matching local Chromium binary. Installing its supported headless shell restored all nine real-browser checks. Source bundles remain capped at 12 requests/6 MB, with a 45-second deadline, 30-second maximum crawl delay, 60-second worker activity and 75-second shared operation/host lease.

| Run                                                                     | Leads | Complete captures | Completed fit assessments | Recommendations | Digests |
| ----------------------------------------------------------------------- | ----: | ----------------: | ------------------------: | --------------: | ------: |
| Initial projects                                                        |    30 |                 4 |                         2 |               0 |       0 |
| Initial services                                                        |    26 |                 5 |                         0 |               0 |       0 |
| Revised projects                                                        |    40 |                 1 |                         1 |               1 |       1 |
| Revised services                                                        |    26 |                 5 |                         1 |               0 |       0 |
| Pre-verification projects                                               |    30 |                 3 |                         1 |               0 |       0 |
| Pre-verification services                                               |    31 |                 4 |                         4 |               1 |       1 |
| [Verified projects](source-expansion-projects-verified-2026-10-15.json) |    40 |                 2 |                         2 |               1 |       1 |
| [Verified services](source-expansion-services-verified-2026-10-15.json) |    32 |                 5 |                         4 |               1 |       1 |

The latest verified reports are the canonical results. Earlier files containing `final` preserve the pre-verification experiment: the project run exposed another genuine countdown quotation rejected by the model-output schema. Both verified runs now have zero rejected reviews, zero rejected fits and zero review failures. Replay adds no spending or duplicate delivery.

The project recommendation is a PeoplePerHour React.js/Node.js management-system request; the service recommendation is a PeoplePerHour catering-business website redesign. Both explicitly state remote work and open proposals. Two Workana requests and the Achievement First RFP reached assessment but were withheld because mandatory remote delivery was unconfirmed. A React Native mobile request was excluded against the web-development target, and the removed Dayton notice was classified closed. These are inspected development examples; independent usefulness, precision and recall remain unmeasured. Undated Workana searches can return older listings, and five of twelve final reads remained inaccessible.

Validation passes **182 checks**: 130 focused unit checks, 40 isolated database checks, nine real Chromium checks and three report-summary checks. Core, adapters, workflows and worker builds pass, alongside API/workspace type checks, architecture and whitespace checks. Across the eight full live runs, known model estimates total **$0.382076** and configured search reservations total **$0.34**. Separate source/query/model audit calls, seven attempts without cost estimates, infrastructure and ordinary worker activity are excluded; reservations are not invoices.

The [activation receipt](source-expansion-activation-2026-10-15.json) confirms a graceful worker restart at 15:06:54 UTC and all nine queues running, with Temporal and Mailpit returning HTTP 200. Budgets, schedules and provider settings were retained. A pre-existing Remote.com Greenhouse employment-feed failure remains visible in ordinary worker activity; it is separate from the verified project/service flows. No saved-user backfill or forced rescheduling was performed.

## Supported access and model outage — 15 October

The [supported-access summary](supported-access-summary-2026-10-15.json) records this subsequent increment and preserves incomplete attempts. It supersedes the earlier PDF limitation: permitted PDFs now have binary-safe transport and bounded text extraction. Query policy is `client-demand-v7`, shared document/capture identity is v10, and dedicated parsers are `public-pdf-v1` and `bluesky-public-v1`. The [implementation notes](../../docs/engineering/scoutalert-deeper-source-discovery.md#supported-pdf-and-public-post-access--15-october) describe the boundaries.

The model provider returned `credit_balance_exhausted`. The user requested completion of available checks and a report of blocked AI tests. The final live web runs therefore explicitly disabled AI planning, source review and matching; assertions confirm no reasoning tasks, review attempts, fit attempts or AI budget reservations. Zero recommendations in these runs is **not** a measured rejection rate or a successful recommendation-quality test.

| Final capture-only run | Search calls | Leads | Complete source captures / reads | Model calls |
| --- | ---: | ---: | ---: | ---: |
| [Projects](supported-access-projects-capture-only-2026-10-15.json) | 4 | 11 | 2 / 6 | 0 |
| [Services](supported-access-services-capture-only-2026-10-15.json) | 4 | 33 | 5 / 6 | 0 |

Both cases terminate, preserve owner isolation and replay without extra spending. The service captures include PeoplePerHour briefs, a Workana request and a removed notice. The project captures include a directory and templates page; useful project demand is unproven. Classification, current availability and private fit still require fresh review. The two runs reserve $0.08 for Serper and zero for AI; this excludes earlier diagnostics and ordinary worker activity and is not a billing total.

The [revised source audit](supported-access-source-audit-revised-2026-10-15.json) extracted all six pages from each of two real public PDFs: 11,887 and 9,972 characters. These historical RFP documents demonstrate parsing, not open opportunities. The [initial audit](supported-access-source-audit-2026-10-15.json) is retained: it exposed inherited Node CLI flags preventing the PDF worker from starting. The revised worker clears those flags. Guru's robots request returned HTTP 403 and remains restricted.

The [final Bluesky read](supported-access-bluesky-final-2026-10-15.json) captured an exact observed post through the official unauthenticated API in one request. External preview copy was excluded; primary text and its observed link were retained. Another post with unread attachment/context remains incomplete. The [direct search probe](supported-access-bluesky-search-2026-10-15.json) returned HTTP 403, so this establishes supported post reading, not native search or useful demand.

The existing native X integration successfully executed both [project](supported-access-native-projects-2026-10-15.json) and [service](supported-access-native-services-2026-10-15.json) queries. Each returned zero posts. Their generic recorded check labels name downstream components, but no source review, fit or delivered recommendation was exercised. Their saved reservations total $0.10; an earlier project diagnostic failed while writing its report and is excluded from this subtotal.

The [model-outage diagnostic](supported-access-services-diagnostic-2026-10-15.json) retained four successful searches, 33 leads and no document actions after a fallback stall. Duplicated URLs had different parent/title provenance between the conservative fallback and contextual menu; persistence repeatedly refused the decision. The planner now returns the matching current menu entry. The [controlled-outage full-flow fixture](supported-access-fallback-fixture-2026-10-15.json) finishes both scenarios through real PostgreSQL and local Mailpit, with one recommendation/digest each, seller/on-site exclusions, owner isolation and no duplicates. Search, HTTP and review/fit responses in that fixture are authored; it proves orchestration and failure recovery, not live model quality.

Verification passed the standard worker suite (322 tests; opt-in checks skipped), 56 isolated database checks, and the 27-test browser/capture suite including nine actual Chromium checks. The final PDF suite passes all ten checks, including redirect access boundaries; three report-summary checks pass. Counts overlap and must not be added as unique tests. Core/adapters/worker builds, API/web/worker types, architecture and whitespace checks pass. A stale review-policy integration fixture and an incorrectly shaped redirect fixture were corrected before their successful reruns.

Upwork needs explicit permission for ScoutAlert's commercial use; its standard API program does not grant that. Guru API scope is unconfirmed, and Facebook/LinkedIn approval remains absent. The [provider access guide](../../docs/engineering/scoutalert-provider-access.md) links current application information and distinguishes documented capabilities from unavailable or unverified routes. Fresh AI planning, source classification, fit and live recommendation validation remain blocked by credits. No provider application or external support message was submitted.

The [activation receipt](supported-access-activation-2026-10-15.json) records the worker restart after these available checks. It verifies process/queue startup, not completion of the blocked AI tests.

```sh
# Complete pipeline with authored source/review/fit fixtures and an unavailable planner.
node scripts/evaluation/check-client-flow-fixture.mjs /tmp/new-outage-fixture.json --planning-unavailable
# Bounded paid search and public capture only; zero model calls.
node scripts/evaluation/check-live-scout-quality.mjs --scenario=projects --without-ai --output=/tmp/new-project-capture.json
node scripts/evaluation/check-live-scout-quality.mjs --scenario=services --without-ai --output=/tmp/new-service-capture.json
```

## Checks without AI and PDF persistence repair — 28 October

The [current summary](supported-access-no-ai-summary-2026-10-28.json) records the available checks after the user asked to continue without AI. The earlier [model preflight](supported-access-preflight-2026-10-28.json) returned `429 credit_balance_exhausted`; no further model calls were made. Local database, Mailpit and Chromium readiness passed. These runs use synthetic profiles, disposable PostgreSQL schemas and the production discovery use cases.

| Fresh capture run | Search calls | Leads | Complete captures / source reads | AI calls |
| --- | ---: | ---: | ---: | ---: |
| [Projects](supported-access-projects-capture-only-2026-10-28.json) | 4 | 16 | 3 / 6 | 0 |
| [Services](supported-access-services-capture-only-2026-10-28.json) | 4 | 28 | 5 / 6 | 0 |

The project run includes two incomplete browser captures and a failed PDF persistence operation. Its complete captures are employment/recruitment/consultancy pages, so useful project demand remains unproven. The service run captured two Workana briefs, an RFP guide, an Achievement First notice and a Saugatuck RFP PDF; Instagram remained restricted by crawl policy. Completeness does not establish current availability or fit. Both cases terminate and preserve owner isolation and replay without extra spending. Their Serper reservations total $0.08; this excludes the earlier search preflight, ordinary worker activity and billing adjustments.

The [PDF diagnostic](supported-access-pdf-diagnostic-2026-10-28.json) found 23 U+0000 characters in the instructor-profile PDF encountered by the project run. PostgreSQL cannot store these characters in text/JSONB, so the capture had failed during persistence. `public-pdf-v2` preserves each position with U+FFFD and marks the capture `source_pdf_invalid` and incomplete. Shared document identity advances to `public-document-v11`; the HTML capture fingerprint remains unchanged. A real parser regression and a real database integration regression cover the defect.

The [live recapture](supported-access-pdf-recapture-2026-10-28.json), seeded from the original report using this [case packet](supported-access-pdf-recapture-cases-2026-10-28.json), successfully persisted all 4,635 characters with 23 replacement markers and no null characters. The lead remained incomplete and unpromoted. The bounded flow also followed the site's advertised sitemap index and correctly limited an oversized child sitemap. Its six search operations replay recorded observations: there were zero search-provider requests and zero model calls. This is a persistence/access regression, not a new discovery or relevance measurement. The original failed receipt is retained.

The [fallback fixture flow](supported-access-fallback-fixture-2026-10-28.json) passed both scenarios with authored search, HTTP and review/fit responses, real persistence and local Mailpit: one recommendation and one local digest each, no duplicate emails, seller/on-site exclusions and owner isolation. It proves orchestration without a planning provider; it does not validate live AI judgment.

Verification passed 95 source/browser/planning checks before the PDF repair, including nine actual Chromium checks. After the repair, 31 focused PDF/Bluesky/planning checks and 57 isolated database checks passed. These counts overlap and must not be added as unique tests. Three report-summary checks, adapters/worker builds, architecture and whitespace checks also passed. No environment/budget edits or worker restart were performed during validation. Commit state in the dated receipts reflects the time of those checks.

Fresh AI planning, source review, matching and recommendation-quality validation remain blocked by the recorded provider-credit error. Upwork, Guru and approved Facebook/LinkedIn access requirements remain as documented in the [provider guide](../../docs/engineering/scoutalert-provider-access.md); this increment does not establish new access to them or revalidate native X. No captured lead is claimed as a verified recommendation.

## Live AI verification under the shared token cap — 29 October

The [live summary](token-budget-live-summary-2026-10-29.json) supersedes the provider-credit blocker above. The [model preflight](token-budget-model-preflight-2026-10-29.json), two fresh searches and two source recaptures completed with live AI. Every generation used the running worker's PostgreSQL token ledger and unchanged **2,400,000 input-plus-output tokens per UTC day**. Scenario records remained in disposable test schemas; only token accounting used the worker database. The test harness now enforces this shared allowance instead of receiving a separate token budget.

| Run | Leads | Complete captures | Completed fit assessments | Recommendations | Local digests | Input + output tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [Fresh projects](token-budget-projects-live-2026-10-29.json) | 23 | 6 | 6 | 0 | 0 | 60,961 |
| [Fresh services](token-budget-services-live-2026-10-29.json) | 29 | 5 | 4 | 0 | 0 | 92,597 |
| [Recorded project recapture](token-budget-projects-recapture-2026-10-29.json) | 4 | 4 | 1 | 1 | 1 | 48,311 |
| [Recorded service recapture](token-budget-services-recapture-2026-10-29.json) | 2 | 2 | 1 | 1 | 1 | 27,045 |

Fresh project discovery reviewed six Workana buyer briefs. Fresh service discovery reviewed two Workana pages, an Achievement First RFP and two RFP PDFs. All ten completed fit assessments left the mandatory remote arrangement unknown, so none became recommendations. The two Workana service URLs appear to describe the same dental redesign request; URL counts do not establish distinct opportunities. AURA's PDF was captured and reviewed, but its review input exceeded 43,200 characters and remained unpromoted. CamTran's PDF exceeded the existing page limit and remained incomplete. Wave Transit's PDF reached fit assessment successfully. These limits remain coverage gaps.

The recapture runs seeded only URLs recorded in the 15 October reports, using the [project packet](token-budget-projects-recapture-cases-2026-10-29.json) and [service packet](token-budget-services-recapture-cases-2026-10-29.json). They made zero live search-provider requests. Both PeoplePerHour buyer briefs still stated remote work and available proposals, producing one React/Node management-system recommendation and one catering-website redesign recommendation. Each was delivered once to a synthetic local Mailpit recipient; repeated delivery sent nothing. Four seller pages reached by observed links were classified as service offers and excluded. These checks verify current capture, review, matching, availability and delivery; they do not prove fresh discovery recall.

All four flows completed planning and matching with zero review failures, rejected reviews or rejected fit outputs. Owner isolation and terminal replay assertions passed. The shared-budget helper passed two integration checks, the report summary passed three checks, and architecture passed across 10 workspaces and 395 sources. Including the 481-token preflight, **58 generation calls used 229,395 tokens**. At completion, shared daily usage was **1,927,818**, with zero retained reservations and **472,182 remaining**. These totals include ordinary worker activity; individual test usage is attributed separately in each receipt. The worker was briefly drained to preserve remaining capacity, then [restarted with the same cap](token-budget-live-activation-2026-10-29.json). No budget increase or reset was performed.

Independent human usefulness, precision and recall remain unmeasured. Upwork, Guru, approved Facebook/LinkedIn access and native social discovery were not exercised by these runs. Fresh discovery's lack of confirmed remote candidates remains a retrieval/evidence gap even though the live AI and seeded delivery paths passed.

## Independent model allowances — 29 October

The [two-model activation receipt](model-budgets-activation-2026-10-29.json) records configurable daily allowances of 250,000 input-plus-output tokens for GPT-5.4 and 2,400,000 for GPT-5.4 mini, with a 2,650,000-token combined ceiling. The existing ledger already records the requested model and actual usage, so no further migration or reset was needed. Mini's earlier 2,398,042 tokens remain charged to mini. Model aliases and their reviewed snapshots share capacity; neither family can borrow the other's remaining tokens.

The configured split uses `gpt-5.4-2026-03-05` only for the short public search strategy and `gpt-5.4-mini-2026-03-17` for repeated discovery decisions, source review, extraction, employer research and fit. The strategy's serialized input is bounded to 2,000 bytes and output to 2,000 tokens; instructions and schemas still count toward input usage. Existing deterministic fallback and evidence requirements remain in force. The live harness now mirrors both model routing and independent limits.

Eighty focused checks, twelve isolated database checks, two shared-evaluation checks and three report checks passed. They cover concurrent independent limits, alias accounting, pre-existing usage, unknown outcomes, stricter global ceilings, blocked transport and model routing. Core, adapters and worker builds plus architecture checks passed. Both pinned models were accessible through read-only API model retrieval. These checks used zero generation tokens; live two-model generation quality and the pending full discovery AI tests were not rerun. The worker was restarted with all nine queues running. At activation verification, ordinary worker activity had recorded 509 GPT-5.4 tokens while mini remained at 2,398,042; this is separate from test spending. This configuration change does not establish an improvement in recommendation quality.

## Remote buyer discovery and daily-cap validation — 29 October

The [remote-discovery summary](remote-discovery-summary-2026-10-29.json) records the subsequent improvement. At its start the shared worker had used **2,398,042 of 2,400,000 tokens**, leaving **1,958**. The [production guard check](remote-ai-budget-block-2026-10-29.json) rejected the updated planner before input counting or generation. All checks in this increment used **zero model tokens**; the cap and counters were not changed. Fresh AI source review, fit and recommendation-quality validation remain pending until the next daily reset, **30 October at 01:00 Africa/Lagos**.

New `client-demand-v8` cases mix two remote-focused queries with two broad buyer queries. PeoplePerHour searches now omit the monthly index filter, since index age does not establish current availability. Long public skill stacks are no longer required as one exact phrase in the focused queries. The [initial probes](remote-query-probes-2026-10-29.json) found remote candidates; [open-status probes](remote-open-query-probes-2026-10-29.json) also exposed stale and bidder-contaminated snippets, so their wording was not adopted as proof of availability.

Routing favors relevant individual remote hints, reduces priority for explicit closed/negated/seller hints, and does not transfer a directory's remote wording to its children. Source links receive consistent topic ranking. After two source-reviewed buyer briefs leave remote work unconfirmed, the planner reserves an unused query within the existing limits. The ten-document contextual shortlist retains its admitted deterministic fallback: a failing regression reproduced premature termination when diversity selection omitted that route. Frozen older query vocabularies remain available. Planner `scout-planning-v14` reinforces these evidence boundaries; the updated model prompt has not yet been evaluated live.

PeoplePerHour's expired pages can point their canonical link at their category. Parser `peopleperhour-public-html-v3` now retains explicit expired/paused/archived status only when the exact numeric project ID and immediate same-origin category match. Open listings still require their own canonical project identity. Shared source identity advances to `public-document-v12`; bidder/profile text remains excluded. Two real expired pages now capture their negative evidence instead of returning an unrecognized-structure failure.

| Final no-model fallback run | Search calls | Leads | Complete captures / reads | AI calls |
| --- | ---: | ---: | ---: | ---: |
| [Projects](remote-projects-final-2026-10-29.json) | 5 | 44 | 2 / 6 | 0 |
| [Services](remote-services-final-2026-10-29.json) | 4 | 40 | 5 / 6 | 0 |

The project flow captured a React/TypeScript SaaS brief explicitly stating “Remote project” and “Open for bidding.” The service flow captured ArtStart's remote website-redesign RFP with a 13 November proposal deadline. A [separate primary-source audit](remote-primary-source-audit-2026-10-29.json) followed an observed directory link to an open remote WordPress redesign brief; its other project candidate had been canceled, despite its search snippet. These are current source observations, **not completed AI fit assessments or personal recommendations**. Four of six project reads and one service read remained incomplete or inaccessible. Earlier diagnostic receipts are retained in the summary; they are not the final results.

The [complete fixture flows](remote-client-flow-fixture-final-2026-10-29.json) verify matching, availability, seller/on-site exclusions, owner isolation and one local Mailpit digest per scenario with no duplicates, using authored search/model responses. Final focused checks, 31 isolated PostgreSQL checks, three report checks, core/adapters/worker builds, worker types, architecture and whitespace checks pass. Test counts across reruns overlap. The diagnostic search runs and probes reserve a combined $0.40 for 40 search calls; this excludes ordinary worker activity, source-read infrastructure and billing adjustments. No provider access controls were bypassed.

Use `--without-ai --planning-fallback` with `check-live-scout-quality.mjs` to test current production fallback planning without model calls; the repository stub reports reasoning unavailable and assertions require zero AI records/reservations. Plain `--without-ai` preserves the older capture-only path. After the allowance resets, run the ordinary project/service commands without either flag to complete fresh AI validation through the same shared token ledger. Independent usefulness, precision and recall remain unmeasured.

## Selective GPT-5.4 review and mini execution — 29 October

The [activation receipt](selective-review-activation-2026-10-29.json) supersedes the earlier strategy-only allocation. Mini now handles routine strategy, action selection, source review, extraction, public research and private fit. GPT-5.4 receives selected completed mini assessments with cited conflicts, conditional eligibility or complex procurement requirements, plus one bounded recovery decision for a stalled discovery case. A deterministic 5% sample covers both accepted and rejected private fit assessments. It does not sample every rejected raw search result, and the English routing patterns are not exhaustive.

Daily caps remain **250,000 full-model tokens, 2,400,000 mini tokens and 2,650,000 combined**, counting input plus output. The full-model allowance contains **225,000 for required reviews/recovery and 25,000 protected for audits**; both allocations and the sample percentage are configurable. No allowance borrows from another. The [migration receipt](selective-review-migration-2026-10-29.json) confirms all earlier usage remained unchanged when reservation purpose and private review links were added.

**144 automated checks passed:** 92 focused routing/evidence/configuration/transport checks, 50 disposable-database checks, and two shared-evaluation checks. These include concurrent allocation limits, private cache isolation, failed and expired expert leases, one recovery attempt per case, and no repeated spending after failure. Required failed reviews hold publication; optional failed audits retain a valid mini assessment. Core, adapters and worker builds, architecture checks across 405 sources, and whitespace checks passed.

The [live expert smoke receipt](selective-review-live-2026-10-29.json) records three passing cases: correcting an approval that missed a contractor residence restriction, correcting a rejection for an eligible contractor, and refusing to infer remote work when it was unstated. These used **three GPT-5.4 calls and 9,816 tokens**, of which 3,293 came from the audit allocation. Source texts and mini baselines were authored fixtures; no mini generation, live source retrieval or email occurred. This verifies the native expert provider and domain boundaries, not a measured advantage over mini or complete discovery quality.

Mini remained at **2,398,042 used / 1,958 remaining**. The [mini guard receipt](selective-review-mini-guard-2026-10-29.json) confirms the newly configured routine planner was denied before generation and usage stayed unchanged. Fresh project/service flow and a representative labelled model comparison remain pending until capacity resets at **01:00 Africa/Lagos on 30 October**; no limits were raised or counters reset. At activation, GPT-5.4 had used 15,622 tokens in total, with no retained or unknown reservations. The old worker drained all nine queues and the rebuilt worker started all nine with no startup errors.

## Expanded GPT-5.4 live checks — 29 October

The [initial consolidated report](expert-review-summary-2026-10-29.json) recorded **12 of 14 scenarios passed** after targeted retesting. The [final audit completion](expert-audit-final-summary-2026-10-29.json) now records **all 14 passed** following the authorized allocation change below. Nine fit cases cover conflicting country policies, buyer location versus contractor eligibility, mandatory on-site attendance, supplier qualifications, optional skills, embedded source instructions, incomplete source context, and mistaken approvals/rejections. Three recovery cases select a remote buyer over sellers, a readable buyer after denied access, and a remote-focused query after repeated unknown arrangements. Reviews and recovery decisions traverse their production use cases and PostgreSQL leases; a fresh-run/cache replay makes no additional model call.

The [first run](expert-review-expanded-2026-10-29.json) passed nine cases and encountered five provider/transport failures. [Ledger timings](expert-review-timings-2026-10-29.json) place four failures near the 25-second SDK deadline; the fifth returned HTTP 520. Expert fit requests now allow 40 seconds inside the existing 55-second lease, with retries still disabled. The [targeted retest](expert-review-targeted-retest-2026-10-29.json) passed the three required-review cases; one valid response took 28.75 seconds. All returned model assessments satisfied their predeclared checks. The failed/unknown calls remain in the ledger and original receipts.

**Two recorded-source audits were still unverified at that checkpoint.** They reuse the earlier real mini assessments and captured PeoplePerHour project/service pages. Both initial calls failed near the old deadline. The audit allocation then had **4,264 tokens remaining**, less than either complete input-plus-output reservation (5,853 and 6,098), so they were not retried or relabelled as standard work. The ordinary full-model allocation still has capacity; the protected audit allowance remains enforced independently.

Across 17 generation attempts, **12 completed calls reported 32,026 tokens** and **five unknown outcomes retain 27,937 tokens**. Total accounted test spending is **59,963**, below the 80,000-token batch ceiling; the retest's additional ceiling was reduced to 28,248 after the first run. There were zero mini generations, fresh searches, source reads, availability checks or emails. At final verification, GPT-5.4 had **47,648 used + 27,937 retained**, leaving **174,415 of its 250,000 daily cap**. Mini remained at 2,398,042 used. No model, audit or combined limits changed.

Eight focused tests and two isolated budget-integration checks passed, including concurrent test-ceiling admission, idempotent settlement and retained unknown usage. Adapters/worker builds, architecture and whitespace checks passed. The worker restarted with all nine queues running and no startup errors. The corpus includes authored edge cases and two recorded-source audit attempts; labels were fixed before generation, but independent human usefulness, representative quality and comparative model accuracy remain unmeasured. Fresh project/service discovery still requires mini capacity.

## Audit allocation and remaining tests completed — 29 October

The user authorized increasing the audit allocation within the existing GPT-5.4 cap. The [reallocation receipt](expert-audit-reallocation-2026-10-29.json) verifies **40,000 audit tokens + 210,000 standard tokens = 250,000 GPT-5.4 tokens**. Mini remains capped at **2,400,000**, and the combined cap remains **2,650,000**. Only the ignored local `SCOUT_AI_AUDIT_DAILY_TOKENS` setting changed; the 5% sample policy and all recorded usage/uncertain reservations were preserved.

The [two remaining audits](expert-audit-completion-2026-10-29.json) both passed, using **7,855 GPT-5.4 tokens** and zero mini tokens. Source citations, expected criteria, owner isolation, durable completion and replay without further spending passed. The recorded project review left experience unknown instead of preserving mini's earlier positive experience assessment; both reviews kept location and authorization unknown. The project review took 37.7 seconds and completed within the new 40-second deadline. These are reviews of earlier source captures, not new availability checks.

The [final summary](expert-audit-final-summary-2026-10-29.json) supersedes the pending status: **14 of 14 expert-stage scenarios passed** across the three runs. The complete batch accounted for **67,818 tokens**: 39,881 reported by 14 completed generations plus 27,937 retained for five earlier unknown outcomes, below its 80,000-token ceiling. No allowance or failed reservation was reset. GPT-5.4 had **166,560 tokens remaining**, including **11,409 remaining audit tokens**, at final verification. The worker restarted with the new allocation and all nine queues running without startup errors. Fresh end-to-end project/service discovery and independent model-quality validation remain separate from this completed expert-stage suite.

The subsequent [full-discovery budget preflight](full-discovery-budget-preflight-2026-10-29.json) rechecked the live ledger: GPT-5.4 had **166,560 tokens remaining**, but mini had only **1,958**. Both project and service planning requests were rejected by the production token guard before input counting or generation; the configured planning output reservation alone is 2,000 tokens. HTTP interception verified zero provider calls, and before/after ledger snapshots were identical. These are passing budget-guard checks, not completed discovery tests. The full project/service tests remain pending until mini capacity resets at **01:00 Africa/Lagos on 30 October**. All model, audit and combined caps, routing and existing reservations were preserved.

## Full-discovery allowance recheck — 30 October

The [new-day preflight](full-discovery-budget-preflight-2026-10-30.json) confirmed that the daily reset occurred, but subsequent deployment activity had already used **2,254,593 mini tokens**, with **143,239 retained** for uncertain outcomes, leaving **2,168 of 2,400,000**. The reservation history contained 584 completed mini calls and 26 unknown outcomes; completed calls ranged from 00:00:05 to 12:02:02 UTC. GPT-5.4 had **43,312 remaining**, comprising **3,312 standard** and **40,000 protected audit** tokens. Model allowances and purposes remain separate.

Native input counting returned 341 tokens for project planning and 338 for service planning. Including each request's 2,000-token output reservation requires **2,341** and **2,338** tokens respectively, so the production guard rejected both before generation. Source review also cannot fit its 4,000-token output reservation. Two input-count requests, zero generations, no token reservations, and identical before/after ledger snapshots were recorded. Full discovery, matching and delivery remain pending; these checks do not establish recommendation quality. No caps, routing or uncertain reservations changed. The next daily reset is **01:00 Africa/Lagos on 31 October**.

## Full live project and service tests — 1 November

The [consolidated report](full-discovery-summary-2026-11-01.json) completes the pending live discovery checks after the user replaced the exhausted Serper key locally. The initial [credit failure](search-provider-preflight-2026-10-31.json), [unsuccessful fresh project run](full-projects-live-2026-10-31.json), [seeded project recapture](full-projects-recapture-2026-10-31.json), and first funded [project](full-projects-live-funded-2026-10-31.json)/[service](full-services-live-2026-10-31.json) runs remain as diagnostic evidence. Seeded recapture made no live search requests. The first funded service run incorrectly included a paused PeoplePerHour listing, so its three dashboard results must not be reported as three verified open recommendations.

Three repairs address the observed failures. PeoplePerHour parser `peopleperhour-public-html-v4` propagates explicit non-open platform status through complete primary captures into an independent domain publication guard; even a positive model verdict cannot publish it. A fresh closed capture withdraws a previously published posting. Shared source identity advances to `public-document-v13`, and public review to `lead-evidence-v6`. Mini `evidence-prompts-v10` and expert `expert-fit-v2` distinguish employer preferences from mandatory restrictions and leave missing required-skill evidence unknown. The expert serializes repeated exact quotations as references to retained original passages, preserving provenance, completeness and unmatched literal claims under the unchanged 24,000-byte ceiling. Pinned models and limits remain unchanged; the prompt changes follow [OpenAI's guidance on explicit instructions, pinned snapshots and evaluations](https://developers.openai.com/api/docs/guides/prompt-engineering).

The [targeted live regression](discovery-regressions-live-2026-11-01.json) passed both cases using **6,354 tokens** under its additional 20,000-token invocation ceiling. Mini changed the UK-preferred location conflict to unknown. The expert packet shrank from **28,223 to 7,723 bytes**, completed successfully and kept unproven mandatory AEM experience unknown. This test reused captured source text and did not publish the paused preference example.

| Final fresh flow | Successful searches | Leads | Complete captures / reads | Completed fit assessments | Dashboard recommendations | Local digests | Input + output tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [Projects](full-projects-verified-2026-11-01.json) | 6 | 48 | 5 / 6 | 1 | 1 | 1 | 57,461 |
| [Services](full-services-verified-2026-11-01.json) | 4 | 40 | 5 / 6 | 3 | 2 | 1 | 59,863 |

Both final flows completed matching with zero failed searches, source-review failures, rejected reviews, rejected fits or failed intelligence attempts. All three recommendations cite explicit remote work and have available status at capture: one Freelancer Web3 frontend project and two PeoplePerHour website redesign requests. The synthetic briefs permit reviewing unknown eligibility; contractor location/authorization and some required skills remain unresolved and visible. Achievement First's RFP was reviewed but withheld because mandatory remote work remained unconfirmed. **Five closed PeoplePerHour listings were excluded**, including both paused service briefs. The project flow also completed one GPT-5.4 recovery decision using 5,703 tokens; three later unattempted recovery records made no calls or reservations.

Both cases honestly retain `partial / some_sources_unavailable`: Freelancehunt denied access and Instagram denied crawling. No access controls were bypassed. Owner isolation, observed-link provenance, terminal replay without new spending, and repeat delivery without duplicate messages passed. All emails went to synthetic local Mailpit recipients. **51 focused tests and 28 isolated PostgreSQL integration tests passed**, including withdrawal after a later closed capture despite a positive model review. Core/adapters/worker builds, worker types, architecture and whitespace checks passed.

The complete diagnostic-and-verification batch used **333,643 tokens across 90 completed generations**; the final two full flows account for 117,324 of those tokens. The [final shared ledger](full-discovery-budget-final-2026-11-01.json) contains 339,333 used tokens, including 5,690 pre-existing mini tokens, with zero retained or unknown reservations. Remaining allowances are **230,290 GPT-5.4 tokens** (200,941 standard + 29,349 audit) and **2,080,377 mini tokens**. Daily limits remain **250,000 full, 2,400,000 mini and 2,650,000 combined**. These checks completed after midnight Africa/Lagos but before midnight UTC, so the ledger admission day is still 31 October; the automatic reset is 01:00 Africa/Lagos. No counters or caps were changed.

The background worker was already stopped when this work resumed; the evaluations ran the production use cases directly and did not restart it. Upwork, Guru, approved Facebook/LinkedIn integrations, PDFs and native social discovery were not exercised by the final runs. Independent human usefulness, precision, recall and representative model comparison remain unmeasured.

## Mini spending audit and reductions — 1 November

The [read-only audit](mini-spending-audit-2026-11-01.json) explains the rapid background usage after restart. Twenty active scouts could request a full search every ten minutes, while monitored-source and native-social updates also triggered assessment. The recent prompt-policy revision caused a one-time re-evaluation of older cached work; that spending is distinct from recurring duplication. On the 31 October UTC ledger day, recorded worker mini usage was led by fit (481,430 tokens), research (199,093), source review (104,517) and extraction (96,471). These task totals exclude disposable evaluation schemas and do not fully reconcile failed attempts lacking task-level usage; the shared reservation ledger remains authoritative.

Across successful worker fit attempts since 29 October, **30 calls consuming 186,248 tokens repeated the same scout revision, posting version, configuration and evidence**, allowing only research observation clocks to differ. That is a counterfactual reuse estimate, not refunded usage or a guaranteed future saving. Identical-text public reviews did not repeat in this sample; this change does not weaken public-review cache invalidation. Fifty-five recent fit inputs averaged 14,459 bytes of analysis plus 6,702 bytes of posting text, with facts and research repeating source passages.

Automatic full rediscovery now defaults to **60 minutes**, configurable through `SCOUT_DISCOVERY_REFRESH_MINUTES` (10–1440). Its theoretical recurring full-search frequency falls from 144 to 24 per scout per day; actual calls depend on active runs, source updates and the unchanged budgets. Initial/explicit activation and source monitoring remain independent. New discoveries that require full searches can appear later. Fit reuse now ignores observation clocks only after fresh, valid research is available, retaining exact owner/revision/policy/content boundaries and all old evidence and paid receipts. Changed fingerprints or evidence still require assessment, and pending expert review cannot become an approved cached result.

Mini's fit packet now includes each original source paragraph once, with references from extracted facts and research findings. An offline replay of **55 production cases reduced serialized payload bytes by 30.0%**, from 1,821,470 to 1,274,903 bytes. Only aggregate measurements were saved. The semantic prompt revision remains unchanged because this is an evidence-preserving representation change, avoiding another policy-wide cache invalidation.

The [live efficiency checks](mini-efficiency-live-2026-11-01.json) passed two recorded synthetic cases. Native input counts, using identical current instructions and schemas for comparison, fell from **3,968 to 2,768 tokens** for the project and **2,139 to 2,037** for the service. Both generated assessments retained explicit remote fit and unknown location/authorization; missing Web3 experience remained unknown. The two generations used **6,208 mini tokens** under the shared daily ledger and an additional 20,000-token evaluation ceiling. No expert generations, searches, fresh availability checks or emails were performed.

**61 focused checks and 21 isolated PostgreSQL checks passed**, covering concurrent cache reuse, fresh research links, stale/changed evidence, legacy results, private ownership, pending expert review, configurable cadence, replay and delivery. Adapters/worker builds, worker types, architecture and whitespace checks passed. No database migration, model change, cap increase, ledger reset or uncertain-reservation release was needed. The worker was temporarily drained during the repair to avoid spending on the known inefficiencies, then [restarted successfully](mini-efficiency-activation-2026-11-01.json) with all nine queues running, the 60-minute full-refresh setting and unchanged 250,000/2,400,000/2,650,000-token caps (40,000 audit tokens remain inside the full-model cap). Long-running production savings are not yet measured, and useful new discoveries still consume the unchanged allowance.
