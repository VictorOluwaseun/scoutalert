# ScoutAlert documentation

**Baseline revision:** 0.2

**Updated:** 29 September 2026

ScoutAlert is a continuously operating opportunity intelligence platform with persistent personal Scouts. These documents describe the full product and its target architecture. Implementation milestones sequence that work; they do not define the limit of the product.

## Reading order and ownership

| Document                                                                           | Owns                                                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [Platform PRD](prd/scoutalert-platform-prd.md)                                     | Product direction, full lifecycle, opportunity categories, platform capabilities, release outcomes      |
| [Platform architecture](architecture/scoutalert-platform-architecture-v0.1.md)     | Domain ownership, data authority, discovery, retrieval, matching, research, execution, delivery, growth |
| [Repository layout](engineering/scoutalert-repository-layout.md)                   | Canonical folder structure, package responsibilities, public exports, application composition           |
| [Engineering standards](engineering/scoutalert-engineering-standards-v0.1.md)      | Mandatory coding, repository, transaction, documentation, and dependency rules                          |
| [Technology stack](architecture/scoutalert-technology-stack-v0.1.md)               | Selected foundations, preferred execution target, evaluation candidates, adoption criteria              |
| [Platform user stories](user-stories/scoutalert-platform-user-stories-v0.1.md)     | Detailed platform acceptance criteria and backlog                                                       |
| [Onboarding PRD](prd/scoutalert-onboarding-prd-v0.1.md)                            | Goal-first entry, clarification, review, guest exploration, identity, initial activation                |
| [Onboarding architecture](architecture/scoutalert-onboarding-architecture-v0.1.md) | Implementation of that feature within the platform boundaries                                           |
| [Onboarding user stories](user-stories/scoutalert-onboarding-user-stories-v0.1.md) | Onboarding acceptance criteria and backlog                                                              |

The platform PRD is the product baseline. Onboarding documents specify one feature and cannot narrow platform scope. The repository layout owns directory decisions; other documents reference it rather than define alternative trees. `AGENTS.md` and explicit user instructions govern working agreements and take precedence over conflicting examples.

Existing filenames containing `v0.1` are retained for link stability; the version in each document header identifies its current revision. Existing story IDs are also retained when terminology changes.

## Architecture alignment

The 29 September clarification retains the current platform direction and repository layout. ScoutAlert business modules remain in `packages/core`, infrastructure implementations remain in `packages/adapters`, and API/worker hosts compose the same business behavior. Packages can contain both reusable product modules and technical libraries.

The latest [design clarification](https://chatgpt.com/s/t_6abb222cfb588191ae639303e0e25611) is supporting discussion. This documentation baseline and explicit user instructions govern implementation. The platform retains persistent Scouts, shared opportunity intelligence, event-driven evaluation and reconciliation, bounded research, durable orchestration, independently scalable workloads, and recipient-level notification identity.

Execution-engine adoption, provider/model selection, and measured operating targets retain their documented validation requirements.

## Baseline decisions

- A **Scout** owns a person's search goal, approved specification, policies, versions, and lifecycle. Profiles, execution runs, recommendations, applications, engagements, and deliveries have separate identities.
- Framework-independent business modules live in `packages/core/src/<feature>/{domain,application}`.
- Repositories, cache implementations, source connectors, and provider adapters live outside core in `packages/adapters`, organized by owning feature.
- Web, API, and worker applications are execution and presentation hosts. They compose shared use cases and infrastructure.
- Temporal is the preferred target for durable multi-step execution, subject to the adoption checks in the stack document. Installed BullMQ dependencies do not establish a deployed workflow implementation. LangGraph remains conditional.
- PostgreSQL owns durable business records. Redis holds disposable cache and bounded runtime state. Workflow execution history and searchable projections have explicitly separate authority.
- Continuous discovery, research, recommendations, prompt alerts, opportunity management, feedback, platform operations, and ScoutAlert-owned intelligence are part of the platform design.

## Implementation status

The workspace contains application and dependency foundations. These documents are a target design, not a claim that source connectors, Scouts, matching, email delivery, or durable workflows have been implemented.

`@repo/core` has no runtime dependencies. The database, Redis, and queue SDKs previously held there now belong to `@repo/adapters`, which depends inward on core. Both packages expose no features until implementations exist. Add target feature folders and explicit public exports with real implementations; do not generate empty scaffolding for the whole roadmap.

`pnpm check:architecture`, also run by `pnpm lint`, checks manifests and source imports for the core/adapters boundary, protected package exports, relative-path bypasses, and web/UI access to those packages. `pnpm test:architecture` verifies these checks. Additional feature-layer, controller/activity, and workflow rules must be implemented as those responsibilities are introduced.
