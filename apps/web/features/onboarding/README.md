# Onboarding interface

The selected visual direction is **Ink + citron**: cool-white canvas, ink text and actions, citron used sparingly for emphasis, Manrope typography, and light illustration and scout-brief panels. The [design comparison](../../../../design-previews/scoutalert-themes.html) records the chosen direction.

The Latin subset of Manrope is bundled with the web app so onboarding does not depend on a font request to a third party at runtime. Its SIL Open Font License is retained beside the font file.

This feature lets someone prepare a personal scout for employment, contracts, or client projects. Search details now receive a deterministic API check before the review screen. Shared email verification, account sessions and transactional scout saving are connected. Activation dispatches the connected discovery and assessment pipeline. The initial goal is still explicitly reviewed as structured answers rather than silently interpreted into confirmed facts.

The canonical entry is `/onboarding`; `/` redirects there. Each step has a distinct URL such as `/onboarding?step=focus` or `/onboarding?step=preferences`. Advancing adds browser history, so browser Back and Forward restore the corresponding screen without discarding edits. The visible Back control follows that history after an in-flow advance and falls back to the previous logical step for a direct link. A direct link or refresh uses the saved local answers, but a previous server review is never trusted from browser storage; the server checks restored answers again. Contact and saved-scout steps also require authoritative identity context.

The opening headline cycles through three plain-language promises about finding work, worthwhile matches, and alerts for jobs and projects. It pauses while hovered or while someone is using the goal form, and stops when the page is hidden or reduced motion is requested. The description below stays fixed so the product remains understandable at any point in the cycle.

## Flow

1. Describe a goal in free text, or choose an editable example.
2. Confirm the opportunity category, target work, and optional background. The original goal remains part of the brief; only the exact examples prefill structured answers.
3. Choose work arrangement, must-have status, residence, hiring geography and compensation units. Optional work authorization and missing-information policies use native expandable sections. The Next.js route forwards these answers to the NestJS API, which checks the brief using the core onboarding use case.
4. Name and review the scout. Explore fictional opportunities as a guest before providing an email.
5. Choose daily, weekly, or dashboard-only delivery. Email alerts require a separate unchecked consent control. Prompt alerts are optional.
6. Request an actual Mailpit code, verify it, and save the confirmed scout. An existing signed-in account can save directly. The saved result records pending initial discovery rather than claiming a completed search.
7. Open the account-owned dashboard through “Go to my dashboard.” The example preview remains an optional secondary link. “Add a scout” starts a fresh brief and a fresh activation request while retaining the verified account.

Progress groups the screens into Brief, Preferences, Review, Alerts and Account. Account setup and verification have their own visible group rather than extending the final alert step.

Only the exact built-in example briefs seed structured fields. Arbitrary requests remain editable and require the person to confirm their target. Examples are never described as live discoveries or personalized matches.

Every onboarding form disables native validation popups with `noValidate`. React displays inline validation messages, focuses incomplete email/code/target/schedule fields, and connects contact errors through `aria-describedby` and `aria-invalid`. Email input semantics, autocomplete and numeric code keyboards remain available. Local checks provide immediate feedback; server validation remains authoritative for identity, search details and activation.

## Local state

`use-onboarding.ts` owns URL-driven progress, screen state, and user edits. `stage-route.ts` maps known steps to same-origin URLs and guards deep links. `draft-storage.ts` encapsulates local draft recovery under `scoutalert:onboarding-preview:v1` with a seven-day expiry, runtime validation, and a whitelist of known fields.

Email and verification codes are not stored in browser draft recovery. Sessions use host-only HttpOnly cookies and are authorized by PostgreSQL. Alert consent is cleared on restoration. Current code generations are recovered from the server; completion URLs retrieve an owner-scoped saved receipt. Activation retries retain a non-authoritative request key in session storage, with an in-memory fallback. Unavailable storage leaves the current tab usable; the footer explains that draft recovery is unavailable.

Example bookmarks are held in memory for the opportunity screen and reset on leaving it. The draft can be discarded through an explicit confirmation dialog.

## Organization

- `onboarding-experience.tsx`: screen composition, progress navigation, server-review coordination, and dialogs.
- `search-review.ts`: search-answer submission and review response handling.
- `account-client.ts`, `use-account-setup.ts`: activation requests, shared identity re-exports and recoverable contact/save state. The common identity transport now lives in `features/account`; saved-scout transport contracts live in `features/scouts`.
- `server/`: thin private API transport, bounded requests, HttpOnly cookies and Origin/CSRF checks.
- `steps/`: goal, focus, preferences, review, alerts, email, and verification forms.
- `components/`: shared form parts, live brief, illustration, digest example, and opportunity preview.
- `types.ts`: presentation view model and safe defaults.
- `stage-route.ts`: URL mapping and prerequisite checks.
- `fixtures.ts`: fictional examples and exact example seeds.
- `onboarding.css`: feature-prefixed styles, responsive layouts, focus treatment, and reduced motion support.

Review remains stateless. Identity creates or reuses a durable verified account, and activation atomically claims the approved draft and saves the scout, preferences, consent, retry receipt and unique initial-discovery outbox intent. Fictional opportunity fixtures remain clearly labelled. See [connected onboarding](../../../../docs/engineering/scoutalert-connected-onboarding.md) for guarantees and remaining discovery/delivery work.

## Manual verification

- Submit an empty brief, edit an example, and navigate backward without losing answers.
- Submit empty or malformed emails and empty or partial verification codes; confirm inline errors replace browser popups, focus the relevant field, and clear on editing. Check the required target and empty schedule fields the same way.
- Exercise all three categories and verify hourly versus project versus annual compensation units.
- Keep residence separate from hiring geography; review unknown eligibility and undisclosed compensation policies.
- Explore as a guest, filter examples, save/unsave, and exercise an empty shortlist.
- Check missing alert consent, invalid timezone, weekly scheduling, optional prompt alerts, and dashboard-only delivery.
- Stop the API and confirm review shows a retryable error without losing the local draft; restore the API and retry.
- Request an email code, find it in Mailpit, correct a wrong code, test resend timing and save a real scout.
- Reopen the route: retain the brief, clear typed code/remembered consent, restore server-authorized contact state and retrieve saved receipts safely.
- Move through steps, use browser Back and Forward, refresh a later step, and open a later step directly; confirm the URL and prerequisites select the expected screen.
- Verify keyboard access, Escape dismissal, visible focus, and layouts at desktop, phone, and 320-pixel widths.

Run web and shared UI lint/type checks, the repository architecture check, and a production web build alongside this browser pass.

Optional authorization countries, sponsorship needs and explicit confirmation are part of the reviewed brief. Residence never fills these answers. Prompt alerts require supported eligibility; unknowns remain reviewable according to the user’s choices.

## Expanded discovery handoff target

The confirmed goal will feed the [Scout Planner and adaptive discovery system](../../../../docs/architecture/scoutalert-discovery-architecture.md) through the existing durable activation intent. Those capabilities are not enabled by this documentation update. Users should not need to choose providers or supply a formal job title for a meaningful client/service goal.

The target handoff distinguishes saved, planning, searching, partial coverage and delayed/access-limited work; it does not wait for a worldwide crawl before showing the saved scout. Actual connected integrations and optional fictional examples remain clearly identified. ONB-030–031 in the [onboarding backlog](../../../../docs/user-stories/scoutalert-onboarding-user-stories-v0.1.md) define preserved intent and truthful status requirements. The current structured confirmation flow remains the implemented behavior until separately changed.
