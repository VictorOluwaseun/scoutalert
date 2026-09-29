# ScoutAlert — Onboarding PRD

**Version:** 0.2

**Date:** 29 September 2026

**Status:** Proposed implementation specification; ready for product and engineering review

**Product name:** ScoutAlert

**Scope:** Goal-first onboarding for a global opportunity scout

**Parent baseline:** [Platform PRD](scoutalert-platform-prd.md); this document specifies one feature

## 1. Product summary

Onboarding helps a visitor turn an ordinary-language goal into a confirmed, personalized opportunity search. It should feel like briefing a capable scout, not registering for a dashboard or completing a long questionnaire.

**Core journey:** Describe your goal → Clarify what matters → Review your search → Explore or activate → Start scouting.

The product learns enough to create a useful first scout, distinguishes requirements from preferences, and makes uncertainty visible. Email and account setup come after the user understands the proposed search. A CV, complete professional profile, and payment are not prerequisites.

The visual direction is the simple, single-input opening discussed in the conversation: warm off-white surfaces, deep-green accents, strong typography, and focused questions. This specifies our own experience, not unverified behavior from the reference website.

## 2. Problem, users, and desired outcomes

The onboarding problem is not collecting every possible profile field. It is understanding a person's goal accurately enough to begin useful discovery without overwhelming them or making unsupported eligibility assumptions.

The primary user is an individual seeking work across local and international markets. The experience must accommodate different professions, experience levels, locations, and degrees of search clarity—not only software engineers or people seeking US employment.

A detailed opening request should shorten the journey. A broad request should trigger focused clarification. A returning user should reuse confirmed information without changing unrelated scouts.

Two completion outcomes are intentionally separate:

| Outcome                 | What the user receives                                               | What is not implied                                                        |
| ----------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Guest exploration ready | A reviewed search and a limited, on-demand preview                   | No account, cross-device persistence, recurring scouting, or emails        |
| Scout activated         | A saved scout, scheduled discovery, and chosen notification settings | Email delivery unless verification and explicit alert consent are complete |

Authenticated dashboard-only scouting is supported: account verification establishes identity, but does not subscribe the person to opportunity emails.

## 3. Scope and release decisions

**Initial onboarding category configuration:** jobs, including full-time, part-time, and internships, plus paid contracts. The platform also covers service opportunities; enable their onboarding with explicit project/deliverable/budget/availability schemas and live source coverage. The audience is worldwide; initial source coverage and interface-language availability must be stated honestly. Enabled categories are a rollout decision, not the limit of ScoutAlert's product direction.

**Included:** natural-language entry, editable extraction, relevant follow-up questions, optional background details, eligibility and uncertainty preferences, search review, preview, guest exploration, passwordless email verification, notification consent, activation, draft recovery, mobile accessibility, and measurement.

**Progressive enrichment:** CV import, detailed employment history, portfolio analysis, advanced exclusions, detailed availability, and additional scouts can be added after the first search. A lightweight field may appear during onboarding when the user's request makes it relevant; none should become a compulsory profile-completion exercise.

**Outside onboarding v1:** automated applications, recruiter outreach, interview preparation, billing, employer accounts, document-heavy identity checks, and universal opportunity coverage. Production CV parsing and scholarship, fellowship, grant, or accelerator onboarding are subsequent capabilities unless explicitly added to the release.

These are onboarding boundaries. Continuous discovery, monitoring, prompt alerts, opportunity management, feedback, services, commercial operations, integrations, and intelligence evolution belong to the platform PRD and backlog; their implementation is not limited by this feature's release.

The opening examples must follow enabled categories. For an unsupported goal, explain the limitation and allow editing; do not silently convert a scholarship request into a job search.

## 4. Experience principles

**Goal before identity.** Ask what the person needs before asking for their email. **Minimum necessary context.** Show one focused question or a small related group; use progressive disclosure for advanced settings. **Confirmation before commitment.** Inferences remain proposals until reviewed. **Honest uncertainty.** Unknown information is not a match, a rejection, or unrestricted eligibility. **User control.** Never silently relax mandatory requirements. **Truthful status.** Do not simulate research, verification, source coverage, or successful activation in production.

The flow has logical stages, not a mandatory six-screen wizard. Progress labels should describe the stage, such as “Your goal,” “A little context,” and “Review,” rather than advertise a fixed question count that changes unexpectedly.

## 5. Functional requirements

### FR-01 — Goal-first entry

_User stories: ONB-001–003_

The opening screen contains a clear promise, one primary text input, a Start button, and a small number of editable examples. An optional sign-in link is secondary. There is no account wall, upload requirement, sidebar, pricing choice, or empty dashboard.

Suggested heading: **“An AI agent for your next opportunity.”** Suggested placeholder: **“A role, a goal, or a little about you…”** Example: “I'm a backend engineer in Nigeria looking for remote jobs with international companies.”

Accept short phrases and detailed requests up to a proposed 4,000-character limit. Validate blank input locally. Show a clear limit message rather than truncating silently. Selecting an example populates the input but does not submit it automatically. Starting sends the entered request for interpretation; explain this briefly near the input without requiring an account.

**Acceptance:** A visitor can begin with one meaningful input and no personal contact details. An unavailable service is never promoted through an example.

### FR-02 — Interpretation and adaptive clarification

_User stories: ONB-004–008_

Extract the opportunity category, target roles or goal, stated background, location information, work arrangement, constraints, and flexibility. Reuse explicit details instead of asking for them again. Preserve the original statement behind extracted information so corrections can be understood.

The question policy identifies the highest-value unresolved field or contradiction. For “Remote Android contracts, 20 hours weekly,” do not re-ask the role, arrangement, engagement type, or hours. “Jobs” requires goal clarification. Two independent requests, such as a full-time job and a scholarship, require choosing the first search or explicitly separating them.

Support free text plus useful choices. Distinguish “Not sure,” “No preference,” and “Skip for now.” Explain why a sensitive or consequential question matters. Allow direct editing and a manual fallback.

Target two to four clarification interactions for common cases; detailed input may need none. After four, offer review with visible unknowns and optional refinement. Do not trap the user in a question loop. A missing fact may remain unknown, but a contradiction must be resolved or removed from active requirements before activation.

**Acceptance:** No repeated question for confirmed data, no silent category switch, and no inferred requirement presented as user-confirmed.

### FR-03 — Search parameters and relevant background

_User stories: ONB-009–014_

Capture only relevant fields, using these rules:

| Parameter group     | Required behavior                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Goal                | Confirm category and at least one target role, role family, skill-led objective, or other meaningful search scope            |
| Background          | Offer a brief experience summary; distinguish demonstrated skills from interests and learning goals                          |
| Geography           | Separate residence, desired work locations, relocation preferences, and existing work authorization; allow explicit unknowns |
| Practical fit       | Capture relevant work arrangement, engagement type, hours, overlap, and start availability without demanding every field     |
| Financial terms     | Store amount, currency, period, and basis; separate hourly rates, salary, and future funding amounts                         |
| Preference strength | Support Must have, Prefer, and Open to alternatives for consequential criteria                                               |
| Missing information | Let users exclude unknown requirements or review them separately; never treat missing salary as zero                         |

“Remote” does not set hiring geography to worldwide. Residence does not establish citizenship or authorization. A browser timezone may suggest an alert timezone, but not a residence. An hourly rate must not be annualized without explicit hours and assumptions.

The proposed default is to place unconfirmed eligibility in a separate review group. Undisclosed compensation is allowed only according to the visible selected policy. Defaults appear in review and remain editable.

Optional fields can be postponed. Their omission must reduce the claims the system makes, not invent information to fill the gap. Non-employment fields are category-specific when those modules are enabled.

**Acceptance:** The confirmed search separates hard constraints, preferences, and unknowns; existing capabilities are not overstated.

### FR-04 — Review, naming, and value preview

_User stories: ONB-015–017_

Show a concise editable summary containing the goal, relevant background, geographic interpretation, financial preferences, mandatory conditions, and unknown-information policy. Mark unconfirmed information visibly. Suggest an editable scout name without making naming a separate step.

Show up to three preview opportunities when suitable current evidence is available. Explain fit, hiring eligibility, important gaps, source, and check time. A fit score must not be presented as a probability of employment. Illustrative cards are permitted only when explicitly labeled as examples and separated from live results.

No matches is a legitimate result. Explain whether the cause is restrictive settings, limited coverage, missing information, or an incomplete search. Suggest optional changes without applying them. Users can edit requirements, activate unchanged, or leave.

Preview fetching must not block access to the reviewed summary. A timeout displays its actual state and a retry option. Editing the search invalidates old previews; hide or mark them stale until refreshed.

**Acceptance:** The user confirms a specific search revision. Material changes require a refreshed review before activation; no old preview appears as evidence for new requirements.

### FR-05 — Guest exploration

_User story: ONB-018_

Provide an “Explore without email” action after review. Guests can inspect the limited preview, edit the draft, and return to activation. On-demand anonymous requests may be rate-limited, but the guest route must remain useful and honestly described.

Guest drafts are browser-local by default. Explain that they do not sync across devices and may disappear when storage is cleared. If storage is unavailable, keep the current session usable and display that limitation. Provide “Discard this draft,” particularly for shared devices.

**Acceptance:** Guest exploration does not create a durable account, schedule recurring discovery, or send emails. Expensive previews use bounded server work, not a permanently running guest agent.

### FR-06 — Alerts and consent

_User stories: ONB-019–021_

Offer daily, weekly, or dashboard-only updates, with optional prompt alerts for highly relevant new opportunities under the platform notification policy. Display an editable timezone and local delivery time; weekly delivery also requires a weekday. Proposed default suggestions are daily at 08:00 in the confirmed timezone, but no choice constitutes consent until confirmed. If timezone detection is unavailable, ask rather than silently choosing one.

Preview a digest using the reviewed search and clearly identified sample or live content. Keep exceptional-match alerts, deadline reminders, and detailed volume controls optional. Show a manageable result limit, such as “up to five,” without requiring weak matches to fill it.

Opportunity-alert consent is explicit, recorded, and separate from marketing. Users selecting dashboard-only are not asked to opt into alerts. Explain how to pause or unsubscribe. Digest preview never sends an email.

**Acceptance:** Notification preferences are visible in the final summary. Email entry, account verification, and marketing consent never substitute for opportunity-alert consent.

### FR-07 — Passwordless verification and account association

_User story: ONB-022_

Request email only after search review when the visitor chooses ongoing scouting or cross-device saving. Explain that verification creates or signs them into an account. Dashboard-only users still authenticate to own a persistent scout; this is not email-alert subscription.

Proposed v1 verification uses a randomly generated six-digit, single-use code: ten-minute expiry, a 60-second resend cooldown, and five failed attempts per challenge. Apply additional account, destination, and network abuse limits. Never use a fixed demonstration code in production.

Allow address correction, resend, paste, expired-code recovery, and cancellation without losing the draft. Use neutral responses that do not disclose account existence. Do not merge records or attach a draft to an account until ownership is authenticated. A successful verification must not erase the search.

**Acceptance:** Invalid, expired, replayed, and exhausted challenges are rejected server-side. Account access can be established without enabling alerts.

### FR-08 — Activation and handoff

_User stories: ONB-023–024_

The final action is “Start my scout.” Verify ownership, approved revision, supported category, interpretable goal, consistent active constraints, explicit unknown policies, and complete scheduling preferences. Optional missing facts do not block activation when the user accepted their implications.

Persist the confirmed scout, selected preferences, relevant confirmed profile data, and an initial-work event as one reliable operation. Use an activation idempotency key tied to the account and draft; repeated clicks or retries must not create duplicate scouts or jobs.

Show the saved scout, actual initial-scan state, and next known scheduled action. “Queued” is not “search completed.” If discovery later fails, keep the saved scout and expose retry/status in the dashboard. A save failure must not show success or dispatch alerts.

**Acceptance:** One approved activation creates one scout. Email sending requires a verified address, current alert consent, enabled preferences, and no applicable suppression; these conditions are rechecked at dispatch.

### FR-09 — Recovery, privacy, accessibility, and returning users

_User stories: ONB-025–029_

Back navigation, reload, and recoverable network errors preserve available draft data. Revisions are checked on every asynchronous response; a late interpretation must not overwrite a newer answer. Repeated model failures offer manual entry rather than an indefinite spinner.

Onboarding does not collect passports, payment details, or unnecessary sensitive attributes. Any future document upload needs a separate explanation of processing, retention, and deletion. Do not expose profile details through routine logs or analytics.

Support mobile browsers, keyboard navigation, semantic labels, visible focus, screen-reader status announcements, non-color error indicators, and reduced motion. Inputs and actions remain usable with the mobile keyboard open. Prepare the design for localization and right-to-left layouts without claiming unimplemented languages.

Authenticated returners can reuse confirmed profile information and create a new scout. Search-specific changes do not overwrite the shared profile or other scouts without separate confirmation.

**Acceptance:** Core onboarding remains usable without animations or a pointing device; recovery and returning-user paths do not duplicate or silently replace data.

## 6. AI behavior and implementation boundaries

**GPT-5.4 mini** remains a starting interpretation candidate behind a configurable application port. Select and pin the production task profile after extraction, constraint-preservation, language, latency, cost, and failure-path evaluation. This candidate is not a quality guarantee or a universal platform model decision.

The model interprets user text and proposes structured updates. Application code owns schema validation, supported categories, field requirements, question selection rules, authorization, consent, scheduling, and activation. An adaptive experience does not require an unrestricted autonomous agent.

Each extracted field carries a value, provenance, and confirmation state. Inferences are suggestions; confidence is not user approval. Responses must distinguish missing, unknown, and unconstrained values. Validate numbers, units, currencies, category identifiers, and contradictions before presenting them.

RAG is used only when external evidence is necessary, such as fetching current opportunity evidence for preview. Draft interpretation should not repeatedly retrieve or research jobs before the goal is understood. Taxonomies and supported capabilities come from controlled product configuration, not invented model output.

Treat user text and retrieved content as data, never privileged instructions. The interpretation service cannot send emails, authorize accounts, change consent, or submit applications. Limit tools to required read operations and authorized draft updates.

Proposed bounds: up to six model requests per ordinary session, including at most one repair request for invalid structured output. Enforce a 20-second per-turn deadline, offer recovery after ten seconds, and switch to manual refinement when the session budget is exhausted. These limits are tunable after testing; progress must not depend on unlimited calls.

## 7. Data and lifecycle requirements

| Record                   | Minimum responsibilities                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Onboarding draft         | Session identifier, revision, supported goal, answers, field provenance, unknowns, approved revision, stage, expiry |
| Account/profile          | Authenticated owner, verified email, confirmed reusable background, explicit profile version                        |
| Scout                    | Owner, name, opportunity category, targets, constraints, preferences, unknown policies, status, version             |
| Notification preferences | Channel, frequency, weekday when relevant, local time, timezone, result limit, enabled state                        |
| Consent record           | Purpose, granted or withdrawn state, time, consent wording version, authenticated association                       |
| Activation/outbox record | Idempotency key, approved revision, created scout, queued initial work, processing status                           |

Distinguish **draft → clarification → review → preview-ready** from **verification-pending → authenticated-ready → activation-pending → active**. Guest exploration branches from preview-ready and creates no background schedule. Paused onboarding, verification failure, activation failure, and initial-scan failure are separate recoverable conditions.

An authenticated dashboard-only scout is active with email alerts disabled. Being verified is not being subscribed. Being saved is not proof that a scan succeeded.

Suggested retention for implementation review: browser drafts expire after seven days of inactivity; signed-in unfinished drafts after 30 days, with immediate discard available. Verification challenges expire independently. Define server retention for security metadata before release. Anonymous interpretation bodies must not be retained by default in general application logs; model-provider data handling requires deployment review.

## 8. Reliability, performance, and security requirements

Use cancellation or revision checks for obsolete requests, bounded retries, server-side validation, request-size limits, and rate limits for anonymous interpretation, preview, and verification. Render user content as text rather than executable markup. Account-scoped access controls apply to every durable draft and scout operation.

Activation must tolerate process failures between saving and background execution through a transactional outbox or equivalent design. Workers are idempotent. Delivery checks the latest consent and suppression state, including changes made after a digest was queued.

Proposed responsiveness targets: local controls acknowledge within 300 milliseconds; interpretation returns within eight seconds at the 95th percentile under the defined test workload. Slow turns display honest progress and recovery controls. Preview or email-provider outages must not destroy a reviewed draft.

The platform foundations are Next.js, NestJS, PostgreSQL/Kysely/pg, and Redis behind shared core contracts and infrastructure adapters. Durable execution follows the platform stack's preferred Temporal target and adoption checks. This feature PRD does not establish an independent queue or research framework.

## 9. Measurement and success criteria

The primary measure is **useful activation**, not email capture: a user activates a scout and, within seven days, identifies at least one recommendation as relevant through a save, positive feedback, or application action. Report this with opportunity availability and geography, rather than treating sparse source coverage as an onboarding failure alone.

Track guest exploration separately from activation. Define onboarding start as the first valid goal submission. Measure review completion, clarification turns, edits, abandonment by stage, verification completion, activation success, and time to first useful recommendation.

Suggested events include `onboarding_started`, `goal_interpreted`, `clarification_answered`, `review_confirmed`, `preview_viewed`, `guest_exploration_started`, `verification_succeeded`, `alert_consent_changed`, and `scout_activated`. Include revision, category, route, duration, and error code where relevant—not raw prompts, CV content, names, or email addresses. Avoid attaching precise personal geography to anonymous analytics without a defined need.

| Criterion                 | Provisional target or release gate                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Active completion time    | Median no more than three minutes, excluding external email waiting; calibrate with beta users                        |
| Clarification burden      | Most ordinary cases reach review within four clarification interactions                                               |
| Extraction quality        | At least 95% correct supported-field extraction on a human-labeled evaluation set; measure critical fields separately |
| Hard-constraint integrity | No unresolved critical cases of silent relaxation, invented authorization, or wrong-unit financial interpretation     |
| Activation reliability    | No duplicate scout or notification scheduling in retry and concurrency tests                                          |
| Email control             | No opportunity email without verified ownership and current alert consent in release tests                            |

Numeric targets are proposed, not observed results. Define the evaluation workload and sample composition before using them as production claims. Track model requests, latency, failure rate, and cost per completed onboarding; set a monetary budget after measured token usage.

## 10. Acceptance test scenarios

| Scenario                                        | Expected behavior                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Detailed opening request                        | Reuses supplied details and skips redundant questions                          |
| “I want jobs”                                   | Clarifies a meaningful target rather than inventing a profession               |
| Jobs plus an unsupported scholarship goal       | Explains availability and lets the user choose or edit; no silent substitution |
| Remote request from Nigeria                     | Keeps residence separate from hiring geography and authorization               |
| Hourly minimum with undisclosed salary listings | Preserves units and follows the explicit missing-pay policy                    |
| Contradictory hard requirements                 | Requests resolution or removal; never silently relaxes one                     |
| Unknown residence or authorization              | Allows review with unknowns; never marks eligibility confirmed                 |
| Empty or stale preview                          | Shows its true state; optional refinement and activation remain available      |
| Guest declines email                            | Opens limited exploration; creates no account or recurring alerts              |
| Dashboard-only authenticated user               | Saves and schedules the scout with opportunity emails disabled                 |
| Wrong, expired, resent, or replayed code        | Enforces verification rules without losing the draft                           |
| Double-click, retry, or concurrent activation   | Returns the same successful activation rather than duplicates                  |
| Consent withdrawn after digest queueing         | Dispatch does not send the queued opportunity email                            |
| Back navigation or late model response          | Preserves current answers; rejects stale revisions                             |
| Browser storage unavailable                     | Current-session flow works; persistence limitation is disclosed                |
| Returning user edits a new scout                | Other scouts and shared profile remain unchanged unless approved               |
| Prompt injection or malformed model result      | No privileged action; schema validation and bounded fallback apply             |
| Mobile, keyboard, and screen-reader use         | All critical paths remain operable and status changes are understandable       |

## 11. Dependencies, rollout, and remaining approvals

Dependencies are the supported-category configuration, interpretation service, search/preview service, source freshness metadata, account verification, account-scoped persistence, scheduling, notification delivery, consent/suppression handling, and analytics. Assign an owner and observable failure state to each before implementation is considered complete.

Begin with a clearly labeled internal prototype, then a closed beta with live verification and search. Test different professions, regions, detailed and vague prompts, low-bandwidth conditions, and assistive technologies. Enable public rollout only after the critical acceptance scenarios pass and the published source coverage matches actual integrations.

The following are proposed defaults requiring approval: v1 opportunity categories, initial interface languages, guest-preview limits, draft-retention periods, OTP policy, suggested digest timing, and performance/cost budgets. They do not change the established direction: goal first, adaptive clarification, review before email, optional guest exploration, and explicit activation.

## 12. Definition of done

Onboarding is ready when a new visitor can describe a supported goal, correct the interpretation, set meaningful constraints, review an honest preview, and either explore as a guest or activate a persistent scout. Verified and consenting users receive the chosen alert experience; authenticated dashboard-only users do not receive opportunity emails.

The flow must pass the acceptance scenarios, preserve progress through recoverable failures, explain unknowns, work on mobile and with assistive technology, and expose actual activation and search state. Operational visibility, privacy controls, and measurement must be implemented—not postponed until after launch.

**Final product rule: collect the minimum needed to create a useful, honest first search. Enrich the profile later.**
