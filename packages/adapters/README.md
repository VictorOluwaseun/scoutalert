# ScoutAlert adapters

Owns repository implementations, queries, persistence mapping, caching, source connectors, provider integrations, and technical client/transaction plumbing. Implements contracts exported by `@repo/core`.

The package currently holds the installed infrastructure dependencies. Add implemented adapters under `src/<feature>` using the same feature names as core. Add database plumbing under `src/database` and client factories under `src/clients` when they are needed. No datasource clients are constructed yet.

Expose implemented capabilities through explicit feature subpaths. Exports are closed until implementations exist. Composition roots construct clients and inject adapters; business services receive inward contracts.

BullMQ remains an installed bootstrap dependency. Its presence does not select the durable execution engine or justify introducing a second workflow state owner.

The [repository layout](../../docs/engineering/scoutalert-repository-layout.md) defines ownership. Run `pnpm check:architecture` from the repository root to check dependency boundaries.
