# ScoutAlert core

Owns feature domain models, application use cases, and inward repository/provider contracts. It has no runtime dependencies on frameworks, infrastructure, or other workspaces.

Add implemented features under `src/<feature>/{domain,application}` and expose each feature's `public.ts` through an explicit package subpath. `@repo/core/onboarding` exposes deterministic search review and transactional activation contracts/use cases. `@repo/core/identity` exposes shared email verification, account access and inward proof/session/rate-limit contracts. `@repo/core/notifications` exposes the email provider contract and submission outcomes; it also owns scheduled recipient digest grouping, timezone windows, consent-aware delivery orchestration and an inward durable ledger contract. `@repo/core/scouting` exposes shared-source refresh, conservative matching, bounded feed reads, discovery/dispatch ports and versioned evidence contracts.

`@repo/core/scouts` exposes the owner-scoped, bounded saved-scout catalog use case and its inward read contract. It reuses the saved-scout model currently produced by activation; catalog reads have their own API responsibility outside onboarding routes.

Use cases receive repository and capability contracts through their constructors. They never construct clients or query data sources. API and worker composition roots wire those contracts to adapters.

The [repository layout](../../docs/engineering/scoutalert-repository-layout.md) defines ownership. Run `pnpm check:architecture` from the repository root to check dependency boundaries.
