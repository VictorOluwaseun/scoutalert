# Fifty-account beta launch

## Approved plan and configurable defaults

The first cohort targets 50 admitted accounts with one active scout each. Existing public-source monitoring and cached evidence reuse continue. Each account can start one deep public-web search per rolling 24-hour window, with two overdue scouts queued per maintenance batch. A durable dispatcher starts at most one fresh deep-search workflow every 25 minutes across the deployment (about 57 starts per day), including initial searches. Source updates, matching-only edits and lost-acknowledgement retries bypass that interval. The initial search consumes that window; edits, replacements and resumes cannot grant another window. Disabled providers and invalid public intent do not consume a window. Deep-search denials appear as deferred activity; indexed matching may continue under the same account/model budgets. This is a scheduling target, not a promise of recommendations or a delivery SLA.

The baseline remains 2,400,000 mini tokens and 250,000 GPT-5.4 tokens per UTC day, input plus output. The existing local 40,000-token audit allocation remains inside the full-model baseline. Additional planned spending is $40 per repeating 30-day cycle: $30 mini ($1 per day) and $10 full (approximately $0.333333 per day). Integer microdollar rounding distributes the complete allocation across 30 days. Cycles use a persisted, explicitly configured UTC anchor, not calendar months; changing that anchor fails closed.

| Setting                              | Proposed value | Meaning                                                                        |
| ------------------------------------ | -------------: | ------------------------------------------------------------------------------ |
| SCOUT_BETA_MAX_ACCOUNTS              |             50 | Retained cohort seats, including paused accounts                               |
| SCOUT_BETA_ACTIVE_SCOUTS             |              1 | Active scouts per owner; activation and resume share the same transaction gate |
| SCOUT_BETA_REFRESH_MINUTES           |           1440 | Rolling account window for deep search, separate from shared monitoring        |
| SCOUT_BETA_DISPATCH_BATCH            |              2 | Overdue scouts queued per maintenance batch                                    |
| SCOUT_BETA_DISPATCH_INTERVAL_MINUTES |             25 | Minimum gap between fresh deep-search workflow starts                          |
| SCOUT_BETA_MINI_ACCOUNT_TOKENS       |          80000 | Maximum daily mini reservation/usage across the account                        |
| SCOUT_BETA_GPT54_ACCOUNT_TOKENS      |          20000 | Maximum daily full-model reservation/usage across the account                  |
| SCOUT_AI_PAID_MONTHLY_USD            |             40 | Additional planned budget per 30-day cycle; zero disables it                   |
| SCOUT_AI_PAID_MINI_MONTHLY_USD       |             30 | Mini allocation inside the additional budget                                   |
| SCOUT_AI_PAID_GPT54_MONTHLY_USD      |             10 | Full-model allocation inside the additional budget                             |

Account token ceilings are implementation defaults, not promised shares. All 50 accounts cannot simultaneously consume their maximums. Least-served waiting accounts receive the next affordable turn, and idle capacity remains usable. A single request must fit both its account ceiling and a funding source. Scout revisions and replacements retain owner usage. Public work is charged once to the initiating account; cache reuse does not issue another model call. Unattributed platform and evaluation work shares a bounded 200k mini / 50k full daily lane when beta mode is enabled.

## Paid admission and accounting

Base token admission is attempted first. Ordinary work that cannot fit base pacing or the base allowance can use the additional paid pool immediately; this pool is not reserved for emergencies. Money has its own continuous refill and bounded burst ($0.084 mini / $0.10 full), daily ceiling and fixed-cycle ceiling. Restart and midnight do not refill the burst. Maintenance borrows only while useful discovery demand is absent. No funding route bypasses account quotas or required evidence review. Additional paid capacity is standard-purpose only; audits retain their protected base allocation.

Before a provider call, reserve uncached counted input plus maximum output. After valid usage arrives, reconcile once using rates captured at admission, including the cached-input discount. Missing usage and ambiguous failures retain the full reservation; changing models, aliases, scout revisions or processes cannot erase it. A completion crossing midnight remains assigned to the original admission day and cycle. Unexpected provider overages are recorded truthfully and reduce later admission; safety depends on the provider honoring native token counting and maximum output.

Rates match the existing reviewed standard OpenAI rates: mini $0.75 input / $0.075 cached input / $4.50 output per million tokens; full $2.50 / $0.25 / $15. These are model costs, not provider invoices. A provider with different rates needs a reviewed pricing update before enabling paid admission. The request and USD guards already used by discovery still apply and can be stricter. Search credits, X, hosting and email are separate. The approximately 3.3M mini / 311k full daily capacity discussed during planning is a workload-dependent estimate, not a fixed extra token entitlement.

## Rollout

1. Build core, adapters, worker and API; apply migration `20261109-beta-budget` using the existing API migration command. It preserves existing scouts and base counters, attributes retained reservations to their owners, and records existing owners as cohort members.
2. Run `pnpm --filter worker beta:check`. Resolve accounts with more than one active scout using the normal pause controls. Existing owners are not silently evicted or paused. Worker startup fails closed if beta mode is enabled with unresolved capacity conflicts. Registration remains available; activating a scout is what claims a cohort seat.
3. Set `SCOUT_BETA_ENABLED=true` in `apps/api/.env`, which is also inherited by worker startup. Keep API and worker policy settings consistent.
4. Set the worker's additional budget to 40, its allocations to 30 and 10, and `SCOUT_AI_PAID_PERIOD_ANCHOR` to the chosen first UTC day. The disabled example default is zero. Do not move the anchor after paid admission starts.
5. Restart the API and worker after the checks pass. Read `pnpm --filter worker ai:usage`: base limits must still show 2.4M/250k, while paid commitments appear separately. No account or budget history should be reset.
6. Admit users gradually, observing 7–14 days at 50 active accounts before considering 100. Track recommendation usefulness, source freshness, planned versus actual search cadence, token/money consumption, quota deferrals and unknown outcomes.

Database and transport tests use synthetic usage in disposable schemas; they do not buy model tokens. These checks establish admission and accounting behavior, not real-world recommendation quality or sustained production capacity. [Production SMTP support](scoutalert-production-email.md) is implemented; deployment still requires provider credentials, a verified sender domain and a real-inbox delivery check. NODE_ENV=production refuses Mailpit or incomplete SMTP settings.

## Local activation — 9 November 2026

Beta mode is enabled locally with the approved $40 paid allocation, anchored to 9 November 2026. The first 30-day cycle ends at 00:00 UTC on 9 December (01:00 Africa/Lagos). Eight extra active scouts were paused through the normal lifecycle use case, retaining the newest active scout in each affected account. No scouts were deleted. There are 15 admitted accounts and 12 active scouts, with no account over its one-active-scout limit. The API and all nine worker queues are running.

The [activation receipt](../../evaluations/discovery/beta-launch-activation-2026-11-09.json) records the settings, remaining capacity and observed startup checks. Background discovery usage continues after that snapshot.
