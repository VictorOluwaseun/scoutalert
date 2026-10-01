# Project working agreements

## Git branches

- Do not create, switch to, rename, or delete a Git branch unless the user explicitly requests that exact branch operation.
- Never invent a branch name. If the user requests a new branch without naming it, ask for the name.
- Never add a `codex/` prefix to a branch name.

## Architecture and repository pattern

- Follow Clean Architecture and the Repository pattern. Keep domain rules, application use cases, presentation code, and infrastructure responsibilities separate.
- Services must not directly import, instantiate, or access a database, Redis, or any other data source. Encapsulate data access in repository implementations.
- Services depend on repository contracts defined in the domain or application layer. Those layers must not import concrete repositories or data-source clients such as `pg`, Kysely, or Redis clients.
- Bind repository contracts to their implementations through dependency injection in the composition root. Client construction and infrastructure wiring belong there; data-access operations belong in repositories.
- Keep query details, persistence mapping, and cache access inside repositories. Keep business decisions and use-case orchestration in the domain and application layers.

## Use the stack effectively

- Use the supported capabilities of the chosen stack before building custom substitutes or generic wrappers that hide useful features. Check the installed version and its documentation before using version-sensitive APIs.
- Use NestJS modules, providers, dependency injection, validation, guards, and lifecycle features for API composition and transport concerns. Keep domain decisions and use-case orchestration in the framework-independent core.
- Use Next.js server rendering, route handlers, and client components deliberately. Keep server-only work on the server and avoid duplicating business rules in web routes.
- Use PostgreSQL constraints, indexes, transactions, locking, and query planning where they improve correctness or performance. Use Kysely for typed queries and explicit transaction participation, and `pg` for PostgreSQL connections and pooling; keep both behind repository implementations and composition wiring.
- Use Redis for appropriate caching and bounded coordination, with explicit expiry and invalidation. PostgreSQL remains authoritative for durable business state.
- Apply the same principle to other adopted tools: use their strengths at the right architectural boundary, and support performance choices with measurements rather than assumptions.

## Control flow

- Do not nest `if` statements.
- Always use curly braces for `if`/`else` and loop bodies, even when the body contains only one statement.
- Use guard clauses, early returns, named predicates, and focused helper methods to keep conditional logic flat and readable.

## Code organization

- Do not use `backend` or `bff`, including compound names and casing variants, in project-defined directory names, file names, package names, or code identifiers.
- Prefer names describing the product feature or concrete responsibility, such as scouts, opportunities, matching, repositories, and server-side request handling.
- No spaghetti code: give each class and method a clear responsibility, keep dependencies explicit, and split unrelated concerns into cohesive units.
- No code mess: use descriptive names, avoid duplicated logic and unnecessary abstractions, and remove unused imports, dead code, temporary debugging statements, and commented-out implementations from completed changes.
- Follow established project conventions and leave touched code organized and reviewable.
- Separate methods and logical blocks with blank lines. Keep closely related statements together instead of spacing out every individual line.

## Documentation

- Document every class with a useful JSDoc/TSDoc comment explaining its responsibility and architectural role.
- Document every method with a useful JSDoc/TSDoc comment explaining its purpose and contract. Include constructors and private methods.
- Give additional detail where needed: consequential parameters, return values, side effects, errors, invariants, transaction boundaries, retry behavior, idempotency, and cache invalidation.
- Explain intent and non-obvious behavior rather than restating the method name or implementation. Keep documentation accurate when behavior changes.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
