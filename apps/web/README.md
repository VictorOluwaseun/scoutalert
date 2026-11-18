# ScoutAlert web

The product interface uses Next.js, React, Tailwind CSS, and the shared UI package. Visiting `/` redirects directly to `/onboarding`, where connected review, identity and scout saving begin. There is no separate introduction step before onboarding.

## Development

From the repository root:

```sh
pnpm --filter web dev
```

Open [localhost:3030](http://localhost:3030). This starts only the web app. The root URL redirects directly to onboarding, and onboarding step URLs preserve browser Back and Forward navigation.

For connected onboarding, start the web and API hosts together with `pnpm dev:start`. The API dev command builds core and adapters before starting. Run `pnpm --filter api db:migrate` first. Match the private `WEB_API_SECRET` between `apps/api/.env` and `apps/web/.env.local`. The web route uses `http://127.0.0.1:4040` in development; set `SCOUTALERT_API_URL` for another API origin or in production.

```sh
pnpm --filter web lint
pnpm --filter web check-types
pnpm --filter web build
```

## Search and sharing

`features/seo/site.ts` is the public identity for `https://scoutalert.app`. It is
independent of the API origin and local session origin. The onboarding entry has
a canonical URL, Open Graph and Twitter metadata, and Organization/WebSite JSON-LD.
`/opengraph-image` serves a generated sharing card. SEO must preserve the direct
entry into the existing goal form. The original website-only launch mode still
shows the beta preview when explicitly enabled.

The root layout defaults to `noindex, nofollow`; `/onboarding` opts into indexing
with `/onboarding` as its canonical URL. Query URLs with `step`, `new`, or `scout`
remain excluded, as do sign-in, account pages, and design previews. New public
content pages must explicitly opt in, set their own canonical
URL, and be added to `app/sitemap.ts`. Do not add fictional opportunities as
JobPosting structured data or sitemap entries.

`/robots.txt` advertises `/sitemap.xml` and blocks API crawling. Page routes remain
crawlable so search engines can read their `noindex` directives; those directives
do not replace authentication. The sitemap includes only `/onboarding`, without invented
modification dates.

Against a running web release, check the root redirect and SEO route policy with:

```sh
SCOUTALERT_WEB_ORIGIN=http://localhost:3030 node scripts/check-web-entry.mjs
```

Also verify in a fresh browser session that `/` opens the goal form directly and
that advancing and browser Back preserve the original onboarding behavior.

After deploying, verify the homepage, sitemap, robots file, and sharing image on
the public domain. Submit `https://scoutalert.app/sitemap.xml` in the domain's
verified Google Search Console property and inspect `/onboarding`. Search
Console ownership and submission are separate from the repository changes.

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
