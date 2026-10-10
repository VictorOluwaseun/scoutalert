import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  parseSitemapDocument,
  PublicHttpRepository,
  PublicSourceDocumentRepository,
  reviewInput,
  publicResponseBody,
  type PublicResponse,
} from "@repo/adapters/discovery";
import {
  collectionDirectoryReview,
  explorationChoices,
  monitorLinks,
  monitoringKind,
  planDiscovery,
  planExploration,
  validLeadReview,
  type DiscoveryExploration,
  type SourceDocumentResult,
} from "@repo/core/discovery";
import type { SearchDraft } from "@repo/core/onboarding";
import { demandReview } from "./fixtures/lead-review.js";

const origin = "https://opportunities.example.org";
const url = `${origin}/sitemap.xml`;
const ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

/** Constructs inert sitemap XML without a network dependency. */
function xml(paths = ["/jobs/product-designer"], index = false): string {
  const root = index ? "sitemapindex" : "urlset";
  const item = index ? "sitemap" : "url";
  return `<${root} xmlns="${ns}">${paths.map((path) => `<${item}><loc>${origin}${path}</loc></${item}>`).join("")}</${root}>`;
}

/** Exposes parser metadata through the exact capture shape consumed by review and monitoring. */
function capture(body = xml()): SourceDocumentResult {
  return {
    kind: "document",
    url,
    checkedAt: new Date().toISOString(),
    status: "fetched",
    reason: null,
    posting: null,
    hostDelaySeconds: 2,
    ...parseSitemapDocument(body, url),
  };
}

/** Opens a bounded exploration fixture with no provider calls or private brief. */
function snapshot(
  document: SourceDocumentResult,
  contextual = false,
): DiscoveryExploration {
  const plan = planDiscovery(
    {
      target: "Product designer",
      category: "employment",
      arrangement: "remote",
    } as SearchDraft,
    1,
    4,
    undefined,
    true,
  );
  plan.policy = "public-intent-v3";
  if (contextual) {
    plan.exploration!.candidatePolicy = "contextual-v1";
  }
  return {
    round: 1,
    plan,
    operations: [
      {
        key: "parent",
        depth: 0,
        input: { kind: "document", url: document.url },
        result: document,
      },
    ],
  };
}

/** Records every admitted network destination; unknown endpoints fail immediately. */
class FixtureHttp extends PublicHttpRepository {
  readonly urls: string[] = [];
  /** Receives exact fixtures, including crawl policies and redirects. */
  constructor(private readonly pages: Record<string, PublicResponse>) {
    super();
  }
  /** Preserves abort and byte-limit checks while leaving TLS/DNS validation to separate transport tests. */
  override async read(
    value: string,
    maximum: number,
    signal: AbortSignal,
  ): Promise<PublicResponse> {
    signal.throwIfAborted();
    this.urls.push(value);
    const page = this.pages[value];
    if (!page || Buffer.byteLength(page.body) > maximum) {
      throw new Error("unexpected_fixture_request");
    }
    return page;
  }
}

/** Advances the real session's pacing timers under a fake clock, so tests retain sequencing without wall-clock sleeps. */
async function read(pages: Record<string, PublicResponse>, destination = url) {
  vi.useFakeTimers();
  try {
    const http = new FixtureHttp(pages);
    const pending = new PublicSourceDocumentRepository(http).read(destination);
    await vi.advanceTimersByTimeAsync(20_000);
    return { result: await pending, urls: http.urls };
  } finally {
    vi.useRealTimers();
  }
}

const policy: PublicResponse = {
  status: 200,
  contentType: "text/plain",
  body: `User-agent: *\nAllow: /\nSitemap: ${url}`,
};
const map: PublicResponse = {
  status: 200,
  contentType: "application/xml",
  body: xml(),
};

describe("bounded sitemap discovery", () => {
  it("treats sitemap indexes and URL sets as directories, never individual opportunities", () => {
    const document = capture();
    expect(document.sitemap).toEqual({
      format: "urlset",
      entries: 1,
      omitted: 0,
    });
    expect(document.links?.[0]?.url).toBe(`${origin}/jobs/product-designer`);
    const input = reviewInput({
      id: "map",
      url,
      title: null,
      snippet: null,
      content_status: "fetched",
      document,
      last_seen_at: new Date(),
    });
    const review = collectionDirectoryReview(input)!;
    expect(input.collection).toBe("sitemap");
    expect(validLeadReview(input, review)).toBe(true);
    expect(validLeadReview(input, demandReview(input))).toBe(false);
    expect(review.analysis.facts.location.status).toBe("unknown");
    expect(
      collectionDirectoryReview({ ...input, scope: "search_excerpt" }),
    ).toBeNull();
    expect(collectionDirectoryReview({ ...input, truncated: true })).toBeNull();
    expect(
      monitoringKind(
        { leadId: "map", reviewKey: "r", document, input, review },
        new Date(),
      ),
    ).toBe("directory");
    expect(capture(xml([], true)).sitemap).toEqual({
      format: "index",
      entries: 0,
      omitted: 0,
    });
  });

  it("retains a bounded priority window, canonicalizes duplicates and excludes off-origin, credential and relative destinations", () => {
    const items = [
      "/categories/remote-design-jobs",
      ...Array.from({ length: 100 }, (_, i) => `/blog/${i}`),
      "/jobs/product-designer",
      "/jobs/product-designer?utm_source=x",
      "/jobs/secret?token=secret",
    ];
    const body = xml(items).replace(
      "</urlset>",
      "<url><loc>https://elsewhere.example.org/jobs/1</loc></url><url><loc>/relative</loc></url></urlset>",
    );
    const result = capture(body);
    expect(result.links).toHaveLength(80);
    expect(result.links?.[0]?.url).toBe(`${origin}/jobs/product-designer`);
    expect(result.sitemap).toMatchObject({ entries: 106, omitted: 26 });
    expect(
      result.links?.some((link) => /secret|elsewhere|relative/u.test(link.url)),
    ).toBe(false);
    expect(monitorLinks(result)).toHaveLength(80);
  });

  it("supports declared namespace prefixes and ignores extension elements impersonating loc", () => {
    const body = `<sm:urlset xmlns:sm="${ns}" xmlns:x="urn:untrusted"><sm:url><x:loc>https://elsewhere.example.org/</x:loc><sm:loc>${origin}/jobs/1</sm:loc></sm:url></sm:urlset>`;
    expect(capture(body).links?.map((link) => link.url)).toEqual([
      `${origin}/jobs/1`,
    ]);
  });

  it.each([
    "<urlset><url/></urlset>",
    `<urlset xmlns="${ns}"><url></urlset>`,
    `<!DOCTYPE urlset [<!ENTITY x SYSTEM "file:///etc/passwd">]><urlset xmlns="${ns}"/>`,
    `<urlset xmlns="${ns}">${"<url>".repeat(25)}${"</url>".repeat(25)}</urlset>`,
    `${xml()}${xml()}`,
    `<?xml version="1.0" encoding="ISO-8859-1"?>${xml()}`,
  ])("rejects malformed, hostile and unsupported XML", (body) => {
    expect(() => capture(body)).toThrow(/source_sitemap_/u);
  });

  it("ignores lastmod/priority changes as evidence of listing freshness or closure", () => {
    const before = capture(
      xml().replace(
        "</url>",
        "<lastmod>2026-10-01</lastmod><priority>0.1</priority></url>",
      ),
    );
    const after = capture(
      xml().replace(
        "</url>",
        "<lastmod>2026-10-10</lastmod><priority>1.0</priority></url>",
      ),
    );
    expect(before.fingerprint).toBe(after.fingerprint);
    expect(after.posting).toBeNull();
  });

  it("offers advertised maps even when the originating page is denied, while checking the map's own crawl policy", async () => {
    const denied = {
      ...policy,
      body: `User-agent: *\nDisallow: /board\nSitemap: ${url}\nSitemap: https://other.example.org/map.xml\nSitemap: ${origin}/secret?token=x`,
    };
    const page = await read(
      { [`${origin}/robots.txt`]: denied },
      `${origin}/board`,
    );
    expect(page.urls).toEqual([`${origin}/robots.txt`]);
    expect(page.result).toMatchObject({
      reason: "crawl_policy_denied",
      sitemaps: [{ url, text: "Site-advertised sitemap" }],
    });
    for (const contextual of [false, true]) {
      const choices = explorationChoices(snapshot(page.result, contextual));
      expect(
        choices.some(
          (choice) =>
            choice.action?.kind === "document" && choice.action.url === url,
        ),
      ).toBe(true);
    }
    const captured = await read({
      [`${origin}/robots.txt`]: denied,
      [url]: map,
    });
    expect(captured.result).toMatchObject({
      status: "fetched",
      sitemap: { format: "urlset" },
      capture: { requests: 2, complete: true },
    });
    const blocked = await read({
      [`${origin}/robots.txt`]: {
        ...policy,
        body: `User-agent: *\nDisallow: /\nSitemap: ${url}`,
      },
    });
    expect(blocked.result.reason).toBe("crawl_policy_denied");
    expect(blocked.urls).toEqual([`${origin}/robots.txt`]);
  });

  it("follows index children and matching listings with recorded parents, bounded depth and no invented paths", () => {
    const state = snapshot(capture(xml(["/maps/part-1.xml"], true)));
    expect(planExploration(state)).toMatchObject({
      parentKey: "parent",
      depth: 1,
      action: { url: `${origin}/maps/part-1.xml` },
    });
    const directory = capture();
    directory.url = `${origin}/maps/part-1.xml`;
    state.operations.push({
      key: "child",
      depth: 1,
      input: { kind: "document", url: directory.url },
      result: directory,
    });
    expect(planExploration(state)).toMatchObject({
      parentKey: "child",
      depth: 2,
      action: { url: `${origin}/jobs/product-designer` },
    });
    state.plan.maximumDocuments = 2;
    expect(planExploration(state).action).toBeNull();
  });

  it("does not retry a rate-limited or inaccessible host through its advertised sitemap", () => {
    for (const reason of [
      "source_rate_limited",
      "source_access_denied",
      "crawl_policy_unavailable",
      null,
    ]) {
      const failed = {
        ...capture(),
        status: "access_limited" as const,
        reason,
        sitemaps: [{ url: `${origin}/other.xml`, text: "Advertised sitemap" }],
      };
      expect(
        explorationChoices(snapshot(failed, true)).some(
          (choice) => choice.action?.kind === "document",
        ),
      ).toBe(false);
    }
  });
});

describe("checked redirects and response failures", () => {
  it("checks policies on a cross-origin redirect and records the final source without changing requested identity", async () => {
    const other = "https://jobs.example.net";
    const destination = `${other}/maps/jobs.xml`;
    const fixture = await read({
      [`${origin}/robots.txt`]: policy,
      [url]: {
        status: 302,
        contentType: "text/html",
        body: "",
        headers: { location: destination },
      },
      [`${other}/robots.txt`]: { ...policy, body: "User-agent: *\nAllow: /" },
      [destination]: { ...map, body: xml().replaceAll(origin, other) },
    });
    expect(fixture.result).toMatchObject({
      url,
      retrievedUrl: destination,
      status: "fetched",
      capture: { requests: 4 },
    });
    expect(fixture.result.links?.[0]?.url).toBe(
      `${other}/jobs/product-designer`,
    );
    expect(fixture.urls).toEqual([
      `${origin}/robots.txt`,
      url,
      `${other}/robots.txt`,
      destination,
    ]);
  });

  it.each([
    "http://127.0.0.1/private",
    "https://user:password@example.org/",
    "/map?token=secret",
  ])(
    "rejects unsafe redirect destinations before requesting them",
    async (location) => {
      const result = await read({
        [`${origin}/robots.txt`]: policy,
        [url]: {
          status: 302,
          contentType: "text/html",
          body: "",
          headers: { location },
        },
      });
      expect(result.result.reason).toBe("source_redirect_invalid");
      expect(result.urls).toHaveLength(2);
    },
  );

  it("bounds redirect hops without fetching the fourth redirect destination", async () => {
    const pages: Record<string, PublicResponse> = {
      [`${origin}/robots.txt`]: policy,
    };
    for (const [index, path] of [
      "/sitemap.xml",
      "/hop1",
      "/hop2",
      "/hop3",
    ].entries()) {
      pages[`${origin}${path}`] = {
        status: 302,
        contentType: "text/plain",
        body: "",
        headers: { location: `/hop${index + 1}` },
      };
    }
    const result = await read(pages);
    expect(result.result.reason).toBe("source_redirect_limit");
    expect(result.urls).toHaveLength(5);
    expect(result.urls).not.toContain(`${origin}/hop4`);
  }, 15_000);

  it("stops redirect loops and refuses denied redirected paths", async () => {
    const loop = await read({
      [`${origin}/robots.txt`]: policy,
      [url]: {
        status: 301,
        contentType: "text/plain",
        body: "",
        headers: { location: url },
      },
    });
    expect(loop.result.reason).toBe("source_redirect_loop");
    const denied = await read({
      [`${origin}/robots.txt`]: {
        ...policy,
        body: "User-agent: *\nDisallow: /private",
      },
      [url]: {
        status: 302,
        contentType: "text/plain",
        body: "",
        headers: { location: "/private" },
      },
    });
    expect(denied.result.reason).toBe("crawl_policy_denied");
    expect(denied.urls).not.toContain(`${origin}/private`);
  });

  it.each([
    [401, "source_authentication_required"],
    [403, "source_access_denied"],
    [404, "source_not_found"],
    [410, "source_not_found"],
    [429, "source_rate_limited"],
    [503, "source_temporarily_unavailable"],
    [200, "source_media_unsupported"],
  ])(
    "reports HTTP %s without claiming a closed opportunity",
    async (status, reason) => {
      const result = await read({
        [`${origin}/robots.txt`]: policy,
        [url]: { status: status as number, contentType: "image/png", body: "" },
      });
      expect(result.result).toMatchObject({
        reason,
        posting: null,
        capture: { complete: false },
      });
    },
  );

  it("supports bounded gzip files and transport while rejecting expansion bombs, truncation and unsupported encodings", async () => {
    const compressed = gzipSync(xml());
    expect(
      await publicResponseBody(
        compressed,
        "gzip",
        "application/xml",
        url,
        2000,
      ),
    ).toBe(xml());
    expect(
      await publicResponseBody(
        compressed,
        undefined,
        "application/gzip",
        `${url}.gz`,
        2000,
      ),
    ).toBe(xml());
    await expect(
      publicResponseBody(
        gzipSync("a".repeat(100_000)),
        "gzip",
        "application/xml",
        url,
        1000,
      ),
    ).rejects.toThrow("source_response_too_large");
    await expect(
      publicResponseBody(
        compressed.subarray(0, 20),
        "gzip",
        "application/xml",
        url,
        1000,
      ),
    ).rejects.toThrow("source_encoding_invalid");
    await expect(
      publicResponseBody(compressed, "br", "application/xml", url, 1000),
    ).rejects.toThrow("source_encoding_unsupported");
  });
});
