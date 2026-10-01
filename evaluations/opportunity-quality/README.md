# Opportunity quality evaluation

This workspace separates implementation regressions, measured model behavior and independently reviewed quality evidence. It is not a production readiness certificate.

## Current review packet

The current packet is [`runs/2026-10-01-held-out/corpus.json`](runs/2026-10-01-held-out/corpus.json): eight frozen public postings from Figma, Remote and Freelancer, seven synthetic briefs and 56 comparisons. Briefs cover employment, contract roles and international client work, including a US/Nigeria comparison for the same design role, sponsorship requirements, minimum pay and explicit unknown policies. Four records are jobs and four are buyer requests. This is a deterministic convenience sample; the contract brief has negative examples but no dedicated contract-job source. It does not cover the whole market, all languages or representative user demographics.

Synthetic prior feedback is a separate, named input. Its posting identities cannot overlap the evaluated opportunities. It never becomes an expected relevance label, and no real profile, account or feedback history is exported.

The packet contains:

- `latest-report.json`: the 56-pair baseline under `evidence-prompts-v6`/`supported-criteria-v2`, with public extraction and employer research shared by posting, private assessments for every pair (including retrieval misses), PostgreSQL retrieval order, baseline/feedback rank, prompt-policy decisions, usage, latency and estimated USD. Corpus-level precision/recall and ranking improvement remain unknown until independent labels exist.
- `policy-replay.json`: a zero-model-call replay of the stricter `supported-criteria-v3` arrangement rule over the captured judgments. It withdrew one unsupported mandatory-remote acceptance. Earlier rejections stay rejected because the new rule only downgrades unsupported arrangement matches. It does not claim to be a full rerun of the new model prompts.
- `arrangement-regression.json`: two live calls under `evidence-prompts-v7`, confirming that hourly contract terms remain unknown as evidence of remote work.
- `research-regression.json`: six fictional policy checks through the actual model adapter. These cover universal and role-specific policy, a different role with conditional sponsorship, marketing, customer EOR services and malicious source instructions. They are implementation-authored regressions, not human quality labels.
- `retrieval-benchmark.json`: mixed job/client-request retrieval at 1,000 and 10,000 synthetic posting identities, with four and eight concurrent readers. The 10,000-posting/eight-reader run measured p50 43.45 ms and p95 70.47 ms, retaining the 200-candidate cap. This is a warm local PostgreSQL microbenchmark, not production capacity or end-to-end alert latency.
- `reviewed-metrics.json`: rescoring output once labels are imported; pending labels produce null quality rates, not invented accuracy.

The completed baseline used 68 model calls (8 extraction, 4 research, 56 fit), with USD 0.302521 estimated cost and provider p50/p95 of 4,508/6,753 ms. The six research regressions cost USD 0.011696; the focused arrangement regression cost USD 0.007411. These are the final packet’s measured runs, excluding the discarded development attempts recorded in the audit.

The older top-level corpus/reports remain the original two-posting pilot. `runs/development-run-audit.json` records discarded sampling/preflight runs and their cost limitations. They do not count as quality evidence.

## Blind human review

Start the local review tool:

```sh
node scripts/evaluation/serve-review.mjs evaluations/opportunity-quality/runs/2026-10-01-held-out/corpus.json
```

Open [the evidence review screen](http://127.0.0.1:3035/). It shows only frozen source text, captured employer evidence and synthetic briefs. It does not serve model outputs or previous human labels. Use the captured text for judgments; a linked live page may have changed. No application session is required. The server is read-only and listens on loopback; completed reviews stay in browser storage until exported. The screen includes evidence/brief navigation, custom validation and a reviewer attestation. Saving advances to the next pair. Export creates a JSON packet tied to this exact corpus.

Review every pair, including the ones retrieval did not select. `recommended` means an opportunity can be shown under the brief's confirmed must-haves and explicit unknown policies. It does not mean all facts are established. `prompt` requires support for all seven criteria (category, role, arrangement, location, experience, compensation and authorization), explicit personal declarations and applicable sponsorship evidence, with no unknown or conflicting criterion. Work authorization is user-declared, not legally verified. An excluded opportunity cannot qualify for a prompt alert.

For this isolated decision test, public text is replayed at a fresh logical clock and posting availability is assumed current. Original capture dates and content fingerprints remain in the corpus; no claim of current employer policy or live posting availability is made. Source availability and actual email gates have separate worker/integration tests.

Import into a **new label version**, preserving the original evidence and earlier judgments:

```sh
node scripts/evaluation/import-reviews.mjs \
  evaluations/opportunity-quality/runs/2026-10-01-held-out/corpus.json \
  /absolute/path/to/exported-reviews.json \
  evaluations/opportunity-quality/runs/2026-10-01-held-out/reviewed-corpus.json

node scripts/evaluation/score-report.mjs \
  evaluations/opportunity-quality/runs/2026-10-01-held-out/reviewed-corpus.json \
  evaluations/opportunity-quality/runs/2026-10-01-held-out/policy-replay.json
```

Imports reject mismatched corpora, duplicate/dangling pairs, incomplete attestations, contradictory prompt labels and conflicting overwrites. Review metadata is a human attestation, not external identity verification. AI-generated judgments cannot be submitted as independent human labels. Different human opinions should be preserved as separate versions and adjudicated; the importer does not silently choose a winner.

## Measurement interpretation

The scorer reports assessment precision/recall, retrieval recall, pipeline precision/recall, prompt-policy errors and exact error case IDs. Review and measurement coverage are explicit: failed/malformed attempts are never counted as negative predictions. Rates computed on a partial reviewed subset describe only that subset. No release threshold is inferred from incomplete reviews.

Ranking uses binary human relevance, NDCG@3, precision@3 (unfilled slots count as zero), recall@3 and reciprocal rank. It compares baseline ordering with the existing capped feedback policy and reports how many relevant results reach the first eight candidate slots. Ranking comparisons require **every pair for a brief** to be measured and reviewed; partially labeled briefs produce no uplift claim. The candidate set stays fixed, so feedback cannot repair a retrieval miss. A nonzero change on a small synthetic-history sample does not establish personalization quality for real users.

All corpus pairs receive fit assessment to expose retrieval misses; this diagnostic run deliberately does more work than a production run's bounded candidate admission. Reported cost is evaluation cost, not an estimate of cost per active user. A frozen convenience sample and local benchmark cannot establish population relevance, missed-opportunity rates, production load capacity or delivery latency. Broader source/cohort sampling and independent labels remain necessary.

## Reproduction and budgets

Build core/adapters before running. Database scripts use disposable schemas in `scoutalert_test` and clean them up on completion or interruption. No script changes a real scout or sends email. The arrangement normalizer currently recognizes explicit English work-location terms; unsupported or ambiguous wording stays unknown and needs broader multilingual evaluation.

```sh
# Capture into a new timestamped directory; existing corpora are never overwritten.
node scripts/evaluation/capture-corpus.mjs

# Current 56-pair packet: eight extractions, up to four employer research calls, 56 fits.
SCOUT_EVAL_MAX_REQUESTS=68 SCOUT_EVAL_MAX_USD=5.10 \
  node scripts/evaluation/run-corpus.mjs \
  evaluations/opportunity-quality/runs/2026-10-01-held-out/corpus.json \
  /absolute/path/to/new-report.json

node scripts/evaluation/check-research.mjs /absolute/path/to/research-report.json
node scripts/evaluation/benchmark-retrieval.mjs \
  evaluations/opportunity-quality/runs/2026-10-01-held-out/corpus.json \
  /absolute/path/to/benchmark-report.json
node --test scripts/evaluation/corpus.test.mjs scripts/evaluation/quality-metrics.test.mjs
```

The runner defaults to 24 attempts/USD 2, refuses to overwrite earlier paid results, validates all briefs before any model call and persists each cost reservation before sending the request. Failed attempts retain their reservation. Captured source text is reused across briefs; client requests skip employer recruiting-policy research. These standalone evaluation budgets are separate from the running worker's daily budget. `SCOUT_BENCH_SIZES` can select up to four local sizes, each at most 50,000 synthetic identities.

Costs use [published standard-tier GPT-5.4 mini rates](https://developers.openai.com/api/docs/models/gpt-5.4-mini), distinguish cached input and retain a pricing version. Unknown or failed calls are not free: reservations remain while measured USD covers priced responses. Estimates are not invoices. The workflow follows [task-specific evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices), with independent labeling and explicit coverage limitations.
