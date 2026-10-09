import { describe, expect, it } from "vitest";
import {
  BrowserDocumentRepository,
  PublicSourceDocumentRepository,
  PublicHttpRepository,
  documentSearchForms,
  documentLinks,
  needsBrowser,
  reviewInput,
} from "@repo/adapters/discovery";
import {
  planDiscovery,
  planExploration,
  type DiscoveryExploration,
  type SourceDocumentResult,
} from "@repo/core/discovery";
import type { SearchDraft } from "@repo/core/onboarding";

const origin = "https://opportunities.example.com";
const form =
  '<h1>Find opportunities</h1><form action="/search" method="get"><input type="search" name="q"><input type="hidden" name="remote" value="true"><button>Search</button></form>';

/** Supplies public fixtures through the real repository/browser boundary; external network and paid providers are absent. */
class FixtureHttpRepository extends PublicHttpRepository {
  readonly urls: string[] = [];
  /** Receives frozen response bodies keyed by public URL. */
  constructor(
    private readonly pages: Record<
      string,
      { body: string; contentType: string }
    >,
  ) {
    super();
  }
  /** Records requests and rejects any unplanned resource; robots are deliberately permissive for these controlled fixtures. */
  override async read(url: string, maximumBytes: number, signal: AbortSignal) {
    signal.throwIfAborted();
    this.urls.push(url);
    if (new URL(url).pathname === "/robots.txt") {
      return { status: 404, contentType: "text/plain", body: "" };
    }
    const response = this.pages[url];
    if (!response || Buffer.byteLength(response.body) > maximumBytes) {
      throw new Error("unexpected_fixture_request");
    }
    return { status: 200, ...response };
  }
}

/** Adds source captures as the real planner sees them, retaining depth and parent identities. */
function record(
  state: DiscoveryExploration,
  result: SourceDocumentResult,
  depth: number,
): void {
  state.operations.push({
    key: result.url,
    depth,
    input: { kind: "document", url: result.url },
    result,
  });
}

/** Creates an adaptive plan with private fields that must never appear in a source-site request. */
function state(category: SearchDraft["category"]): DiscoveryExploration {
  return {
    round: 0,
    operations: [],
    plan: planDiscovery(
      {
        target: "Product designer",
        category,
        arrangement: "remote",
        goal: "PRIVATE GOAL",
        residence: "PRIVATE ADDRESS",
        background: "PRIVATE EXPERIENCE",
        minimumPay: "PRIVATE PAY",
      } as SearchDraft,
      1,
      4,
      undefined,
      true,
    ),
  };
}

describe("observed public site searches", () => {
  it("accepts a public GET search and excludes account, cross-origin, POST, token and ambiguous forms", () => {
    expect(documentSearchForms(form, origin)).toEqual([
      {
        action: `${origin}/search`,
        field: "q",
        parameters: [["remote", "true"]],
      },
    ]);
    for (const html of [
      form.replace('method="get"', 'method="post"'),
      form.replace("/search", "https://other.example.com/search"),
      form.replace("/search", "/login"),
      form.replace('name="remote"', 'name="csrf_token"'),
      form.replace("</form>", '<input name="query"></form>'),
      form.replace("<form ", "<form hidden "),
      form.replace("</form>", '<input type="password" name="password"></form>'),
    ]) {
      expect(documentSearchForms(html, origin)).toEqual([]);
    }
  });

  it("freezes only public intent into observed forms and respects the existing depth/document ceilings", () => {
    const snapshot = state("services");
    const page: SourceDocumentResult = {
      kind: "document",
      url: `${origin}/projects`,
      status: "fetched",
      text: "Find opportunities",
      checkedAt: new Date().toISOString(),
      fingerprint: "fixture",
      posting: null,
      reason: null,
      hostDelaySeconds: 2,
      searchForms: documentSearchForms(form, origin),
    };
    record(snapshot, page, 0);
    expect(planExploration(snapshot)).toMatchObject({
      reason: "search_source_site",
      parentKey: page.url,
      depth: 1,
      action: { url: `${origin}/search?q=Product+designer&remote=true` },
    });
    expect(JSON.stringify(planExploration(snapshot))).not.toContain("PRIVATE");
    snapshot.operations[0]!.depth = 2;
    expect(planExploration(snapshot).action).toBeNull();
    snapshot.operations[0]!.depth = 0;
    snapshot.plan.maximumDocuments = 1;
    expect(planExploration(snapshot).action).toBeNull();
  });

  it("keeps complete static content on the fast path", () => {
    const html =
      '<h1>Current jobs</h1><a href="/jobs/1">Product designer</a><a href="/jobs/2">Engineer</a><script src="/analytics.js"></script>';
    expect(
      needsBrowser(html, "Current jobs Product designer Engineer", origin),
    ).toBe(false);
    expect(
      needsBrowser(
        '<div id="root">Loading</div><script src="/app.js"></script>',
        "Loading",
        origin,
      ),
    ).toBe(true);
    expect(
      needsBrowser(
        '<a href="/login">Login</a><a href="/page/2">Next</a><script src="/app.js"></script>',
        "Login Next",
        origin,
      ),
    ).toBe(true);
  });
});

const browserTests =
  process.env.BROWSER_DISCOVERY_TEST === "1" ? describe : describe.skip;
browserTests("actual Chromium deeper discovery", () => {
  it.each(["employment", "contracts", "services"] as const)(
    "finds %s demand via a public form, JavaScript results and a linked detail page",
    async (category) => {
      const searchUrl = `${origin}/search?q=Product+designer&remote=true`;
      const detailUrl = `${origin}/projects/42`;
      const title =
        category === "employment"
          ? "Product designer opening"
          : "Product designer project request";
      const detail = `<h1>${title}</h1><p>We are hiring a product designer for remote work. Apply by contacting our team.</p>`;
      const shell =
        '<html><body><main id="results">Loading</main><script>fetch("/api/results").then(r=>r.json()).then(data=>document.getElementById("results").innerHTML=data.html)</script></body></html>';
      const network = new FixtureHttpRepository({
        [`${origin}/projects`]: { body: form, contentType: "text/html" },
        [searchUrl]: { body: shell, contentType: "text/html" },
        [`${origin}/api/results`]: {
          body: JSON.stringify({ html: `<a href="/projects/42">${title}</a>` }),
          contentType: "application/json",
        },
        [detailUrl]: { body: detail, contentType: "text/html" },
      });
      const repository = new PublicSourceDocumentRepository(
        network,
        new BrowserDocumentRepository(),
      );
      const snapshot = state(category);
      const portal = await repository.read(`${origin}/projects`);
      expect(portal.capture?.method).toBe("http");
      record(snapshot, portal, 0);
      const searchAction = planExploration(snapshot);
      expect(searchAction.action).toEqual({ kind: "document", url: searchUrl });
      expect(documentLinks(shell, searchUrl)).toEqual([]);
      const results = await repository.read(searchUrl);
      expect(results).toMatchObject({
        truncated: false,
        capture: { method: "browser", complete: true, requests: 3 },
      });
      expect(results.links).toContainEqual({ url: detailUrl, text: title });
      record(snapshot, results, searchAction.depth);
      const next = planExploration(snapshot);
      expect(next.action).toEqual({ kind: "document", url: detailUrl });
      const evidence = await repository.read(detailUrl);
      expect(evidence.text?.toLowerCase()).toContain(title.toLowerCase());
      expect(evidence.capture?.complete).toBe(true);
      expect(evidence.posting).toBeNull(); // Demand discovery still needs evidence review and private matching.
      expect(network.urls.join(" ")).not.toContain("PRIVATE");
      expect(network.urls).toHaveLength(7);
      record(snapshot, evidence, next.depth);
      expect(planExploration(snapshot).action).toBeNull();
    },
    30_000,
  );

  it("blocks writes, private destinations, frames and socket connections without forwarding them to the network repository", async () => {
    const url = `${origin}/shell`;
    const network = new FixtureHttpRepository({
      [url]: {
        contentType: "text/html",
        body: `<body><main>Loading</main><script>
      fetch('/write', {method:'POST',body:'no'}).catch(()=>{});
      fetch('https://127.0.0.1/private').catch(()=>{});
      const frame=document.createElement('iframe');frame.src='/frame';document.body.append(frame);
      const ws=new WebSocket('wss://opportunities.example.com/socket');
      </script></body>`,
      },
    });
    const document = await new PublicSourceDocumentRepository(
      network,
      new BrowserDocumentRepository(),
    ).read(url);
    expect(document.truncated).toBe(true);
    expect(document.reason).toBe("browser_request_blocked");
    expect(document.posting).toBeNull();
    expect(network.urls).toEqual([`${origin}/robots.txt`, url]);
    expect(
      reviewInput({
        id: "fixture",
        url,
        title: "Opening",
        snippet: null,
        content_status: "fetched",
        document,
        last_seen_at: new Date(),
      }).truncated,
    ).toBe(true);
  }, 15_000);

  it("stops a resource flood at the capture deadline and cancels queued requests before returning", async () => {
    const url = `${origin}/many-resources`;
    const pages: Record<string, { contentType: string; body: string }> = {
      [url]: {
        contentType: "text/html",
        body: `<main>Loading</main><script>
        Promise.allSettled(Array.from({length:30}, (_,i)=>fetch('/data/'+i)))
          .then(()=>document.querySelector('main').textContent='Finished');</script>`,
      },
    };
    for (let index = 0; index < 30; index += 1) {
      pages[`${origin}/data/${index}`] = {
        contentType: "application/json",
        body: "{}",
      };
    }
    const network = new FixtureHttpRepository(pages);
    const document = await new PublicSourceDocumentRepository(
      network,
      new BrowserDocumentRepository(),
    ).read(url);
    expect(document.truncated).toBe(true);
    expect(document.posting).toBeNull();
    expect(document.capture?.requests).toBeLessThanOrEqual(12);
    const attempts = network.urls.length;
    await new Promise((resolve) => setTimeout(resolve, 2200));
    expect(network.urls).toHaveLength(attempts);
  }, 35_000);

  it("does not publish a partially rendered page when a required resource is unavailable", async () => {
    const url = `${origin}/shell`;
    const network = new FixtureHttpRepository({
      [url]: {
        contentType: "text/html",
        body: '<h1>Loading</h1><script src="/missing.js"></script>',
      },
    });
    const document = await new PublicSourceDocumentRepository(
      network,
      new BrowserDocumentRepository(),
    ).read(url);
    expect(document).toMatchObject({
      truncated: true,
      posting: null,
      capture: { method: "browser", complete: false },
    });
  }, 15_000);
});
