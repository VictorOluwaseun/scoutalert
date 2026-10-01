# ScoutAlert workflows

Owns finite Temporal definitions and serializable activity contracts. Source snapshots, personal briefs, provider calls, client construction and business decisions live outside these deterministic definitions. Architecture checks allow the workflow SDK and local contracts only.

`scoutWorkflow` waits for shared source evidence under bounded retries, then completes or records failure. `sourceWorkflow` refreshes one composition-approved board. Native schedules create finite `maintenanceWorkflow` executions for reconciliation and due digests. No indefinitely growing per-scout history is introduced.

Build with `pnpm --filter @repo/workflows build`. The worker hosts these definitions and provides their activities. Before changing workflow commands, run the worker's history replay tests and evaluate compatibility with open histories; introduce a new definition/queue version for incompatible changes. Existing schedules are preserved on startup rather than silently overwritten.
