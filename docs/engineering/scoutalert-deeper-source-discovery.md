# Deeper source discovery

Updated: 10 October 2026. The implemented access paths below extend discovery beyond indexed result links. They do not establish comprehensive internet coverage.

## Implemented path

A scout can read an observed public portal, extract an eligible GET search form, fill its query field with the frozen public search target, read the resulting page, and follow observed listing links. Private background, residence, pay requirements and account data never become form inputs. Jobs, contracts and service requests use the same discovery path; classification and personal-fit checks still decide whether a found page is demand worth recommending.

The document repository tries inexpensive HTML first. Thin executable shells and explicit JavaScript-required pages may use Chromium. Complete static listings and useful static directories avoid that extra cost. This detector is deliberately conservative; it will miss some mixed static/dynamic pages.

The browser uses a fresh sandboxed process and context. It has no user session, persistent cookies or credentials. Requests pass through the existing public-address/DNS-pinned HTTPS repository and readable robots policy. The initial response is reused. Writes, frame navigation, cross-origin data requests, socket connections, service workers, downloads and unsupported media are blocked. An unreachable proxy provides a fail-closed fallback for browser network traffic. The runtime is a starting point for local deployment; production browser workers also need infrastructure-level network isolation and memory/CPU controls.

## Budgets and evidence

- A document attempt covers one page bundle: robots, HTML and at most the remaining allowed rendering resources.
- Maximum bundle: 12 network attempts, 6 MB of successfully captured UTF-8 response bodies, 2 MB per resource, 25 seconds overall. Failed attempts still consume request allowance. Individual responses are streamed with byte limits.
- Per-origin requests within the bundle respect a minimum two-second gap and supported robots crawl delay. Browser resources are serialized. The coordinator continues to own cross-run admission and the main document host lease; cross-origin asset hosts are paced within a bundle, not globally across all worker processes.
- Chromium launch is bounded to five seconds and navigation/settling to eighteen seconds plus a short observation. Overall deadline closes the process. Chromium is installed separately from the npm dependency.
- Existing daily document allowance, global document concurrency, shared operation cache, maximum documents, planning rounds and depth still apply. A page bundle is one document reservation, **not** one HTTP request. Additional request/byte counts are saved with the capture.
- Source-site searches are durable decisions with an observed parent, source URL, depth and `search_source_site` reason. Submitted parameters are deterministic and revalidated against saved history.
- Captures retain retrieval method, request count, captured bytes, completeness, source text, observed links and supported search forms. Capture identity includes link/form/feed-advertisement changes and incomplete outcomes. The current document cache generation is `public-document-v5`; the initial rendering increment used v3 and pagination used v4.
- Partial browser captures are marked `truncated`, cannot publish formal listings, cannot pass complete-evidence review, defer source monitoring, and make their discovery case partial. `complete` describes this bounded capture, not exhaustive site coverage.

## Supported forms and remaining work

Supported: same-origin public GET forms with one recognized query field and a small allowlist of fixed filters. The HTTP GET submission is reconstructed from observed controls; it does not type into arbitrary page widgets. Selected controls, POST searches, arbitrary custom widgets, logins, redirects, cookie-dependent APIs, iframe listings, cross-origin data APIs and large application bundles still need appropriate access paths. No application, contact, purchase or authentication action is submitted.

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
