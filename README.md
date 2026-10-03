# ScoutAlert

ScoutAlert is a persistent personal opportunity scout. It is designed to search across the web and social platforms, discover jobs, contracts and demand for services, investigate consequential details, match confirmed goals and send useful alerts.

The product combines shared public discovery and evidence with private personal assessments. Adaptive search, source expansion, a focused crawler and our own opportunity index are core target capabilities. International remote client projects are the first client-work coverage priority; a configured provider list does not define the product's ceiling.

## Start with the documentation

- [Documentation index and baseline](docs/README.md)
- [Platform requirements](docs/prd/scoutalert-platform-prd.md)
- [Platform architecture](docs/architecture/scoutalert-platform-architecture-v0.1.md)
- [Internet discovery and four agent responsibilities](docs/architecture/scoutalert-discovery-architecture.md)
- [Discovery acceptance and release gates](docs/engineering/scoutalert-discovery-acceptance.md)
- [Implementation status and delivery roadmap](docs/engineering/scoutalert-delivery-roadmap.md)
- [Platform user stories](docs/user-stories/scoutalert-platform-user-stories-v0.1.md)
- [Repository layout](docs/engineering/scoutalert-repository-layout.md) and [engineering standards](docs/engineering/scoutalert-engineering-standards-v0.1.md)

## Current implementation

The local product connects onboarding, Mailpit email verification, sessions, Scout activation, an account-owned dashboard, edits, pause/resume and feedback. Discovery currently collects Figma and Remote Greenhouse boards plus a bounded Freelancer buyer-request feed. Evidence extraction, private fit, bounded employer/availability research, finite Temporal execution and local opportunity-email delivery are connected.

The first general-web foundation is implemented: an opt-in Serper adapter, shared query admission, public leads/evidence and an account-owned discovery view. Serper passed a bounded live contract check and is enabled locally under shared request and reservation caps. Native X/LinkedIn access, adaptive discovery plans, automatic source expansion and the focused crawl frontier remain outstanding. See the [web discovery implementation notes](docs/engineering/scoutalert-web-discovery.md). Existing tests and evaluation packets do not establish broad internet coverage, independently validated global relevance or production-scale capacity. The roadmap distinguishes implemented behavior from target design and release evidence.

## Workspace and stack

| Location             | Responsibility                                                                  |
| -------------------- | ------------------------------------------------------------------------------- |
| `apps/web`           | Next.js/React product interface and same-origin server routes                   |
| `apps/api`           | NestJS HTTP presentation, authorization and composition                         |
| `apps/worker`        | NestJS execution host, Temporal activities, dispatch and reconciliation         |
| `apps/docs`          | Documentation-site application; root `docs/` owns specifications                |
| `packages/core`      | Framework-independent business models, policies, use cases and inward contracts |
| `packages/adapters`  | Repositories, PostgreSQL/Kysely/pg, Redis and external provider implementations |
| `packages/workflows` | Deterministic Temporal definitions and serializable activity contracts          |
| `packages/ui`        | Shared interface primitives and design tokens                                   |
| `evaluations`        | Versioned evaluation evidence and protocols                                     |
| `infrastructure`     | Local execution infrastructure definitions                                      |

The foundation is TypeScript, Next.js, NestJS, PostgreSQL with Kysely/pg, Redis, Temporal, Tailwind CSS and shadcn/ui. The four initial agent roles are Scout Planner, Deep Discovery Agent, Evidence Research Agent and Source Expansion Agent. Ordinary extraction, retrieval and fit evaluation remain focused services. Provider and deployment decisions follow measured quality, access, reliability and cost requirements.

## Local development and verification

Use the repository's declared Node.js and pnpm versions from `package.json`. Follow [connected onboarding and scouting](docs/engineering/scoutalert-connected-onboarding.md) for environment files, migrations, web/API startup and separate worker startup. Follow [local email](docs/engineering/scoutalert-local-email.md) for Mailpit. No secrets belong in committed documentation.

Package READMEs describe their actual commands and boundaries. Architecture checks, relevant package tests and the [discovery acceptance gates](docs/engineering/scoutalert-discovery-acceptance.md) have different scopes; a passing local integration test is not a completed product milestone. Read [AGENTS.md](AGENTS.md) before changing code or Git state.
