# Deeper source discovery

Updated: 10 October 2026. The implemented access paths below extend discovery beyond indexed result links. They do not establish comprehensive internet coverage.

## Implemented path

A scout can read an observed public portal, extract an eligible GET search form, fill its query field with the frozen public search target, read the resulting page, and follow observed listing links. Private background, residence, pay requirements and account data never become form inputs. Jobs, contracts and service requests use the same discovery path; classification and personal-fit checks still decide whether a found page is demand worth recommending.

The document repository tries inexpensive HTML first. Thin executable shells and explicit JavaScript-required pages may use Chromium. Complete static listings and useful static directories avoid that extra cost. This detector is deliberately conservative; it will miss some mixed static/dynamic pages.

The browser uses a fresh sandboxed process and context. It has no user session, persistent cookies or credentials. Requests pass through the existing public-address/DNS-pinned HTTPS repository and readable robots policy. The initial response is reused. Writes, frame navigation, cross-origin data requests, socket connections, service workers, downloads and unsupported media are blocked. An unreachable proxy provides a fail-closed fallback for browser network traffic. The runtime is a starting point for local deployment; production browser workers also need infrastructure-level network isolation and memory/CPU controls.

## Budgets and evidence

- A document attempt covers one page bundle: robots, HTML and at most the remaining allowed rendering resources.
- Maximum bundle: 12 network attempts, 6 MB of successfully captured responses, counting the larger of wire and decoded bytes, 2 MB per resource, 25 seconds overall. Failed attempts still consume request allowance. Individual responses are streamed with byte limits.
- Per-origin requests within the bundle respect a minimum two-second gap and supported robots crawl delay. Browser resources are serialized. The coordinator continues to own cross-run admission and the main document host lease; cross-origin asset hosts are paced within a bundle, not globally across all worker processes.
- Chromium launch is bounded to five seconds and navigation/settling to eighteen seconds plus a short observation. Overall deadline closes the process. Chromium is installed separately from the npm dependency.
- Existing daily document allowance, global document concurrency, shared operation cache, maximum documents, planning rounds and depth still apply. A page bundle is one document reservation, **not** one HTTP request. Additional request/byte counts are saved with the capture.
- Source-site searches are durable decisions with an observed parent, source URL, depth and `search_source_site` reason. Submitted parameters are deterministic and revalidated against saved history.
- Captures retain retrieval method, request count, captured bytes, completeness, source text, observed links and supported search forms. Capture identity includes link/form/feed-advertisement changes and incomplete outcomes. The current document cache generation is `public-document-v6`; the initial rendering increment used v3, pagination v4 and feeds v5.
- Partial browser captures are marked `truncated`, cannot publish formal listings, cannot pass complete-evidence review, defer source monitoring, and make their discovery case partial. `complete` describes this bounded capture, not exhaustive site coverage.

## Supported forms and remaining work

Supported: same-origin public GET forms with one recognized query field and a small allowlist of fixed filters. The HTTP GET submission is reconstructed from observed controls; it does not type into arbitrary page widgets. Selected controls, POST searches, arbitrary custom widgets, logins, redirects beyond the checked public path below, cookie-dependent APIs, iframe listings, cross-origin data APIs and large application bundles still need appropriate access paths. No application, contact, purchase or authentication action is submitted.

Next increments include explicit site adapters for these unsupported paths, wider pagination/widget support, targeted browser interactions, discovery of new sources, multilingual query strategies, authorized account integrations, and an independent assessment of useful results gained per cost. These remain open; a functioning browser is not proof that we outperform a human researcher.

## Running and verifying

Install the pinned browser on each worker host:

```sh
pnpm --filter @repo/adapters exec playwright install chromium --only-shell
```

`SCOUT_WEB_RENDER_ENABLED=true` is the worker default. Set it to `false` for an explicitly HTML-only host; JS-dependent captures then record `browser_rendering_disabled` and stay incomplete. Missing Chromium also produces an explicit incomplete result.

Controlled browser verification (no external source, model, email or real account):

```sh
BROWSER_DISCOVERY_TEST=1 pnpm --filter worker exec vitest run test/deep-discovery.spec.ts --no-file-parallelism
```

The three demand-category fixtures compare empty static result links with the actual Chromium result, follow the observed form and discovered detail URL, and confirm that evidence is captured without treating it as a verified personal recommendation. Additional checks cover blocked writes/private destinations/frames, resource failures, private-intent exclusion, form constraints and bounded exploration. Database tests cover durable form decisions, reuse across owners, and partial capture reporting. Live-source observations are separate from these controlled tests.

## Local verification and activation

On 4 October, 82 focused checks passed: 22 durable-discovery database cases and 60 browser, source-monitoring and policy cases. Core/adapters/worker builds, web types and architecture checks passed. The local worker restarted at 04:57 WAT with all eight pools running, browser rendering enabled, document concurrency two and four documents per case. Existing spending limits were retained.

The [dated report](../../evaluations/discovery/deeper-source-discovery-2026-10-04.json) preserves both initial and corrected live observations. The public JavaScript demonstration rendered successfully; the tested Ashby portal remained incomplete. These checks do not establish wider portal coverage or new live recommendations.

## Portal API and pagination follow-up

The Ashby limitation in the initial report is now addressed for recognized public hosted board and detail URLs through the documented public API. Generic browser restrictions remain in force. See [the access policy, cache and navigation details](scoutalert-web-discovery.md#public-ashby-api-and-deeper-navigation--4-october).

Source pagination now follows observed next-page controls, including those inside navigation markup. Result signatures, canonical query ordering, page count, link depth, action count and the existing document budget bound expansion. A controlled durable case goes from a public form to first results, then a later page and a matching detail page, with each parent and action saved. A separate Gmail account-connection and requested label-import path was added on 5 October; it remains unconfigured for live access. See [private email connections](scoutalert-private-mail-connections.md). Other account sources and private matching remain open.

## Public RSS and Atom discovery — 10 October

Scouts can follow explicitly advertised RSS/Atom links in an HTML head, or read a feed URL already found by search. Feed destinations are observed, not guessed. The normal source repository now handles RSS 2.0 and Atom with the standard default namespace using the installed htmlparser2 XML parser. No provider-specific feed allowlist or new dependency was added. The format follows the [RSS specification](https://www.rssboard.org/rss-specification), [RSS autodiscovery specification](https://www.rssboard.org/rss-autodiscovery), and [Atom specification](https://www.rfc-editor.org/rfc/rfc4287).

Feeds are structurally classified as directories without reserving an AI call. A collection cannot become an opportunity, even if it contains only one job or a model attempts to label it as demand. Its entries supply titles and observed destination URLs; each linked page still needs its own access check, public demand review and private assessment. Feed descriptions, GUIDs, publisher timestamps, enclosures and tracking images never establish opportunity facts or trigger downloads.

The exploration planner follows the advertised feed and relevant entries under the frozen scout's existing document, depth and round ceilings. Same-origin observed next-feed-page links use existing pagination and repeated-result safeguards. Reviewed feeds enter the shared source-monitoring registry. New entries become probes, with current-revision subscriptions kept private. A valid empty feed stays eligible for monitoring. Feed build timestamps do not change capture identity by themselves; changed titles, destinations and window counts do.

### Bounds and limits

- Four head advertisements and 80 unique readable entry links per captured feed. Capture text and metadata report total and omitted entries. A successful bounded capture does not imply full archive coverage.
- Existing 2 MB response, 25-second page-bundle deadline, DNS/public-address admission, crawl policy, host pacing and durable spending limits apply. XML depth is capped at 24 and element count at 20,000 before DOM construction. DTD/entity declarations and incomplete nesting are rejected.
- Only public HTTPS destinations qualify. Credential query parameters, URL userinfo and non-HTTPS subscriptions are excluded from advertised feed/entry links. Atom selects HTML alternate links and honors observed `xml:base`; enclosure and self links are not substitutes for a listing.
- RSS 1.0/RDF, prefixed Atom roots, JSON Feed, private/token subscriptions, compressed or non-UTF-8 feeds, push subscriptions, conditional HTTP requests and full archive backfills remain open. Current polling shares the existing 30-minute operation window and adaptive monitor intervals; this is not a guaranteed alert-latency target.
- The existing monitoring frontier admits up to four children per capture, with its source-count/depth limits intact. Those operational bounds remain tuning parameters; this increment does not claim exhaustive source or internet coverage.

### Evidence and activation

100 focused checks pass: 75 unit/connector checks plus 25 PostgreSQL integration checks. Six optional browser-rendering checks were not enabled for this increment. The new feed tests cover advertised-link scope, RSS and Atom extraction, self/enclosure rejection, inherited bases, malformed XML, bounded windows, empty feeds, collection publication refusal, all three demand categories, two-owner reuse, zero AI reservations for directory recognition and a changed feed's durable child probes. Existing web-discovery persistence regressions also pass. Core/adapters/worker builds, API types and architecture checks pass.

The normal local PostgreSQL service was stopped, so integration checks ran against a temporary PostgreSQL instance containing only synthetic fixtures. No SMTP transport, real account or paid model/search provider was used. No worker was restarted and no new live subscription was inserted during this increment; the compiled code is picked up on the next worker start. No migration or spending-limit change is required.

The [live feed receipt](../../evaluations/discovery/feed-access-2026-10-10.json) records a permitted read of [We Work Remotely's documented feed](https://weworkremotely.com/remote-job-rss-feed): 89 entries observed, 80 retained links, nine omitted, and one linked page successfully read. Four HTTP requests, including robots reads, took 6.639 seconds. The feed was not promoted as an opportunity. No AI assessment, personal match, email, independent relevance score or production-scale claim follows from this access check.

```sh
pnpm --filter worker exec vitest run test/feed-discovery.spec.ts
WEB_DISCOVERY_INTEGRATION=1 pnpm --filter worker exec vitest run test/feed-discovery.integration.spec.ts --no-file-parallelism --hookTimeout=30000
node scripts/evaluation/check-feed-discovery.mjs --write
```

`FEED_TEST_DATABASE_URL` can point the feed integration suite at an isolated PostgreSQL instance; it still uses only `scoutalert_test` and a random disposable schema. The live diagnostic loads no application secrets and writes only the dated receipt when requested. Its maximum two document reads are separate from the worker's daily ledger.

## Contextual candidate selection — 10 October

New model-planned cases freeze `exploration.candidatePolicy: contextual-v1`. Historical saved plans without this field keep the earlier action menu. The planner retains up to four keyword-priority document choices, then fills a maximum ten-document menu from observed results and anchors, even without literal target words. Additional choices are deduplicated and balanced across hosts and originating queries/pages. Incidental “sign in” or privacy wording in a job snippet no longer discards the whole lead. Original-source closed/discussion/seller verdicts, access failures, visited URLs, depth, document counts and round ceilings still constrain admission. Excerpt verdicts remain tentative.

Each offered document carries up to 1,200 characters of public context and its query or parent URL. Parent context is explicitly not evidence about an unread child. The existing selector compares related role wording, deliverables and language variants, and may inspect, search again or stop. It can select only a supplied action; it cannot invent a URL, change mandatory requirements or publish a recommendation. There is no new model call per lead, although the larger input adds tokens. The provider configuration is `scout-planning-v3`. Unavailable or invalid model output uses the conservative deterministic planner.

Matching combines existing full-text retrieval with up to eight fresh, source-reviewed postings discovered for this exact owner, active scout and revision within the last day. The review must reference the current document fingerprint and posting version. Hidden, closed, stale, excerpt-only and outdated-scout findings cannot enter through this path. These candidates receive priority within the existing 200-result retrieval cap and still pass separate private assessment. No shared semantic index or broad cross-scout semantic retrieval was introduced.

### Verification and limits

The [paired development report](../../evaluations/discovery/candidate-selection-2026-10-10.json) compares identical observed results and the same current model prompt: the expected source was offered in 1/5 positive cases before and 5/5 after; expected single-step routing was 2/6 before and 6/6 after. Twelve model requests cost an estimated $0.010219 against a separately bounded $0.90 diagnostic allowance. Two cases use previously captured public jobs and four are synthetic. These implementation-authored expectations are not independent relevance judgments or proof of whole-pipeline recall.

The [live feed pipeline receipt](../../evaluations/discovery/feed-pipeline-2026-10-10.json) extends the earlier access check: a documented feed was seeded as a synthetic search observation, captured once, recognized as a directory with zero AI requests, reused by two synthetic owners and registered as one directory monitor plus four child probes. The real HTTP capture took two requests; the complete isolated-database diagnostic took 4.089 seconds. It did not fetch the probes, run personal assessment, deliver mail or exercise a running account worker.

84 focused unit checks and 27 database checks pass. Unit checks cover contextual inclusion, diversity, source/excerpt verdicts, budgets, unavailable-model fallback and private-data exclusion. Database checks cover recorded action validation, replay and the differently worded posting reaching a separate private assessment, plus owner, version, fingerprint, freshness and hidden-feedback exclusions. The exact test commands and receipts are recorded in the [evaluation protocol](../../evaluations/discovery/README.md#contextual-routing-and-live-feed-persistence--10-october).

The [local retrieval measurement](../../evaluations/discovery/contextual-retrieval-load-2026-10-10.json) made 240 queries over 50,000 synthetic postings. With eight reviewed discoveries prioritized, p95 was 46.66 ms at concurrency eight, versus 40.04 ms with no admitted discovery IDs. Both use the current repository, with one scout and eight review records; this is not production-capacity or large-history evidence.

This increment is built locally. The normal ScoutAlert database was stopped during verification; the account worker was not restarted. SMTP configuration was not changed and no emails were sent. Independent quality evaluation, semantic retrieval across the wider corpus, multilingual query generation, large/cross-origin sitemap coverage and deployment-scale proof remain open.

### Local activation — 10 October

Following the user's request to run it, the existing PostgreSQL and Mailpit containers were started, checked-in migrations completed, and the rebuilt API, worker and local web preview were launched. All nine worker pools entered `RUNNING`; the dashboard, API and Mailpit returned HTTP 200. Existing Redis/Temporal services, email configuration and user-set spending limits were retained.

The [activation receipt](../../evaluations/discovery/contextual-activation-2026-10-10.json) records live cases using `contextual-v1` and completed model choices with candidate context. One startup activity deadlocked during catch-up, then retried through Temporal and proceeded. Source access failures leave affected cases partial with `some_sources_unavailable`; startup success does not establish complete source coverage, new useful matches or independent quality. This supersedes the pre-activation runtime note above.

## Advertised sitemaps and checked redirects — 10 October

The public page session reads up to four unique same-origin `Sitemap:` destinations from the robots policy it already fetched. This uses the installed robots-parser API without another network or AI request. It does not guess sitemap paths. A denied page can still expose a permitted sitemap advertised by that policy, but every destination receives its own robots and pinned public-address checks. Unreadable policy, authentication refusal, HTTP access denial and rate limiting continue to stop same-host exploration; page-specific format, missing-page and crawl-path failures do not automatically condemn all other observed paths.

The source repository recognizes `urlset` and `sitemapindex` XML, including namespace prefixes, before feed parsing. A sitemap index can lead to another sitemap and then a detail page under existing depth, document and round limits. Only absolute public HTTPS links on the captured sitemap's origin enter the retained window. Credential-bearing URLs, extension elements impersonating sitemap fields and duplicate destinations are excluded. The [sitemap protocol](https://www.sitemaps.org/protocol.html) also supports cross-site submission; that ownership/access path is not implemented here. The current same-origin path is an explicit subset, not exhaustive protocol coverage.

The parser retains 80 links, prioritizing likely opportunity paths before generic paths. Total and omitted entry counts stay visible in the capture. Path wording is only a routing heuristic: filters and directories can resemble listing paths, and neither a URL nor `lastmod` establishes an open opportunity. Publisher dates/priority changes alone do not change capture identity. Empty valid sitemaps remain monitorable. Inherited robots advertisements are not expanded again from a sitemap monitor, preventing upward sitemap loops. Existing four-child-per-capture, monitor depth and per-scout subscription limits remain in force.

Feeds and sitemaps share deterministic collection review. This reserves no AI request and leaves every opportunity fact unknown. Collections cannot become postings. Separate child captures, source reviews and personal assessments still control recommendations. Shared public work and private subscriptions reuse the existing repositories; no new datasource access was introduced in services.

XML remains bounded to 2 MB, 20,000 elements and depth 24. Entity/DTD declarations, malformed nesting and unsupported declared character encodings fail explicitly. Gzip transport and gzip files use Node's asynchronous decompression with `maxOutputLength`; both wire and decoded sizes are capped. A resource too large for this capture remains a coverage gap. Large streaming sitemap ingestion, resumable windows and non-XML sitemap formats remain open.

Public document redirects follow at most three observed HTTPS hops. Every hop is checked and paced, consumes the same 12-request/6-MB/25-second bundle, and never propagates credentials or cookies. The requested URL remains the durable identity; `retrievedUrl` records the final permitted URL used to resolve links and parse the page. Redirect loops, invalid destinations and exhausted hop limits are separate failures. Robots-policy redirects and arbitrary authenticated/browser redirects remain unsupported.

Source outcomes now distinguish authentication required, refused access, missing page, rate limiting, temporary server error, unsupported media, compression failure and redirect failure. The owner-scoped lead read exposes a bounded `contentReason`; lead details and monitored-source rows translate known reasons into plain language. A missing page does not by itself mark an opportunity closed. Structural collection reviews are labeled “Source review,” without claiming model inference.

### Verification and measured limits

125 focused unit checks and 37 database checks pass across the affected discovery paths (six browser checks remain opt-in). The final sitemap suite covers 27 cases. The feed/sitemap database suite exercises board → index → sitemap → listing, parent provenance, replay/shared reuse for two synthetic owners, zero-call collection review, monitor enrollment and newly observed children remaining unpublished until their own review. Core, adapters, API and worker builds, web types and architecture checks passed.

The [initial live receipt](../../evaluations/discovery/sitemap-discovery-2026-10-10.json) and [final reader receipt](../../evaluations/discovery/sitemap-discovery-prioritized-2026-10-10.json) use an explicitly seeded We Work Remotely homepage. The latter parsed 332 sitemap entries and retained 80, including 78 URLs absent from the homepage's bounded 80-link capture. Three documents required six HTTP requests, 794,305 accounted bytes and 14.470 seconds, with zero AI or paid-search calls. The followed destination was a salary filter directory, not a verified job. This demonstrates access and additional routes, not useful-match yield, recall against Google, organic scout discovery or global scale.

The normal ESLint command ignores TypeScript files in the current shared configuration; forcing TS extensions exposes existing TypeScript/TSX parser/rule incompatibilities. Lint is not reported as passing. TypeScript and architecture checks cover the edited source; correcting the shared lint configuration remains separate work.

### Sitemap activation

The rebuilt API and worker restarted locally at 03:44 WAT on 10 October. All nine pools entered `RUNNING`; web, API and Mailpit returned HTTP 200. The [startup receipt](../../evaluations/discovery/sitemap-activation-2026-10-10.json) recorded one completed account-worker document capture containing an advertised sitemap, zero captured sitemap documents yet, and zero activity failures during the initial 52-second window. Existing budgets, Temporal schedules and Mailpit settings were retained. This enables the new path for normal scheduled admissions; it does not claim that a saved scout has already completed a sitemap-to-recommendation cycle.

## Client-request capture repair — 12 October

Public Freelancer project pages now use a provider-specific parser for their server-rendered buyer brief. It requires a matching canonical project URL, one primary layout, title/status, project ID, description, and complete section markup. The capture includes the buyer's budget, stated skills and remote/open status; bids, bidder profiles and related listings remain outside assessment text. Related links remain available separately for navigation. Unsupported layouts, hidden primary sections and oversized briefs remain incomplete. The source's robots policy, network limits and 25-second bundle deadline still apply.

A complete primary brief keeps the HTTP path even when optional scripts would fail. `<noscript>` fallback messages no longer force otherwise readable HTML into browser rendering. Actual browser failures are still incomplete; non-empty rendered text never overrides a failed resource check. An explicit sign-in requirement for full RFP/brief details now returns `source_details_require_sign_in`. Ordinary sign-in-to-apply instructions do not hide a public brief. This English gate detector is a bounded capability, not a universal authentication detector.

New document operations use shared `public-document-v7` identities across fixed discovery, adaptive discovery and monitoring; capture fingerprints use `public-capture-v7`. Old captures remain historical evidence. The optional `capture.scope=buyer_brief` and parser version identify the selected text. Formal job metadata cannot bypass buyer review. Existing runs are not force-replayed, and no account backfill is implied.

The recapture exposed a separate review error: a model could label “Ends in 6 days” as a stated deadline, either preserving an unparseable counter or inventing an ISO date. After citation validation, the core review policy now normalizes recognized relative closing counters to an unknown absolute deadline. Explicit calendar evidence, conflicting dates and closed labels remain authoritative; this does not infer a deadline or extend availability. Relative text remains visible in the source capture. `deadline-evidence-v1` versions review reuse, and a policy change refreezes the current review round without erasing old attempts or resetting budgets.

The dashboard labels incomplete fetched pages as **Partial capture · More evidence needed**, keeps the clock indicator, and explains sign-in gates or extraction failures in plain language. It does not present a partial source as ready for personal matching.

### Evidence and remaining limits

The [capture comparison and assessment receipt](../../evaluations/discovery/client-request-capture-summary-2026-10-12.json) retains all three diagnostic runs, including the initial publication failure. Two previously incomplete marketplace pages became complete HTTP buyer captures, each using two requests instead of five. Four tender summaries remain gated, including one earlier incorrectly considered complete. Those four cannot enter personal matching.

In the final seeded run, the current planner recaptured the original website request and followed an observed related website-design request. Both entered personal assessment; one became a reviewable dashboard-repository result and one grouped message was captured in local Mailpit, with no retry duplicate. The original request was rejected against the synthetic redesign brief. The model also treated INR versus the brief's default USD as a conflict despite no minimum pay: fit interpretation remains a separate quality issue. The accepted result retains unresolved eligibility and experience. This demonstrates repaired capture and downstream execution, not independently verified relevance or broad discovery recall.

91 capture/review/persistence checks and nine actual-Chromium checks pass. The browser checks require permission for Chromium to launch and use intercepted fixture requests. Core/adapters/worker compilation, API/web types, touched web lint and architecture checks pass. The three live diagnostics used no paid search calls and an estimated $0.081693 of AI usage; admission reservations are larger and are not invoices. Full tender access, unsupported marketplace layouts and independent match-quality evaluation remain open.

## Broader buyer-source discovery — 15 October

New cases freeze `client-demand-v6`. The initial portfolio covers PeoplePerHour buyer pages, Workana project pages, public RFPs and project-board demand. Workana uses an undated index query because the same public buyer pages disappear under the monthly filter. Coherent targets up to three words retain their exact phrase rather than quoting each word separately; the live Workana index returned buyer pages for “website redesign” that were absent for independently quoted words. Other families keep the monthly window. This changes discovery recall, not availability: current source evidence, deadlines and private requirements still govern publication and matching. Frozen v1–v5 query portfolios remain reproducible.

PeoplePerHour now has a primary buyer parser (`peopleperhour-public-html-v2`) that checks canonical project identity, visible/closed markup, title, project ID, status, experience level and description. Bidder profiles and clarification questions stay outside assessment text. Countdown labels retain their units in one passage (“Ends in 28 days”); `lead-evidence-v5` leaves their absolute deadline unknown. Closed and canceled pages preserve their negative evidence. `deadline-evidence-v2` canonicalizes both stated and unknown relative-counter outputs to an empty unknown date only when their quotations are source-supported. Calendar evidence, conflicts and fabricated quotations remain unchanged for validation; this avoids rejecting a valid brief merely because the model attached a genuine counter quote to an unknown date. Extraction treats a buyer’s customer market separately from contractor-location restrictions. Source passage construction joins isolated short labels to adjacent text using exact original offsets, preventing a two-letter country-code citation from invalidating an otherwise supported assessment; private brief values remain unchanged. Fit policy `evidence-prompts-v9` preserves unknown eligibility and mandatory remote constraints. Shared markup checks also serve the existing Freelancer parser. New captures use `public-document-v9` / `public-capture-v9` identities.

Only parser-confirmed or source-reviewed collections contribute nearby text to unread child links. An unreviewed or failed-review RFP cannot turn its author, category or navigation links into buyer requests. Planner policy `scout-planning-v13` also encourages relevant source variety while retaining semantic relevance and finite read limits.

Permitted crawl delays up to 30 seconds now fit a 45-second complete source bundle, 60-second discovery/monitoring activity and 75-second shared document/host lease. Queued resources still obey source spacing, robots denials, pinned public DNS, 12-request and 6-MB bundle limits. Longer delays remain explicit access limitations. The live Achievement First RFP now reads successfully after a measured 30-second wait; the Dayton notice reads after 20 seconds and explicitly reports the listing removed. Neither search indexing nor a successful HTTP response proves an opportunity is still open.

The local Playwright 1.61.1 installation was missing its matching browser binary. The supported headless Chromium runtime was installed with `pnpm --filter @repo/adapters exec playwright install chromium --only-shell`. Repeat this installation after upgrading Playwright on a host that uses browser discovery. It does not authenticate to sources or change denied access into permission.

See the [source-expansion evaluation](../../evaluations/discovery/README.md#source-expansion-beyond-freelancer--15-october) for live outcomes, source-specific access limits, and activation evidence.

## Supported PDF and public-post access — 15 October

New cases use `client-demand-v7`: PeoplePerHour, Workana, public RFPs and an explicit PDF RFP query are initial families; observed Bluesky post discovery is an alternative family. Earlier frozen policies remain unchanged. This adds discovery routes without treating search excerpts as source evidence.

The public HTTP transport preserves PDF bytes, including bounded gzip decoding, while retaining pinned public DNS, robots enforcement, redirects, pacing and aggregate download limits. PDF.js 6.4.299 extracts ordered page text and observed annotation links in a disposable Node worker. The parser has an eight-second deadline, 96-MB V8 old-generation limit, 50-page ceiling and 64,000-character ceiling. Password-protected, malformed, scanned/empty-page and oversized documents remain incomplete with explicit owner-facing reasons. This is text extraction, not OCR. It does not execute PDF scripts or fetch embedded/linked resources. The worker clears inherited Node CLI flags, fixing a failure exposed by the inline live audit.

`BlueskySourceDocumentRepository` reads exact observed `bsky.app` post URLs through the documented unauthenticated `app.bsky.feed.getPostThread` endpoint. It verifies the returned author and post identity, honors restrictive labels, preserves the author's text/date and records public API provenance. External cards contribute only their destination; preview copy cannot become author evidence. Replies, quote/image embeds, missing posts and identity mismatches remain incomplete. The live unauthenticated search endpoint returned 403, so no native Bluesky search coverage is claimed. The reader is injected into the worker's existing router and uses ordinary document admission; shared captures now use `public-document-v10` and `public-capture-v10`.

Upwork website reads stop before robots/content requests, including redirects and browser resources, and report `upwork_api_access_required`. This reflects its approved API access route; no login/cookie or anti-bot workaround is included. Guru's robots denial and Facebook/LinkedIn access restrictions remain visible. See the [provider access guide](scoutalert-provider-access.md) for application steps and the commercial-use limitation in Upwork's standard program.

A model outage exposed a separate planning stall: a conservative fallback selected a duplicated URL with different parent/title provenance from the contextual action menu. Persistence rejected that decision repeatedly. The planner now maps the fallback action to the current admitted menu entry, retaining its exact provenance and bounds. A regression covers the duplicate-URL mismatch; complete project and service fixture flows also finish with an unavailable planning provider, valid filtering, owner isolation and one local digest each without duplicates.

The final live checks explicitly disabled planning, review and matching calls after the provider exhausted credits. They verify capture only. Fresh AI interpretation and useful recommendation yield remain unverified; the evaluation receipts keep this limitation separate from successful source access.
