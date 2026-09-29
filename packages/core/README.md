# ScoutAlert core

Owns feature domain models, application use cases, and inward repository/provider contracts. It has no runtime dependencies on frameworks, infrastructure, or other workspaces.

Add implemented features under `src/<feature>/{domain,application}` and expose each feature's `public.ts` through an explicit package subpath, such as `@repo/core/scouts`. Exports are closed until those implementations exist.

Use cases receive repository and capability contracts through their constructors. They never construct clients or query data sources. API and worker composition roots wire those contracts to adapters.

The [repository layout](../../docs/engineering/scoutalert-repository-layout.md) defines ownership. Run `pnpm check:architecture` from the repository root to check dependency boundaries.
