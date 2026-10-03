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

Email/code screens use real Mailpit codes; sessions stay in HttpOnly cookies. Scout saving, configured Greenhouse/Freelancer discovery and scheduled Mailpit digests are connected. Results identify their sources and unresolved fit criteria.

The completion action opens [the dashboard](http://localhost:3030/dashboard), which server-renders account-owned scouts, confirmed briefs, alert choices, current discovery status and real opportunity evidence. Returning users can use `/sign-in` without repeating onboarding. The optional `/dashboard/examples` preview remains fictional. Read [the dashboard notes](features/scouts/README.md) for ownership, paging and UI boundaries.

Read [the onboarding notes](features/onboarding/README.md) for the flow, preview boundaries, and verification checklist.

## Discovery experience target

The [platform requirements](../../docs/prd/scoutalert-platform-prd.md) now make broad web/social search, informal opportunity leads and continuing source expansion explicit. The [roadmap](../../docs/engineering/scoutalert-delivery-roadmap.md) distinguishes those targets from the connected local product.

Future screens must explain actual search progress, provisional versus verified findings, meaningful coverage gaps and source freshness. Users describe goals without configuring a closed website list. Good indexed results do not imply that external exploration stopped, and an empty bounded scan cannot claim there is no work anywhere. Keep implementation details behind plain product language and preserve the selected light Ink + citron visual direction.

Provider or agent additions require transport/read-model work before the UI can present them as live. Web code continues to call server/API contracts rather than importing core repositories, adapters or workflow clients.

The interactive [discovery design preview](http://localhost:3030/preview/discovery) now covers discoveries, scout detail and opportunity detail in the light Ink + citron style. It uses fictional examples and temporary interactions; the account dashboard remains connected to real data. Read [the preview notes](features/discovery-preview/README.md) for routes, search states and the integration boundary.
## Connected web discovery

`/dashboard/discovery` reads authenticated activity and provisional web leads through the API. It shows provenance, search excerpts, captured text and explicit access/budget states. It never imports the fictional `/preview/discovery` fixtures. Live provider access remains gated on local worker configuration; see the [implementation notes](../../docs/engineering/scoutalert-web-discovery.md).
