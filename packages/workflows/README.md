# ScoutAlert workflows

Owns finite Temporal definitions and serializable activity contracts. Source snapshots, personal briefs, provider calls, client construction and business decisions live outside these deterministic definitions. Architecture checks allow the workflow SDK and local contracts only.

`scoutWorkflow` adds a replay-patched, bounded general-web phase on `scout-web-discovery-v1`, then runs the replay-patched `scout-lead-evidence-v1` review phase before private matching. The separate review phase has a three-minute deadline and bounded activities; source and delivery queues continue independently. Web outages preserve indexed matching; the phase is limited to roughly four minutes. Historical plans retain their policy; new AI-enabled cases can use model-guided strategy and bounded evidence-informed actions. `sourceWorkflow` refreshes one composition-approved source. Native schedules create finite `maintenanceWorkflow` executions for reconciliation and due digests. No indefinitely growing per-scout history is introduced.

Build with `pnpm --filter @repo/workflows build`. The worker hosts these definitions and provides their activities. Before changing workflow commands, run the worker's history replay tests and evaluate compatibility with open histories; introduce a new definition/queue version for incompatible changes. Existing schedules are preserved on startup rather than silently overwritten.

## Expanded discovery target

The [discovery architecture](../../docs/architecture/scoutalert-discovery-architecture.md) adds finite plan, deep-discovery and source-expansion cases alongside evidence research. These are future definitions, not existing exports. Agent tool choice runs through bounded core application steps and adapters; deterministic workflows coordinate their durable ordering, waiting and configured retries.

Cases carry IDs/revisions and explicit stopping/continuation states. Durable observations and budget reservations survive retries; restarting a step cannot grant a fresh logical allowance. Shared monitoring/exploration continues independently of a personal shortlist. High-volume source ingestion and product event replay remain distinct from Temporal history.

Four agent types do not require four permanent workflows per user. Independent pools and finite histories follow measured workload needs. Replay, cancellation, cursor/acknowledgement recovery and current-state publication tests belong to the [acceptance gates](../../docs/engineering/scoutalert-discovery-acceptance.md).

`sourceMonitorWorkflow` is a separate finite shared-monitoring definition. Its one-minute schedule skips overlaps, and each invocation admits at most 24 activities/four minutes on `scout-source-monitoring-v1`. Existing scout workflow commands are unchanged; the activity host learns monitoring interests after source review. The monitoring workflow has local retry/history-replay coverage.

`socialDiscoveryWorkflow` uses the same finite scheduling envelope on the separate `scout-social-discovery-v1` pool. Native query windows, continuation tokens and budget reservations live in PostgreSQL; workflow history carries no post bodies or private briefs. A new retry/replay test covers this definition without changing earlier scout commands. See [native X discovery](../../docs/engineering/scoutalert-native-social-discovery.md) for current access status and limits.
