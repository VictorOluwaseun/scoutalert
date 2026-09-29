# ScoutAlert — Onboarding User Stories

**Version:** 0.2

**Date:** 29 September 2026

**Status:** Product backlog baseline

**Scope:** Goal-first onboarding from first visit through guest exploration or scout activation

**Related PRD:** [ScoutAlert Onboarding PRD](../prd/scoutalert-onboarding-prd-v0.1.md), revision 0.2

**Platform baseline:** [Platform PRD](../prd/scoutalert-platform-prd.md), revision 0.2. These stories cover one feature; the platform backlog owns continuing discovery, services, alerts, opportunity management, and operations.

## 1. Priority definitions

- **P0** — Required for the first complete onboarding release.
- **P1** — Important for a strong production experience; may follow the first vertical slice but is required before broad release.
- **P2** — Valuable extension after the core onboarding experience is stable.

## 2. Goal-first entry

### ONB-001 — Understand what ScoutAlert does

**User story**

As a visitor, I want to understand what ScoutAlert will do for me so that I can decide whether it fits my needs.

**Acceptance criteria**

- The opening page explains that ScoutAlert finds and evaluates relevant opportunities.
- It explains that recommendations depend on supported source coverage and available evidence.
- It does not promise employment, universal source coverage, or guaranteed eligibility.
- The primary action is to describe what the user wants.

**Priority:** P0

**Related requirement:** FR-01

### ONB-002 — Start without creating an account

**User story**

As a visitor, I want to describe what I am looking for before providing my email or creating an account so that I can experience the product before committing.

**Acceptance criteria**

- A visitor can start with a single natural-language input.
- Email, CV upload, payment, and account creation are not prerequisites.
- Blank input is rejected with a useful message.
- The entered goal is preserved while the system interprets it.

**Priority:** P0

**Related requirement:** FR-01

### ONB-003 — Start from an example

**User story**

As a visitor who is unsure what to enter, I want editable examples so that I can get started quickly.

**Acceptance criteria**

- Examples only represent currently supported opportunity categories.
- Selecting an example populates the primary input without automatically submitting it.
- The user can edit the example before continuing.

**Priority:** P1

**Related requirement:** FR-01

## 3. Interpretation and adaptive clarification

### ONB-004 — Identify my opportunity goal

**User story**

As a user, I want ScoutAlert to understand the type of opportunity I am seeking so that subsequent questions are relevant.

**Acceptance criteria**

- The system proposes a supported opportunity category and target scope.
- Ambiguous goals trigger clarification instead of guessing.
- Unsupported categories are explained rather than silently converted.
- Independent goals can be separated into distinct searches.

**Priority:** P0

**Related requirement:** FR-02

### ONB-005 — Carry forward information I already provided

**User story**

As a user, I want details from my opening request to be recognized so that I do not have to enter the same information repeatedly.

**Acceptance criteria**

- Explicit role, location, arrangement, availability, and similar details are carried into the draft.
- The system does not re-ask already confirmed information without a clear reason.
- Extracted details remain editable.
- Inferred details remain visibly proposed until confirmed.

**Priority:** P0

**Related requirement:** FR-02

### ONB-006 — Answer only relevant missing questions

**User story**

As a user, I want ScoutAlert to ask only questions that materially improve my search so that onboarding stays focused.

**Acceptance criteria**

- Questions depend on the opportunity category and current draft.
- Common journeys target two to four clarification interactions.
- A detailed initial request may proceed directly to review.
- After the normal question budget, the user can review with visible unknowns.

**Priority:** P0

**Related requirement:** FR-02

### ONB-007 — Clarify ambiguous or conflicting requirements

**User story**

As a user, I want ScoutAlert to identify contradictions in my request so that I can resolve them explicitly.

**Acceptance criteria**

- Conflicting hard requirements are surfaced.
- The system explains what must be resolved.
- It does not silently weaken or remove a confirmed constraint.
- The user can change or remove the conflicting requirement.

**Priority:** P0

**Related requirement:** FR-02

### ONB-008 — Skip details I cannot answer yet

**User story**

As a user, I want to express uncertainty or skip optional questions so that missing information does not block useful exploration.

**Acceptance criteria**

- The UI distinguishes **Not sure**, **No preference**, and **Skip for now** where appropriate.
- These states remain semantically distinct in the saved draft.
- Missing facts are not converted into positive eligibility claims.
- Consequences of an unknown answer are explained when material.

**Priority:** P0

**Related requirement:** FR-02

## 4. Profile and search parameters

### ONB-009 — Describe my relevant background

**User story**

As a user, I want to describe my relevant experience, skills, and qualifications so that ScoutAlert can evaluate professional fit.

**Acceptance criteria**

- Background can be provided conversationally or through lightweight structured fields.
- Demonstrated experience is separated from aspirations or skills being learned.
- A complete employment history is not required.
- CV upload remains optional.

**Priority:** P0

**Related requirement:** FR-03

### ONB-010 — Specify my location and relevant eligibility

**User story**

As a user, I want to specify where I live, where I want to work, and relevant work-authorization information so that ScoutAlert can assess stated geographic requirements.

**Acceptance criteria**

- Residence, desired work locations, relocation preference, work authorization, and sponsorship need are separate fields.
- Citizenship or authorization is not inferred from residence.
- Remote does not automatically mean worldwide eligibility.
- Unknown eligibility remains unconfirmed.

**Priority:** P0

**Related requirement:** FR-03

### ONB-011 — Set practical work preferences

**User story**

As a user looking for work, I want to specify work arrangement, engagement type, availability, and relevant schedule constraints so that recommendations fit my circumstances.

**Acceptance criteria**

- The flow supports remote, hybrid, and on-site preferences.
- It supports relevant engagement types such as full-time, part-time, internship, and paid contract.
- Availability and time-overlap requirements are captured only when useful.
- Optional omissions do not create invented defaults.

**Priority:** P0

**Related requirement:** FR-03

### ONB-012 — Set compensation expectations

**User story**

As a user, I want to specify my financial requirements so that ScoutAlert can identify opportunities that do or do not meet them.

**Acceptance criteria**

- Amount, currency, period, and compensation basis are stored explicitly.
- Hourly, monthly, annual, stipend, and other supported bases remain distinct.
- Undisclosed compensation is handled according to an explicit user policy.
- Hourly pay is not annualized using unstated hours.

**Priority:** P0

**Related requirement:** FR-03

### ONB-013 — Answer category-specific questions

**User story**

As a user, I want follow-up questions to reflect the type of opportunity I selected so that I am not asked irrelevant questions.

**Acceptance criteria**

- Employment questions are used for employment searches.
- Future categories can introduce their own versioned question schemas.
- Unsupported category-specific fields are not presented as live functionality.
- Shared profile information is reused only where relevant.

**Priority:** P1

**Related requirement:** FR-03

### ONB-014 — Distinguish requirements from preferences

**User story**

As a user, I want to distinguish mandatory criteria from preferences and flexibility so that ScoutAlert understands acceptable trade-offs.

**Acceptance criteria**

- Consequential criteria support **Must have**, **Prefer**, and **Open to alternatives** where appropriate.
- Mandatory constraints cannot be silently relaxed by ranking or AI.
- The user can choose how unconfirmed eligibility or undisclosed compensation should be handled.
- Defaults are visible during review.

**Priority:** P0

**Related requirement:** FR-03

## 5. Review and preview

### ONB-015 — Review an understandable search summary

**User story**

As a user, I want to review ScoutAlert's interpretation before activation so that I can correct misunderstandings.

**Acceptance criteria**

- The review shows target scope, relevant background, geography, compensation, mandatory constraints, preferences, and uncertainty policies.
- Proposed/unconfirmed fields are visually distinguishable from confirmed fields.
- Each meaningful section is editable without restarting onboarding.
- Editing a search-relevant field creates a new search revision.

**Priority:** P0

**Related requirement:** FR-04

### ONB-016 — Name my first scout

**User story**

As a user, I want a recognizable name for my first search so that I can manage it later.

**Acceptance criteria**

- ScoutAlert suggests a name from the confirmed search.
- The name is editable.
- Naming does not require a dedicated compulsory screen.
- The name does not alter search semantics.

**Priority:** P1

**Related requirement:** FR-04

### ONB-017 — Preview the kind of results I will receive

**User story**

As a user, I want to preview representative current results so that I understand the value of the configured scout.

**Acceptance criteria**

- Up to the configured number of preview opportunities can be shown when current evidence exists.
- Each preview separates professional fit, eligibility, important uncertainty, source, and check time.
- Example/demo content is explicitly distinguished from live source-backed results.
- Empty, failed, partial, stale, and successful preview states are distinguishable.
- Editing the search invalidates older preview results.

**Priority:** P0

**Related requirement:** FR-04

## 6. Guest exploration

### ONB-018 — Explore without providing an email

**User story**

As a user, I want to explore a limited preview without providing my email so that I can evaluate ScoutAlert before activating recurring scouting.

**Acceptance criteria**

- An **Explore without email** path is available after review.
- Guest exploration does not create a durable account.
- It does not schedule recurring scouting or send opportunity emails.
- Browser-local persistence limitations are explained.
- The user can discard the local draft.

**Priority:** P0

**Related requirement:** FR-05

## 7. Alerts and account activation

### ONB-019 — Choose my alert frequency

**User story**

As a user, I want to choose how often ScoutAlert notifies me so that alerts fit my routine.

**Acceptance criteria**

- Supported options include daily, weekly, and dashboard-only, with optional prompt alerts under the platform policy.
- Email frequency is separate from discovery cadence.
- Weekly schedules capture a weekday.
- The selected frequency is visible at final review.

**Priority:** P0

**Related requirement:** FR-06

### ONB-020 — Choose alert timing and preview the digest

**User story**

As a user, I want to choose when alerts arrive and see a preview so that I understand the notification experience.

**Acceptance criteria**

- The user can review/edit an IANA timezone and local delivery time.
- Timezone detection is treated as a suggestion, not residence.
- The digest preview does not send an email.
- Sample versus live preview content is clearly identified.

**Priority:** P1

**Related requirement:** FR-06

### ONB-021 — Explicitly enable opportunity emails

**User story**

As a user, I want to explicitly choose whether ScoutAlert sends opportunity emails so that entering my email does not automatically subscribe me.

**Acceptance criteria**

- Opportunity-alert consent is separate from marketing consent.
- Account verification is not alert consent.
- Dashboard-only activation does not require opportunity-email opt-in.
- The user is told how to pause or stop alerts.

**Priority:** P0

**Related requirement:** FR-06

### ONB-022 — Verify my email after configuring my search

**User story**

As a user, I want to verify my email after reviewing my search so that I can own a persistent scout without interrupting the initial experience.

**Acceptance criteria**

- Verification occurs only when persistent account ownership is needed.
- The search draft survives verification failure, resend, expiry, and correction.
- Invalid, expired, replayed, and exhausted codes are rejected server-side.
- Verification establishes identity but does not enable alerts automatically.
- Existing accounts can be signed into without losing the draft.

**Priority:** P0

**Related requirement:** FR-07

### ONB-023 — Activate my scout

**User story**

As a user, I want one clear final action to activate my approved search so that I know when persistent scouting starts.

**Acceptance criteria**

- The primary action is **Start my scout** or equivalent.
- Activation validates the current reviewed search revision and required preferences.
- Repeated clicks/retries do not create duplicate scouts.
- Missing optional facts are allowed when the user accepted their implications.
- Opportunity-email activation additionally requires current verified ownership and explicit consent.

**Priority:** P0

**Related requirement:** FR-08

### ONB-024 — Know what happens after activation

**User story**

As a user, I want to see what ScoutAlert saved and what will happen next so that I know whether the scout is actually working.

**Acceptance criteria**

- The confirmation shows the created scout.
- The initial scan state is truthful, such as pending, queued, running, completed, or failed.
- **Queued** is not presented as **search completed**.
- The next known scheduled action is shown when available.
- A failed initial scan does not delete the successfully created scout.

**Priority:** P0

**Related requirement:** FR-08

## 8. Recovery, privacy, accessibility, and returning users

### ONB-025 — Go back, pause, and resume

**User story**

As a user, I want to revise answers and resume an unfinished onboarding session so that interruptions do not force me to start over.

**Acceptance criteria**

- Back navigation preserves valid answers.
- Browser reload preserves available draft state.
- Authenticated unfinished drafts can resume across supported devices.
- Search-dependent previews are invalidated when relevant inputs change.

**Priority:** P0

**Related requirement:** FR-09

### ONB-026 — Recover from errors without losing progress

**User story**

As a user, I want recoverable failures to preserve my work so that temporary model, network, preview, or email problems do not destroy onboarding.

**Acceptance criteria**

- Failed model interpretation preserves the canonical draft.
- Manual correction remains available.
- Late/stale asynchronous responses cannot overwrite newer revisions.
- Preview failure does not block review or valid activation.
- Failed actions are not represented as successful.

**Priority:** P0

**Related requirement:** FR-09

### ONB-027 — Control the information I provide

**User story**

As a user, I want to understand and control the personal information used during onboarding so that I can participate without unnecessary disclosure.

**Acceptance criteria**

- The flow collects only information relevant to the search.
- Passport/payment information is not requested as part of onboarding.
- Future document upload explains processing and retention before upload.
- Users can discard unfinished guest drafts.
- Private information is not shared with employers merely by onboarding.

**Priority:** P0

**Related requirement:** FR-09

### ONB-028 — Complete onboarding accessibly

**User story**

As a user, I want onboarding to work across mobile, keyboard navigation, and assistive technologies so that I can complete the flow independently.

**Acceptance criteria**

- Critical controls are keyboard-operable.
- Focus is visible.
- Forms have semantic labels and accessible errors.
- Status changes are announced appropriately for assistive technology.
- Meaning is not communicated by color alone.
- Reduced-motion preferences are respected.

**Priority:** P1

**Related requirement:** FR-09

### ONB-029 — Reuse my confirmed profile when I return

**User story**

As a returning user, I want ScoutAlert to reuse confirmed profile facts for a new search so that I only answer questions specific to the new goal.

**Acceptance criteria**

- Confirmed reusable profile data can populate a new search.
- Search-specific preferences do not overwrite the shared profile.
- Creating/editing one scout does not change unrelated scouts.
- Conflicting newer profile information is surfaced rather than silently overwritten.

**Priority:** P1

**Related requirement:** FR-09

## 9. Onboarding release definition

The onboarding release is complete when a new visitor can:

1. describe a supported goal;
2. receive only relevant clarification;
3. correct ScoutAlert's interpretation;
4. set meaningful hard constraints and preferences;
5. review an evidence-aware preview;
6. explore without email or verify an account;
7. explicitly configure notifications;
8. activate exactly one persistent scout;
9. recover from expected failures without losing valid progress.

The implementation must preserve the distinction between **guest exploration**, **account ownership**, **scout activation**, and **opportunity-email consent**.
