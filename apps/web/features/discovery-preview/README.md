# Discovery experience preview

Open [`/preview/discovery`](http://localhost:3030/preview/discovery) with the web app running. This is a public, fictional design preview of the broader discovery experience. It does not read accounts, execute searches, call models, send email or mutate real scouts. The connected dashboard remains at `/dashboard`.

## Review flow

- **Discoveries:** opportunities first, with category filters, sample scout status and source coverage alongside them. Includes a company job listing, an X-style client request and a LinkedIn-style contract request. These are invented examples, not actual posts or claims that those integrations are connected.
- **Scout detail:** `/preview/discovery/scouts/design-role` and `/preview/discovery/scouts/client-projects` show discoveries, understandable search activity, a confirmed brief and alert preferences. Pause/resume changes only temporary preview state.
- **Opportunity detail:** `/preview/discovery/opportunities/olive-website` and the other sample routes show fit, unresolved criteria, supporting passages, discovery/check times and a suggested next step. Source actions stay within the fictional example.
- Source and save actions appear together below the opportunity heading; mobile stacks these controls before evidence so the next action is available early.
- **Saved:** `/preview/discovery/saved` retains sample selections while navigating within the preview. Hiding excludes a result from both lists; restoring keeps its previous saved selection. Relevant feedback is also temporary.

Use **Preview state** to switch between opportunities found, first search running, no suitable results, limited coverage and an interrupted search. A limited or interrupted search preserves earlier finds. None of the states implies comprehensive coverage of the internet or verified eligibility.

The layout provider holds state in memory. Refreshing or leaving the preview resets it. Real URL routes support deep links and browser Back/Forward; filtering and scout view selection are local UI state. Unknown sample IDs return 404.

## Implementation boundary

Route entry points remain server components; interactive presentation lives here. Preview fixtures are not domain records or API responses. Before connecting this design to production, define read models for source provenance, informal leads, evidence freshness, discovery activity and coverage. Replace sample state with account-owned API data and existing guarded mutations; do not copy fixture assumptions into matching or notification policy.

The stylesheet is scoped to `.discovery-preview` and `dp-` classes. It keeps Manrope, light surfaces and citron accents, visible keyboard focus, legible supporting text and responsive layouts. No new packages are required.

## Verification

Run `pnpm --filter web check-types`, `pnpm --filter web lint` and `pnpm run check:architecture`. Browser review should cover route navigation, all five scenarios, category filtering, saved persistence between routes, feedback, hide/restore, pause/resume and the three scout views. Inspect desktop, tablet and mobile layouts and verify that source examples remain clearly fictional.
