# ScoutAlert documentation

**Baseline revision:** 0.3

**Updated:** 1 October 2026

ScoutAlert is a continuously operating opportunity intelligence platform with persistent personal Scouts and internet-wide discovery as a core capability. These documents define the agreed target, implementation boundaries and evidence required for release. Milestones sequence delivery without reducing the product to onboarding or a fixed source list.

## Reading order and ownership

| Document                                                                             | Owns                                                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| [Platform PRD](prd/scoutalert-platform-prd.md)                                       | Complete product direction, opportunity categories, continuous discovery and release outcomes                            |
| [Platform architecture](architecture/scoutalert-platform-architecture-v0.1.md)       | Domain ownership, data authority, intelligence, execution, delivery and global operation                                 |
| [Internet discovery architecture](architecture/scoutalert-discovery-architecture.md) | Four agent responsibilities, plans, leads, provider capabilities, source expansion, crawl/monitoring, reuse and recovery |
| [Discovery acceptance gates](engineering/scoutalert-discovery-acceptance.md)         | DACC-001–020, cross-component pass/fail behavior, required evidence and release gates                                    |
| [Delivery roadmap](engineering/scoutalert-delivery-roadmap.md)                       | Current implementation, remaining increments, dependencies and completion boundaries                                     |
| [Platform user stories](user-stories/scoutalert-platform-user-stories-v0.1.md)       | Stable story IDs, feature requirements and acceptance criteria                                                           |
| [Repository layout](engineering/scoutalert-repository-layout.md)                     | Canonical code locations, feature ownership, exports and migration boundaries                                            |
| [Engineering standards](engineering/scoutalert-engineering-standards-v0.1.md)        | Repository, transaction, stack, agent, documentation and control-flow rules                                              |
| [Technology stack](architecture/scoutalert-technology-stack-v0.1.md)                 | Selected foundations, provider capability strategy and adoption evidence                                                 |
| [Discovery evaluation protocol](../evaluations/discovery/README.md)                  | Sampling, independent labels, baselines, cohort quality, capacity and cost measurement                                   |
| [Onboarding PRD](prd/scoutalert-onboarding-prd-v0.1.md)                              | Goal entry, review, identity, activation and discovery handoff                                                           |
| [Onboarding architecture](architecture/scoutalert-onboarding-architecture-v0.1.md)   | Feature state, ownership, transactions and downstream plan handoff                                                       |
| [Onboarding stories](user-stories/scoutalert-onboarding-user-stories-v0.1.md)        | Feature-specific acceptance, including truthful coverage and preserved intent                                            |
| [Connected onboarding and scouting](engineering/scoutalert-connected-onboarding.md)  | Existing local setup, implemented behavior, commands, historical checks and limitations                                  |
| [Local email](engineering/scoutalert-local-email.md)                                 | Mailpit transport configuration and verification                                                                         |

The PRD owns scope; the platform/discovery architecture owns design; acceptance gates own proof; the roadmap owns implementation status. Operational guides describe actual code and historical measurements. Onboarding cannot narrow platform scope. `AGENTS.md` and explicit user instructions govern working agreements.

Existing filenames containing `v0.1` remain stable for links; document headers identify their current revision. The stack document has its own revision history. Existing story IDs and historical evaluation artifacts are preserved.

## Agreed discovery decisions

- Search across the useful public web and authorized connected sources, including informal social hiring and buyer requests. Named platforms/providers are examples and integrations, never a permanent ceiling.
- Use four initial agent roles: **Scout Planner**, **Deep Discovery Agent**, **Evidence Research Agent** and **Source Expansion Agent**. Extraction and fit remain focused services unless iterative tool choice is needed.
- Run shared collection and reserved source exploration alongside private personal scouting. Good indexed results cannot cancel external freshness and exploration.
- Persist observations and incomplete leads separately from normalized opportunities and private assessments. Missing formal job fields do not force fabricated values or discard useful demand.
- Keep provider capabilities expressive: search, streams, feeds, fetch/render, monitoring, cursors, recovery and completeness have distinct contracts.
- Build the owned opportunity/evidence index from the first discovery increment. Supported new sources can become monitored registry instances; new protocols require implementation.
- Reuse public query/content/research work only within compatible access, scope, versions and freshness. Personal data and assessments stay private.
- Bound each execution through durable budgets, deadlines, retries and concurrency. Agent types are not process counts or per-user swarms.
- Measure known-opportunity recall, demand precision, useful coverage growth, cohort gaps, freshness, cost and recovery. No whole-internet recall or production-capacity claim is implied.

## Existing architectural decisions retained

Framework-independent business modules live in `packages/core`; repositories and external implementations live in `packages/adapters`; web/API/worker hosts compose their respective responsibilities. Temporal is selected and integrated locally, with deterministic definitions in `packages/workflows`. Production operating gates remain open. LangGraph is optional and installed BullMQ dependencies do not establish a second state owner.

PostgreSQL remains authoritative for business records, consent, budgets and durable intents. Redis is disposable cache and bounded coordination. Workflow history, search projections and event replay are distinct responsibilities. Transactions explicitly bind participating repositories; model/network effects occur outside them. Source and Scout revisions protect current publication, and recipient-level delivery identity protects notifications.

## Current implementation boundary

The existing local path includes reviewed onboarding, real Mailpit verification, sessions, transactional activation, saved Scouts, dashboard reads, edit/pause/resume and opportunity feedback. Live sources are Figma and Remote's Greenhouse boards and bounded Freelancer buyer requests for fixed-price projects and hourly services. Evidence extraction/private fit, bounded availability and employer-policy research, Temporal execution and local digests/prompt controls are implemented.

The [first web discovery implementation](engineering/scoutalert-web-discovery.md) provides an opt-in Serper adapter, shared query admission, incomplete leads, public evidence and a connected private UI. Live Serper access passed a one-query contract check and is enabled locally; the recorded source-page check remained access-limited. [Native X discovery](engineering/scoutalert-native-social-discovery.md) now has recent-search/lookup adapters and shared durable progress; live recent search, post refresh and bounded parent/quote/conversation context lookup are verified locally. Related authors remain separately attributed; missing context and independent quality measurements remain explicit. Reviewed-page monitoring and a bounded observed-link frontier are implemented. [Measured discovery scheduling](engineering/scoutalert-discovery-scheduling.md) now prioritizes approved queries and source checks, slows repeated low-yield native work, and paces the X allowance across the day. Independent quality and global capacity remain unproven. Broader thread/stream access, source protocols and the full four-role adaptive architecture remain incomplete. Semantic retrieval, independently reviewed broad quality, representative global capacity and production delivery operations remain unverified or unimplemented as recorded in the roadmap.

The [assessment packet](../evaluations/opportunity-quality/README.md) and [marketplace checks](../evaluations/marketplace-discovery/README.md) retain their narrower historical evidence. A completed onboarding or configured-source loop cannot close the broader discovery gates.

## Design provenance

The accepted direction incorporates the 1 October discussions on [broad discovery](https://chatgpt.com/s/t_6abe583294f481919b5d49dc7747569f), [open-ended providers](https://chatgpt.com/s/t_6abe60aa7ba88191999ee52710cdb7ed) and [agent responsibilities](https://chatgpt.com/s/t_6abe615559a88191b77d3c46c60a94cb), with the agreed refinements: continuous exploration despite good index results, first-class informal leads, capability-preserving contracts, bundled research and measured scale. These local specifications and explicit user instructions govern implementation; external discussions are supporting context.
