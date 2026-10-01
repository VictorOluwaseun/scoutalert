# ScoutAlert worker

This Nest application context composes shared core use cases, repository/provider implementations and native Temporal clients. Five task queues separate workflow orchestration, shared source collection, private matching, public availability research and recipient delivery. Activities bind to core use cases; they contain no queries or copied policy.

Start the local Temporal service with `docker compose -p scoutalert-execution -f infrastructure/scouting.compose.yaml up -d`. Build `@repo/core`, `@repo/adapters`, `@repo/workflows` and `worker`, then run `pnpm --filter worker start`. The worker reads `../api/.env` and optional `.env`; see `.env.example`. The execution UI is on localhost:8233. `dev` watches built JavaScript; rebuild changed workspace packages before restart. Production startup is refused until a production email provider is composed.

`SCOUTING_INTEGRATION=1 TEMPORAL_INTEGRATION=1 pnpm --filter worker test` exercises isolated PostgreSQL transactions, Mailpit outcomes and a separate Temporal test namespace. Ordinary tests cover matching, schedule and connector policies without external services. Test namespaces have one-day history retention; local namespace deletion is a separate operator cleanup action.

The [connected onboarding and live scouting guide](../../docs/engineering/scoutalert-connected-onboarding.md) defines source coverage, schedules, limits, idempotency, uncertain delivery recovery and production adoption work.

AI assessment is opt-in with `SCOUT_AI_ENABLED=true` and `OPENAI_API_KEY` in the ignored local `.env`. Model settings and the default 50-request daily admission ceiling are in `.env.example`. Run `node scripts/check-ai-assessment.mjs` from the repository root for the separate five-call paid smoke evaluation. The worker uses shared versioned extraction, private fit caching, strict source citations, fenced leases, a bounded per-run candidate batch and conservative fallback. The operating guide documents supported pay formats, quality limits and remaining research work.

Availability research uses allowlisted employer ATS endpoints, shared posting/version leases, fifteen-minute reuse and independent finite Temporal runs. Prompt alerts require the strict relevance/availability policy, explicit opt-in, local quiet hours and a one-per-recipient rolling 24-hour limit. Prompt and digest delivery share the same item ledger. Apply migrations before starting the new worker.

For the expanded nine-case synthetic assessment evaluation, run `SCOUT_AI_EXTENDED_CHECK=1 node scripts/check-ai-assessment.mjs` (up to seventeen paid requests, separate from the worker allowance). It is a regression suite, not a representative quality benchmark.

Freelancer public fixed-price projects and hourly service requests are now collected through a bounded rolling feed. Individual availability is checked before any client-request email. Relevant feedback queues a refresh and adjusts private ranking without changing evidence or the confirmed brief. See [source coverage and verification](../../evaluations/marketplace-discovery/README.md).
