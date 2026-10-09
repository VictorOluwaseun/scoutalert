# ScoutAlert monitoring and audit acceptance gates

**Version:** 0.1

**Date:** 4 October 2026

**Status:** Required target acceptance specification. All scenarios below are not run against this specification; no production gate is passed by documenting it.

**Design:** [Monitoring and audit architecture](../architecture/scoutalert-observability-and-auditing.md)

## Acceptance boundary

Acceptance demonstrates that ScoutAlert can account for consequential business operations, investigate failures, explain decisions, and detect loss of progress across the full product. It includes existing features and the coverage contracts future features must satisfy.

Use the architecture's coverage matrix to inventory implemented surfaces. A future feature is explicitly planned; an existing feature without evidence is incomplete. Neither a missing feature nor an uninstrumented one can be reported as covered.

These gates supplement the [discovery gates](scoutalert-discovery-acceptance.md), [delivery roadmap](scoutalert-delivery-roadmap.md), and existing evaluation protocols. Historical test evidence can be mapped to a gate only after its scenario, assertions, code revision, and operational scope have been checked.

## Evidence contract

Every result records:

- Scenario ID, date, accountable owner, and status: not run, passed, failed, or blocked with a named dependency.
- Code/schema release, enabled configuration versions, environment, region, workload, and relevant event schemas.
- Required source, Scout, consent, assessment, model, prompt, and policy versions.
- Logical operation, event, attempt, and trace references with private data and credentials excluded from the report.
- Fault injection point, expected outcome, observed outcome, and reproducible evidence location.
- Usage, estimated/uncertain/reconciled cost where applicable, and declared performance thresholds.
- Remaining limitation and the scope of any completion claim.

Deterministic fixtures establish policy and failure behaviour. Separately controlled integration/live runs establish actual connectivity and recovery. A smoke test is not an independent relevance benchmark or a global-capacity test.

Thresholds, recovery objectives, retention, and workload must be fixed before the relevant measurement. Missing values keep that gate open. This documentation change does not authorise paid live tests, messages to real recipients, or production faults.

## Functional and failure scenarios

### OACC-001 Atomic business audit

Given a critical Scout, consent, or recommendation mutation, inject failures before audit insertion, after insertion, and before transaction commit. The mutation and required audit/export intent must either all commit or all roll back. There must be no committed mutation without its required audit event and no successful-mutation event for a rolled-back change.

### OACC-002 Operation and attempt identity

Deliver the same command repeatedly and concurrently, including a retry after a lost response. Exactly one logical business effect and its corresponding committed event remain, while meaningful processing attempts retain their own identities. Deduplication survives process restarts and does not depend on sampled trace retention.

### OACC-003 Denied action recording

Exercise authorization denial, invalid verification, rate limiting, and rejected operator actions. Required security records survive rollback of associated business work and contain no secret input. Demonstrate the documented security-ingress outage and abuse-volume policy; mandatory individual business audits cannot be replaced by an aggregate counter.

### OACC-004 External effect uncertainty

For email and paid provider operations, crash before prepared-attempt commit, after commit before call, and after the external effect before local acknowledgement. The first case must not execute. Remaining cases retain distinct prepared or unknown outcomes and reconcile without assuming that lack of a local receipt proves non-execution. Use provider idempotency only where supported.

### OACC-005 Dispatch and lease recovery

Crash the relay after workflow dispatch but before acknowledgement. Recovery must preserve the committed intent, avoid a second logical run, and expose lease age and attempts. Separately inject an undispatchable operation and verify that oldest-work monitoring identifies its age, reason, and affected scope.

### OACC-006 Temporal replay and cancellation

Replay workflow history, retry an activity, cancel a run, and deploy a compatible workflow revision. Replay must not duplicate durable business events, cost, or effects. Attempt history remains interpretable; cancellation and supersession retain their reasons and do not appear as completed discovery.

### OACC-007 Partial workflow success

Make external search or lead review fail while indexed matching remains available. The workflow may complete its supported fallback, but the recorded product outcome must retain degraded discovery, its cause, and affected coverage. Successful workflow counts cannot erase the failure.

### OACC-008 Current state before publication and delivery

Change Scout revision, pause state, evidence freshness, hidden feedback, consent, or suppression while work is queued. Publication and submission use current eligible state, record the versions checked, and reject stale decisions with a reason. An otherwise strong match cannot bypass the exceptional-alert verification policy.

### OACC-009 Shared work and private attribution

Use a declared many-Scout workload with compatible public interests and distinct private briefs. One shared provider operation creates one actual charge and separate authorised consumption links. Cross-account access to private assessments, consumer lists, or briefs is denied. Allocated costs are labelled separately from provider charges.

### OACC-010 Discovery completeness and source gaps

Exercise empty complete results, a truncated response, rate limiting, inaccessible content, an invalid cursor, a stream gap, and a parser failure. Each retains distinct coverage/outcome semantics. Native social access and public search-index discovery remain distinguishable. Missing observations do not invent closure or complete coverage.

### OACC-011 Decision and evidence reconstruction

Starting with a recommendation, follow its confirmed goal, plan, selected tool actions, provider attempts, evidence, validation, assessment, and publication decision. Identify relevant versions and unresolved questions. A rejected recommendation is similarly explainable. No hidden model reasoning or unrestricted prompt dump is required.

### OACC-012 Evidence deletion and revocation

Expire or delete a source observation and revoke an integration's permission. Required restrictions propagate to caches, projections, derived assessments, and diagnostic attachments. Minimal permitted history shows that evidence is unavailable; the operations console cannot recover disallowed content from an audit export or trace attachment.

### OACC-013 Accurate usage and cost

Test reservation, settlement, release, retries, cache/shared reuse, unpriced models, and a provider timeout that may incur a charge. Preserve requests and usage without assigning unknown amounts zero. Reconcile known provider receipts and distinguish actual charges from estimates and allocations. Audit budget/pricing changes without secret values.

### OACC-014 Budget and capacity forecasts

Under a fixed workload and configured allowances, create an unexpectedly early exhaustion forecast, expected pacing, and a hard admission violation. Forecasts identify cause and affected work; expected pacing remains visible without paging for every event. Hard-limit violations trigger the configured incident response. Monitoring cannot raise the allowance.

### OACC-015 Coverage and quality cohorts

Evaluate common and rare goals across the declared regions, languages, and opportunity categories with a known observable sample. Report acquisition, retrieval, eligibility, recommendation, and notification losses separately. Preserve configured exploration opportunity for low-volume cohorts. Independent labels remain distinct from model labels or click feedback.

### OACC-016 Notification outcomes and suppression

Exercise quiet hours, disabled consent, duplicates, volume limits, no eligible items, incomplete recipient scans, SMTP rejection, and ambiguous submission. Every consequential delivery decision has a reason and current input versions. SMTP acceptance is reported as acceptance; future delivery/bounce/complaint receipts are authenticated and deduplicated before they update state.

### OACC-017 End to end correlation

Trace a controlled verification → activation → dispatch → discovery → assessment → recommendation → delivery journey across web, API, activities, and repositories. Logical history remains queryable when diagnostic spans are sampled out. Malformed or forged incoming trace/baggage fields cannot change authorization or inject private data into shared context.

### OACC-018 Telemetry outage and loss reporting

Stop diagnostic collection, disconnect its storage, fill bounded buffers, and restart a collector with configured persistent buffering. Business state and mandatory transactional audit remain correct. Report lost diagnostics, queue utilisation, and recovery accurately. Audit exports retain durable retry state; missing diagnostic data cannot produce a false all-clear.

### OACC-019 Archive integrity and completeness

Interrupt an audit export and inject duplicate, altered, missing, and reordered records. Reconcile committed events with durable acknowledgements/manifests, detect integrity failures, and recover without duplicating events. Test role restrictions and the actual configured object-retention mode; application append permissions alone do not pass archive protection.

### OACC-020 Redaction and sensitive access

Introduce canary secrets and private fixtures through form inputs, headers, provider errors, SQL values, prompts, evidence, and exception stacks. Verify they are absent from prohibited logs, traces, metrics, workflow attachments, and audit payloads. Test scoped evidence access, export permissions, and auditing of sensitive operator reads/actions.

### OACC-021 Health and incident delivery

Test process failure, database loss, security-critical Redis failure, and provider outage. Liveness, readiness, and capability health reflect their different responsibilities. Every alert has an owner, scope, severity, runbook, deduplication, and recovery condition. A separate heartbeat detects total telemetry silence, and incident delivery works when ScoutAlert email is unavailable.

### OACC-022 Storage and regional recovery

Restore journal, business state, and query projections from the declared recovery setup. Validate retained event history, integrity, acknowledged work, and effect identities within fixed recovery/data-loss objectives. For regional deployments, additionally prove ownership fencing, lag visibility, authorised data placement, and deletion propagation. Untested regional capability stays unverified.

### OACC-023 Bounded overhead and cardinality

Run a declared workload with measured account, Scout, provider, event, and candidate volumes. Verify metric-label cardinality remains bounded as identities grow, telemetry cost and runtime overhead meet the fixed budget, and reporting queries avoid unacceptable contention with product operations. Show sampled/dropped diagnostics separately from required audit completeness.

### OACC-024 Operations investigation and feature coverage

Investigate a user receiving no recommendations because of each major cause: no useful findings, no executed search, access limits, budget waits, queue stalls, rejected candidates, unresolved research, and suppressed alerts. The console identifies the actual reason using authorised records. Audit its sensitive reads and recovery actions. Check that every implemented surface in the coverage inventory maps to owned events and passing evidence, with future surfaces explicitly planned.

## Increment and production gates

| Gate                     | Required proof                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| O1 Foundation            | Event/retention catalogue, minimum roles, instrumentation, and applicable OACC-001–006, 017–020; partial archive implementation must state its protection limit.                                 |
| O2 Complete journey      | Controlled integrated journey with OACC-004–012, 016–017 and its injected failure cases.                                                                                                         |
| O3 Platform coverage     | All currently implemented surfaces accounted for, OACC-009–017 and 024, plus independent quality evidence and usage reconciliation.                                                              |
| O4 Operational assurance | Full deployment evidence for OACC-001–024, including protected archives, independent incidents, restore/load results, and approved objectives. Regional assertions require their regional tests. |

Ranges identify scenario IDs, not evidence that every gate has run. A gate is passed only when every required scenario is passed for its declared scope. A future-only scenario may remain blocked with its feature dependency, but that prevents claiming that future capability is verified.

Current features must not be excluded from the release inventory simply because their instrumentation is difficult. When a planned capability is introduced, its event catalogue, retention, operational ownership, and acceptance evidence become part of its release requirements.

## Required operational artifacts

Implementation delivers the event catalogue and schema compatibility policy, coverage inventory, service objective definitions, versioned dashboards/alerts, data-class retention policy, access matrix, runbooks, backup/restore procedure, and recorded scenario evidence.

Runbooks cover provider access/quota failure, stalled dispatch, expired leases, AI degradation, unexpected spending, stale publication, ambiguous delivery, audit export failure, privacy/security incidents, and telemetry silence. Recovery actions use authorised application boundaries and are themselves auditable.

Update the [delivery roadmap](scoutalert-delivery-roadmap.md) with code and deployment references as increments land. Documentation, installation, local connectivity, independent quality, and production readiness remain separate statuses.
