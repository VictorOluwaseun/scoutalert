# Client-project and service-request discovery

The first marketplace integration prioritises international remote projects, as requested. Freelancer public buyer requests supply fixed-price projects and hourly service work. This is one marketplace with two feed segments; it is not broad multi-marketplace coverage. Figma and Remote job-board discovery continues separately.

## Run the integration smoke check

Build `@repo/core` and `@repo/adapters`, then run from the repository root:

```sh
node scripts/check-marketplace-discovery.mjs
```

The check makes read-only public API requests, uses a disposable schema in `scoutalert_test`, creates a synthetic scout targeting one captured title, and removes its schema afterward. It never alters real scouts, uses a browser session, calls an AI provider or sends an email. It validates collection, evidence publication, retrieval, provisional matching, owner isolation, relevance ranking, availability, delivery reservation and hiding. `latest-smoke.json` records the measured result. An unavailable or changed selected posting fails the check rather than being reported as verified.

Run the regression suite with `SCOUTING_INTEGRATION=1 TEMPORAL_INTEGRATION=1 pnpm --filter worker test`. Unit fixtures exercise malformed responses, unexpected categories, source allowlisting, stable IDs, content changes, unknown availability and non-compounding feedback. Integration fixtures cover rolling-window absence, freshness expiry, versioning, owner isolation, feedback undo, service reconciliation and email reservation gates.

For an explicitly paid model smoke check, run `node scripts/evaluation/check-marketplace-fit.mjs` after the integration check. It reads the selected public posting again and makes exactly two bounded model calls using a synthetic brief. Maximum conservative reservation is $0.15; no automatic retries or real personal data. `latest-fit.json` records usage, cost estimates and criteria. This checks category handling, source citations and explicit unknowns, not independent relevance quality.

## Recorded checks

The latest integration smoke on 1 October 2026 at 11:17 UTC fetched 378 eligible public requests and passed all ten checks in 3.1 seconds. It verified collection through provisional matching, availability and idempotent delivery reservation using a synthetic scout. No email or model request was sent.

A separate read-only runtime check confirmed that the running worker had published 378 requests at 11:15 UTC, with no recorded Freelancer source error. The native `scout-source-freelancer-v1` schedule was enabled at five-minute intervals. These observations describe the local runtime at the time of the check; `latest-smoke.json` records the independent integration run.

An earlier two-call AI smoke correctly identified the client-request category while leaving arrangement, location, experience and authorization unresolved; estimated model cost was $0.007086. That report used `evidence-prompts-v6` and `supported-criteria-v2`, so it is historical evidence rather than a validation of the current assessment policy. Current policy regression and quality evidence are documented in [opportunity quality](../opportunity-quality/README.md). The prior marketplace implementation pass recorded 77 worker checks, 15 API integration checks and 12 focused marketplace checks; those suites were not rerun for this read-only verification.

These are bounded execution checks, not evidence of real-world relevance, global coverage or production capacity. See the JSON reports for timestamps, source identity and detailed observations.

## Coverage and policy limits

- Shared refresh every five minutes; up to 200 fixed-price and 200 hourly entries, before exclusions. Maximum two simultaneous requests, four reads total, 40-second aggregate timeout, eight-megabyte decoded cap per response. No complete-marketplace or guaranteed no-gap claim.
- Private, local-only and direct-hire listings are excluded. A global platform or a non-local flag does not prove remote delivery or worldwide supplier eligibility; confirmed scout requirements still decide acceptance.
- Requests retain their original source URL, project ID, description, skills, budget currency and period. Buyer identity and indicative budgets are not independently verified. No bidding, applications, account creation or external messaging is implemented.
- Rolling-feed absence is not closure. An unchanged individual availability check can renew a retained recommendation's freshness. Every client-request email needs an available observation less than fifteen minutes old; errors and ambiguous status withhold delivery.
- Relevance learning uses only this account's current explicit positives, bounded to 100 examples from 90 days. At least two matching title/task terms and the same opportunity kind are required. Candidate assessment priority and a maximum one-point accepted-match boost change; eligibility, consent, source evidence and prompt thresholds do not. Hide is an exact-posting suppression, not a generalized negative training label.
- This is deterministic feedback-based ranking, not a newly trained model. Human relevance labels and representative opportunity/brief cohorts remain necessary to measure usefulness, recall and ranking improvement.
- Additional marketplaces, historical backfill, local service requests and tenders remain future source expansions. The worker must be running for recurring collection and feedback-triggered searches.

## Source references

API request shape and fixed/hourly project support were checked against the [official Freelancer SDK](https://github.com/freelancer/freelancer-sdk-python/blob/master/freelancersdk/resources/projects/projects.py), its [filter helpers](https://github.com/freelancer/freelancer-sdk-python/blob/master/freelancersdk/resources/projects/helpers.py), and successful public live responses on 1 October 2026. See the [Freelancer developer portal](https://developer.freelancer.com/) for provider access details.
