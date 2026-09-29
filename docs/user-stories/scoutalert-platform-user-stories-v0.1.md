# ScoutAlert — Platform User Stories

**Version:** 0.1  
**Date:** 29 September 2026  
**Status:** Product backlog baseline  
**Scope:** ScoutAlert application after and around onboarding  
**Onboarding backlog:** [ScoutAlert Onboarding User Stories v0.1](scoutalert-onboarding-user-stories-v0.1.md)

## 1. Priority definitions

- **P0** — Core capability required for the first complete jobs/contracts product.
- **P1** — Important production capability required for a strong broad release.
- **P2** — Advanced or category-expansion capability that builds on the core platform.

## 2. Profile

### PROF-001 — Maintain my professional profile

**User story**  
As a user, I want to maintain my confirmed professional background so that ScoutAlert can evaluate opportunities against current information.

**Acceptance criteria**
- Users can edit relevant skills, experience, qualifications, languages, and availability.
- Confirmed facts remain distinguishable from inferred/proposed information.
- Profile changes create a new version.
- Dependent recommendations can be marked stale and selectively re-evaluated.

**Priority:** P0

### PROF-002 — Separate experience from career direction

**User story**  
As a user, I want ScoutAlert to distinguish what I already know from what I want to move into so that aspirations are not presented as established experience.

**Acceptance criteria**
- Demonstrated experience and desired skills/roles are stored separately.
- Stretch-role matching can use aspirations without misrepresenting them as qualifications.
- Explanations clearly identify transferable experience and missing evidence.

**Priority:** P0

### PROF-003 — Import a CV optionally

**User story**  
As a user, I want to optionally import a CV so that ScoutAlert can propose profile information without requiring me to enter everything manually.

**Acceptance criteria**
- CV upload is optional.
- Extracted information requires review before becoming confirmed profile data.
- Unsupported/incomplete extraction is surfaced.
- Document handling follows the approved privacy and retention policy.

**Priority:** P1

### PROF-004 — Keep my reusable profile independent from watchlists

**User story**  
As a user, I want shared profile facts separated from search-specific preferences so that one watchlist does not rewrite my professional identity.

**Acceptance criteria**
- Watchlist preferences remain watchlist-scoped.
- Shared profile changes require explicit confirmation.
- Multiple watchlists can reuse the same profile version.
- Conflicting concurrent edits are surfaced.

**Priority:** P0

## 3. Watchlists

### WL-001 — Create multiple independent watchlists

**User story**  
As a user, I want multiple searches for different goals so that full-time, contract, relocation, and other searches can have independent rules.

**Acceptance criteria**
- Each watchlist has its own search specification, constraints, preferences, schedule, and lifecycle.
- Creating a new watchlist does not change existing watchlists.
- Watchlists reference a confirmed profile version or relevant profile facts.
- Each watchlist has a stable ID and version.

**Priority:** P0

### WL-002 — Edit a watchlist safely

**User story**  
As a user, I want to update a watchlist so that my search evolves without losing control of its requirements.

**Acceptance criteria**
- Search-relevant edits create a new search revision.
- Material changes invalidate incompatible cached recommendations.
- Mandatory requirements are not silently relaxed.
- The user sees the effective updated search.

**Priority:** P0

### WL-003 — Pause, resume, archive, and duplicate watchlists

**User story**  
As a user, I want lifecycle controls for each watchlist so that I can manage active searches independently.

**Acceptance criteria**
- Paused watchlists stop future discovery/publication work after current version checks.
- Resume schedules future work from the current approved revision.
- Archive preserves history while disabling active scouting.
- Duplicate creates a new watchlist with independent future revisions.

**Priority:** P1

### WL-004 — Configure uncertainty handling

**User story**  
As a user, I want each watchlist to define how missing salary, location eligibility, or other important unknowns are handled so that recommendations reflect my tolerance for uncertainty.

**Acceptance criteria**
- Unknown-information policies are explicit and editable.
- Unknown does not equal eligible or ineligible.
- Main-feed versus needs-confirmation grouping follows the configured policy.
- Changes are versioned.

**Priority:** P0

## 4. Opportunity discovery and source coverage

### DISC-001 — Discover opportunities across supported global sources

**User story**  
As a user, I want ScoutAlert to continuously discover relevant opportunities from supported sources so that I do not need to monitor many sites manually.

**Acceptance criteria**
- The system ingests enabled approved sources according to their refresh policies.
- Source failures do not appear as successful scans.
- Source coverage is represented honestly.
- Worldwide service does not imply every employer/site is covered.

**Priority:** P0

### DISC-002 — See the original opportunity source

**User story**  
As a user, I want access to the original posting so that I can verify details and apply through the appropriate channel.

**Acceptance criteria**
- Recommendations include the canonical/original application source when available and permitted.
- Source identity is preserved through normalization/deduplication.
- Unsafe or revoked links are not presented as trusted application links.

**Priority:** P0

### DISC-003 — Avoid duplicate opportunities

**User story**  
As a user, I want duplicate postings consolidated so that the same underlying opportunity does not dominate my feed.

**Acceptance criteria**
- Canonical opportunities can link multiple source postings.
- Materially different variants remain distinct.
- Duplicate merges are reversible/auditable.
- Notification deduplication uses canonical identity and material-change rules.

**Priority:** P0

### DISC-004 — Understand opportunity freshness

**User story**  
As a user, I want to know when an opportunity was posted, discovered, and last checked so that I can judge whether it is current.

**Acceptance criteria**
- Source publication date and first-seen date remain separate.
- Last successful status/content check is available where relevant.
- Stale/unconfirmed status is distinguishable from open/closed.
- Missing timestamps are not invented.

**Priority:** P0

### DISC-005 — See source coverage limitations

**User story**  
As a user, I want to understand relevant coverage gaps so that an empty result set is not mistaken for proof that no opportunities exist.

**Acceptance criteria**
- Scout/run status can distinguish no matches, incomplete coverage, source failure, and partial completion.
- Coverage messaging is scoped to supported sources/categories.
- Users can see when a source is temporarily unavailable when materially relevant.

**Priority:** P1

### DISC-006 — Submit an opportunity I found

**User story**  
As a user, I want to submit an opportunity URL or text so that ScoutAlert can evaluate something I discovered elsewhere.

**Acceptance criteria**
- The system safely handles supported URLs or pasted text.
- Submitted content follows the same extraction/evidence rules as discovered opportunities.
- Unsupported/inaccessible sources are explained.
- User submission does not automatically make the opportunity trusted.

**Priority:** P1

## 5. Evidence and opportunity understanding

### EVID-001 — Preserve evidence for important claims

**User story**  
As a user, I want ScoutAlert's important conclusions to point back to supporting source evidence so that I can understand why they were made.

**Acceptance criteria**
- Important eligibility, compensation, deadline, and requirement claims retain provenance.
- Evidence references identify source version and relevant passage/field.
- Model-generated wording cannot create a source reference that was not retrieved.
- Revoked/corrected evidence invalidates dependent current conclusions.

**Priority:** P0

### EVID-002 — Keep conflicting information visible

**User story**  
As a user, I want conflicting source information to remain visible until resolved so that ScoutAlert does not hide meaningful uncertainty.

**Acceptance criteria**
- Conflicting evidence is represented explicitly.
- Source-specific and employer-wide policies retain their scope.
- Research can resolve a conflict only with supported evidence/policy.
- Unresolved conflicts remain labeled.

**Priority:** P0

### EVID-003 — Track meaningful opportunity changes

**User story**  
As a user, I want ScoutAlert to recognize material changes to opportunities so that recommendations can be refreshed when eligibility, pay, deadline, or status changes.

**Acceptance criteria**
- Accepted source versions preserve meaningful changes.
- Relevant changes invalidate dependent assessments.
- Cosmetic changes do not necessarily cause duplicate recommendations.
- Material-change policies are versioned/testable.

**Priority:** P1

## 6. Retrieval and matching

### MATCH-001 — Match beyond exact keywords

**User story**  
As a user, I want ScoutAlert to recognize related experience and responsibilities even when terminology differs so that relevant opportunities are not missed.

**Acceptance criteria**
- Candidate retrieval uses structured filtering plus keyword and semantic retrieval.
- Semantic similarity is not used as proof of eligibility.
- Retrieval changes are evaluated against labeled ScoutAlert datasets.
- Exact domain terms remain retrievable.

**Priority:** P0

### MATCH-002 — Enforce hard constraints before recommendation

**User story**  
As a user, I want my confirmed mandatory requirements to take precedence over general fit so that attractive but clearly unsuitable opportunities do not enter my main recommendations.

**Acceptance criteria**
- Confirmed hard conflicts cannot be offset by professional-fit scores.
- Hard rules operate on validated facts/evidence.
- Unknown information follows the configured uncertainty policy.
- Exclusion reasons remain explainable.

**Priority:** P0

### MATCH-003 — Evaluate professional fit from evidence

**User story**  
As a user, I want ScoutAlert to compare my confirmed experience with the actual responsibilities of an opportunity so that recommendations go beyond titles and keywords.

**Acceptance criteria**
- Fit evaluation receives relevant confirmed profile evidence and relevant opportunity evidence.
- Missing experience is not invented.
- Transferable experience can be identified separately from direct experience.
- Results are versioned and reproducible.

**Priority:** P0

### MATCH-004 — Evaluate geographic eligibility separately

**User story**  
As a user, I want ScoutAlert to evaluate stated applicant-location, work-authorization, and sponsorship requirements separately from professional fit so that a strong skills match does not hide a location conflict.

**Acceptance criteria**
- Employer HQ, job location, applicant location, residence, authorization, sponsorship, and relocation remain distinct concepts.
- Remote does not imply worldwide.
- Unknown country eligibility remains unconfirmed.
- Relevant evidence is attached.

**Priority:** P0

### MATCH-005 — Evaluate compensation correctly

**User story**  
As a user, I want ScoutAlert to compare compensation using correct units and assumptions so that hourly, monthly, annual, or undisclosed pay is not misrepresented.

**Acceptance criteria**
- Currency, amount/range, period, and basis remain explicit.
- Undisclosed compensation follows the watchlist policy.
- Cross-currency comparison uses a versioned rate/assumption where enabled.
- Unstated hours are not invented for annualization.

**Priority:** P0

### MATCH-006 — Keep recommendation dimensions separate

**User story**  
As a user, I want to see professional fit, eligibility, compensation, evidence quality, and uncertainty separately so that one combined score does not obscure important differences.

**Acceptance criteria**
- User-facing results do not present ranking as hiring probability.
- Main decision dimensions are available independently.
- Unresolved criteria are visible.
- Internal ranking remains explainable.

**Priority:** P0

### MATCH-007 — Prioritize a manageable shortlist

**User story**  
As a user, I want the strongest actionable opportunities prioritized so that I can focus attention without receiving weak filler.

**Acceptance criteria**
- Candidate retrieval and deeper evaluation are separated.
- Result limits are maximums, not quotas.
- The system may publish fewer recommendations.
- Ranking is evaluated and versioned.

**Priority:** P0

### MATCH-008 — Explore stretch opportunities intentionally

**User story**  
As a user, I want optional stretch opportunities clearly separated from direct matches so that I can explore growth without confusing aspiration with current qualification.

**Acceptance criteria**
- Stretch recommendations are opt-in/configurable.
- Missing skills or experience are visible.
- They do not appear as direct-fit recommendations by default.
- Stretch interest does not modify confirmed profile facts.

**Priority:** P1

## 7. Agentic research

### RSRCH-001 — Investigate consequential unknowns

**User story**  
As a user, I want ScoutAlert to investigate important unclear requirements when the opportunity is otherwise promising so that I get better evidence before deciding.

**Acceptance criteria**
- Research starts from an explicit unresolved question.
- It uses only approved tools/sources.
- It has bounded calls, time, tokens, and cost.
- It returns supported evidence, conflicting evidence, or an explicit unresolved outcome.

**Priority:** P0

### RSRCH-002 — Reuse valid public research

**User story**  
As a platform user, I want ScoutAlert to reuse still-valid public employer-policy research where appropriate so that the system is fast and efficient.

**Acceptance criteria**
- Reuse keys include subject, question scope, geography/engagement context, policy/version, source version, and validity window.
- Private user data is not stored in shared research results.
- New evidence can invalidate a cached unresolved result.
- Source permissions constrain reuse.

**Priority:** P1

### RSRCH-003 — Stop research safely

**User story**  
As a user, I want ScoutAlert to stop when the question is resolved or when evidence cannot be established within the allowed budget so that uncertainty is not replaced by a guess.

**Acceptance criteria**
- Stop conditions are explicit.
- Budget exhaustion produces an unresolved state rather than a fabricated answer.
- A stronger model is not used solely because evidence is absent.
- Research outcome is persisted for audit/reuse according to policy.

**Priority:** P0

## 8. Recommendations and dashboard

### REC-001 — View prioritized recommendations

**User story**  
As a user, I want a dashboard of current recommendations organized by watchlist and confidence state so that I can quickly see what deserves attention.

**Acceptance criteria**
- Recommendations are read from durable records.
- Strong matches and needs-confirmation results can be separated.
- Stale/withdrawn recommendations do not appear as current without warning.
- The user can filter by relevant dimensions.

**Priority:** P0

### REC-002 — Understand why an opportunity was recommended

**User story**  
As a user, I want a concise explanation grounded in evidence so that I can decide whether to investigate or apply.

**Acceptance criteria**
- Explanation is derived from validated fit/eligibility outputs.
- Important evidence links/references are available.
- Gaps and unknowns are included.
- Explanation generation cannot add unsupported claims.

**Priority:** P0

### REC-003 — Inspect opportunity details

**User story**  
As a user, I want one detailed view containing role information, evidence, fit, eligibility, uncertainty, and source links so that I do not need to reconstruct the assessment myself.

**Acceptance criteria**
- Current canonical opportunity/variant is displayed.
- Source/evidence freshness is represented.
- Relevant requirements and gaps are available.
- Saved/application actions are available according to product scope.

**Priority:** P0

### REC-004 — Save or dismiss an opportunity

**User story**  
As a user, I want to save or dismiss opportunities so that ScoutAlert reflects what I am considering.

**Acceptance criteria**
- Save and dismiss actions are user-owned and reversible.
- Dismissal can include a reason.
- Actions reference the recommendation/evaluation version.
- A dismissal does not globally alter unrelated watchlists.

**Priority:** P0

### REC-005 — See recommendation history and changes

**User story**  
As a user, I want to see when a recommendation changed because of new evidence or profile/watchlist changes so that I understand why ScoutAlert's assessment evolved.

**Acceptance criteria**
- Current state is clearly distinguished from historical evaluations.
- Material changes can be explained using version/evidence changes.
- Withdrawn recommendations remain available in appropriate history views.

**Priority:** P1

## 9. Feedback and personalization

### FB-001 — Explain why a recommendation is unsuitable

**User story**  
As a user, I want to provide a reason when dismissing a result so that ScoutAlert can improve the relevant search.

**Acceptance criteria**
- Supported reasons include location, compensation, seniority, responsibilities, work type, and other meaningful categories.
- Feedback is scoped to the relevant watchlist/recommendation.
- Explicit feedback outranks inferred behavioral signals.
- Users can undo/correct feedback.

**Priority:** P0

### FB-002 — Learn preferences without changing hard facts

**User story**  
As a user, I want ScoutAlert to learn ranking preferences from my feedback without silently changing my confirmed profile or mandatory constraints.

**Acceptance criteria**
- Learned signals are reversible.
- Hard constraints require explicit changes.
- Shared profile facts require explicit confirmation.
- Personalization versions can be traced.

**Priority:** P0

### FB-003 — Preserve exploration

**User story**  
As a user, I want ScoutAlert to occasionally surface relevant opportunities outside a narrow learned pattern so that personalization does not trap me in a feedback loop.

**Acceptance criteria**
- Exploration is controlled and configurable by policy.
- Exploratory results still satisfy hard constraints.
- Stretch/exploration results are identifiable.
- Exploration effectiveness is measured.

**Priority:** P1

## 10. Saved opportunities and applications

### APP-001 — Track my application status

**User story**  
As a user, I want to track where I am in each application so that ScoutAlert becomes a useful opportunity workspace.

**Acceptance criteria**
- Supported states include interested, applied, interviewing, offer, rejected, withdrawn, and other approved states.
- Users can add private notes.
- Application state is user-owned.
- Tracking does not imply ScoutAlert submitted the application.

**Priority:** P1

### APP-002 — Keep saved opportunities after listing changes

**User story**  
As a user, I want saved opportunities to preserve relevant history even when the source closes or changes so that my application record remains useful.

**Acceptance criteria**
- Saved/application records retain the canonical opportunity reference and historical snapshot/evaluation references.
- Current closure/status is visible.
- Historical user notes are not deleted by source closure.

**Priority:** P1

### APP-003 — Prepare application assistance with approval

**User story**  
As a user, I want ScoutAlert to help prepare truthful application materials so that repetitive application work is easier.

**Acceptance criteria**
- Drafts use confirmed profile information and opportunity evidence.
- Proposed changes are reviewable.
- The system does not invent qualifications.
- External submission/contact requires separate explicit approval.

**Priority:** P2

## 11. Notifications

### ALERT-001 — Receive scheduled opportunity digests

**User story**  
As a user, I want ScoutAlert to send scheduled digests containing current recommendations so that I do not need to check the dashboard constantly.

**Acceptance criteria**
- Digest schedule follows the watchlist/account notification settings.
- Only current, authorized recommendations are eligible.
- Weak recommendations are not added merely to fill a quota.
- Each item includes enough context to judge whether to open it.

**Priority:** P0

### ALERT-002 — Receive important change alerts

**User story**  
As a user, I want optional alerts when a saved or highly relevant opportunity materially changes so that important updates do not wait for the next digest.

**Acceptance criteria**
- Material-change policy is explicit/versioned.
- Duplicate alerts are suppressed.
- The user can enable/disable supported change-alert types.
- Old/stale evidence is revalidated before sending.

**Priority:** P1

### ALERT-003 — Receive deadline reminders

**User story**  
As a user, I want optional reminders for saved opportunities with known deadlines so that I do not miss an application I intend to complete.

**Acceptance criteria**
- Only supported, sufficiently precise deadlines trigger reminders.
- Ambiguous date/time zones are handled according to an explicit policy.
- Closed/withdrawn opportunities do not generate new reminders.
- User preferences control reminders.

**Priority:** P1

### ALERT-004 — Avoid duplicate notifications

**User story**  
As a user, I want the same underlying opportunity consolidated across watchlists and alert types so that ScoutAlert does not repeatedly notify me about the same thing.

**Acceptance criteria**
- Recipient-level digest grouping deduplicates canonical opportunities.
- Watchlist-specific context can still be preserved in the dashboard.
- Exceptional alerts and scheduled digests coordinate item-level deduplication.
- Material changes can allow intentional re-alerting.

**Priority:** P0

### ALERT-005 — Control alerts at the right scope

**User story**  
As a user, I want to pause or unsubscribe from one watchlist or all opportunity alerts so that notification control matches my intent.

**Acceptance criteria**
- Watchlist-level and broader scopes are explicit.
- Account verification does not imply alert consent.
- Opt-out is rechecked before provider submission.
- Unrelated watchlists are not changed accidentally.

**Priority:** P0

## 12. Reliability and transparency

### REL-001 — Know whether my scout is running

**User story**  
As a user, I want to see recent run status and next scheduled activity so that I know whether ScoutAlert is functioning.

**Acceptance criteria**
- Run states distinguish pending, queued, running, succeeded, partial, and failed where applicable.
- The last successful scan is visible.
- Next scheduled run/action is visible when known.
- A failed run is not represented as no matches.

**Priority:** P0

### REL-002 — Distinguish no matches from failures

**User story**  
As a user, I want ScoutAlert to distinguish an empty valid result from incomplete/failed discovery so that silence is meaningful.

**Acceptance criteria**
- No-match, partial, source-unavailable, and failed states remain distinct.
- The dashboard can communicate materially relevant coverage limitations.
- Optional no-result notifications do not mask failures.

**Priority:** P0

### REL-003 — Inspect alert history

**User story**  
As a user, I want to see recent alert outcomes so that I can understand why an expected email did or did not arrive.

**Acceptance criteria**
- History distinguishes prepared, suppressed, submitted, failed, and provider-reported outcomes.
- Internal technical details and sensitive data are not exposed.
- Consent changes are reflected accurately.

**Priority:** P1

## 13. Privacy, security, and data control

### PRIV-001 — Keep my profile private

**User story**  
As a user, I want my profile and documents kept private from employers and other users unless I explicitly authorize sharing.

**Acceptance criteria**
- Signup or matching never automatically shares profile data externally.
- Private data access is actor-scoped.
- Shared research and caches do not contain private profile content.
- Operational access is restricted/audited.

**Priority:** P0

### PRIV-002 — Export and delete my account data

**User story**  
As a user, I want supported export and deletion controls so that I retain control over my participation.

**Acceptance criteria**
- Export covers supported user-owned records.
- Deletion revokes access and cancels future user-specific work.
- Private indexes/caches/checkpoints follow the retention/deletion policy.
- Security/audit retention exceptions are explained rather than hidden.

**Priority:** P1

### PRIV-003 — Protect account access

**User story**  
As a user, I want secure authentication and session controls so that other people cannot access my searches and recommendations.

**Acceptance criteria**
- Authentication and authorization are enforced server-side.
- Sessions can be revoked/expired.
- Sensitive operations are protected from common browser/session attacks.
- Private resource IDs do not act as authorization.

**Priority:** P0

## 14. Platform and quality operations

### OPS-001 — Manage approved opportunity sources

**User story**  
As a platform operator, I want to configure source access, refresh policy, attribution, permissions, and health so that discovery remains reliable and compliant with source constraints.

**Acceptance criteria**
- Each source has explicit configuration/versioning.
- Access/reuse scope is enforceable.
- Refresh/cursor behavior is observable.
- Disabled/revoked sources stop future ingestion/use according to policy.

**Priority:** P0

### OPS-002 — Monitor source health and freshness

**User story**  
As a platform operator, I want visibility into source failures, lag, incomplete responses, and freshness so that discovery degradation is detected quickly.

**Acceptance criteria**
- Source runs expose success/failure/completeness.
- Lag and stale-source metrics are available.
- Incomplete source responses do not silently close opportunities.
- Alerts/operational thresholds can be configured.

**Priority:** P0

### OPS-003 — Inspect recommendation provenance

**User story**  
As an authorized quality operator, I want to trace a recommendation through retrieval, rules, model evaluation, research, and evidence so that quality problems can be diagnosed.

**Acceptance criteria**
- Relevant correlation IDs and versions are retained.
- Supporting evidence and decisions are inspectable under access controls.
- Private content is minimized/redacted in general observability.
- Changes/corrections can invalidate affected recommendations.

**Priority:** P0

### OPS-004 — Recover failed background work safely

**User story**  
As a platform operator, I want failed or lost work to be retried/reconciled without duplicate business effects so that temporary infrastructure failures do not corrupt the product.

**Acceptance criteria**
- Durable outbox/run records exist.
- Workers are idempotent.
- Reconciliation identifies stuck/missing dispatches.
- Retry state is observable.
- Duplicate queue delivery does not duplicate recommendations or notifications.

**Priority:** P0

### OPS-005 — Control AI and research budgets

**User story**  
As a platform operator, I want bounded model, research, and tool usage so that ScoutAlert remains predictable under load.

**Acceptance criteria**
- Budgets can exist per task/workflow/user/plan/platform period as applicable.
- Usage is reserved/reconciled.
- Retries cannot bypass budget/deadline ceilings.
- Budget exhaustion preserves truthful uncertainty.
- Cost metrics can be related to useful product outcomes.

**Priority:** P0

### OPS-006 — Evaluate AI and retrieval changes before release

**User story**  
As a product/engineering operator, I want prompt, model, embedding, retrieval, reranking, and policy changes evaluated against ScoutAlert datasets so that changes do not silently degrade recommendation quality.

**Acceptance criteria**
- Versioned evaluation datasets exist.
- Critical eligibility/constraint regressions block release.
- Retrieval quality and model quality are measured separately.
- Results include latency and cost.
- Rollout/rollback version information is retained.

**Priority:** P0

### OPS-007 — Manage recommendation corrections

**User story**  
As an authorized quality operator, I want to correct verified extraction/evidence problems so that affected users receive updated assessments.

**Acceptance criteria**
- Corrections create new source/evidence versions rather than silently rewriting history.
- Dependent current evaluations can be invalidated/reprocessed.
- Historical provenance remains available.
- User-facing current state updates after re-evaluation.

**Priority:** P1

### OPS-008 — Monitor delivery quality

**User story**  
As a platform operator, I want visibility into email suppressions, bounces, complaints, ambiguous sends, and failures so that notification reliability can be maintained.

**Acceptance criteria**
- Provider callbacks are verified/deduplicated.
- Delivery ledger states are reconciled.
- Suppression state is enforced before future sends.
- Provider acceptance is not treated as proof the user read the email.

**Priority:** P1

## 15. Future opportunity categories

### CAT-001 — Search scholarships and fellowships

**User story**  
As a user, I want category-specific searches for scholarships and fellowships so that ScoutAlert can support education and development opportunities.

**Acceptance criteria**
- The category has its own requirement/evidence schema.
- Study level, subject, geography, funding, deadlines, and eligibility are handled appropriately.
- Employment-specific assumptions are not reused blindly.
- Category-specific source coverage is disclosed.

**Priority:** P2

### CAT-002 — Search grants and founder opportunities

**User story**  
As a founder, I want ScoutAlert to find grants, accelerators, procurement opportunities, and relevant programs so that I can monitor business opportunities with the same evidence-aware experience.

**Acceptance criteria**
- Company stage, incorporation, sector, geography, funding/terms, and participation requirements are category-specific.
- Opportunity requirements remain evidence-backed.
- Separate watchlists and notification policies are supported.

**Priority:** P2

## 16. Platform release definition

The initial jobs/contracts platform is complete when a user can:

1. maintain a confirmed profile;
2. create multiple independent watchlists;
3. receive continuously refreshed source-backed opportunities;
4. get hybrid-retrieval and evidence-grounded matching;
5. see hard constraints, fit, compensation, and uncertainty separately;
6. benefit from bounded research when important evidence is unclear;
7. inspect/save/dismiss recommendations;
8. receive reliable consent-aware alerts;
9. track scout health and distinguish failures from no matches;
10. control their data and notification scope.

Platform operations must support source health, provenance, idempotent recovery, AI/research budgets, quality evaluation, and delivery observability.
