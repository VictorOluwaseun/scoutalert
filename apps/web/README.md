# ScoutAlert web

The product interface uses Next.js, React, Tailwind CSS, and the shared UI package. The first implemented experience is an onboarding experience with connected review, identity and scout saving at `/` and `/onboarding`.

## Development

From the repository root:

```sh
pnpm --filter web dev
```

Open [localhost:3030/onboarding](http://localhost:3030/onboarding). This starts only the web app. The root URL redirects to onboarding, and step URLs preserve browser Back and Forward navigation.

For connected onboarding, start the web and API hosts together with `pnpm dev:start`. The API dev command builds core and adapters before starting. Run `pnpm --filter api db:migrate` first. Match the private `WEB_API_SECRET` between `apps/api/.env` and `apps/web/.env.local`. The web route uses `http://127.0.0.1:4040` in development; set `SCOUTALERT_API_URL` for another API origin or in production.

```sh
pnpm --filter web lint
pnpm --filter web check-types
pnpm --filter web build
```

## Onboarding

Presentation components, the draft view model, fixtures, and browser draft recovery live in `features/onboarding`. Reusable visual primitives live in `packages/ui`; route entry points remain in `app`.

Email/code screens use real Mailpit codes; sessions stay in HttpOnly cookies. Scout saving, limited Greenhouse discovery and scheduled Mailpit digests are connected. Results identify their sources and unresolved fit criteria.

The completion action opens [the dashboard](http://localhost:3030/dashboard), which server-renders account-owned scouts, confirmed briefs, alert choices, current discovery status and real opportunity evidence. Returning users can use `/sign-in` without repeating onboarding. The optional `/dashboard/examples` preview remains fictional. Read [the dashboard notes](features/scouts/README.md) for ownership, paging and UI boundaries.

Read [the onboarding notes](features/onboarding/README.md) for the flow, preview boundaries, and verification checklist.
