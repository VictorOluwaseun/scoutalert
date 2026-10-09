import { describe, expect, it } from "vitest";
import {
  documentFeeds,
  parseFeedDocument,
  PublicHttpRepository,
  PublicSourceDocumentRepository,
  reviewInput,
} from "@repo/adapters/discovery";
import {
  feedDirectoryReview,
  mayPublishLead,
  validLeadReview,
  monitorLinks,
  monitoringKind,
  planDiscovery,
  planExploration,
  type DiscoveryExploration,
  type SourceDocumentResult,
} from "@repo/core/discovery";
import type { SearchDraft } from "@repo/core/onboarding";
import { demandReview } from "./fixtures/lead-review.js";

const origin = "https://opportunities.example.org";
const feedUrl = `${origin}/feed`;
const rss =
  '<rss version="2.0"><channel><title>Design opportunities</title><item><title>Product designer needed</title><link>https://opportunities.example.org/projects/42</link><description><![CDATA[<p>Remote project.</p><img src="https://tracker.example.org/x">]]></description><enclosure url="https://files.example.org/file"/></item></channel></rss>';

/** Builds a production-shaped collection capture; it cannot contain a formal posting. */
function capture(body = rss): SourceDocumentResult {
  return {
    kind: "document",
    url: feedUrl,
    status: "fetched",
    checkedAt: new Date().toISOString(),
    reason: null,
    posting: null,
    hostDelaySeconds: 2,
    ...parseFeedDocument(body, feedUrl),
  };
}

/** Supplies only planned public responses; all other network destinations fail the test. */
class FeedHttp extends PublicHttpRepository {
  readonly urls: string[] = [];
  /** Receives inert fixture pages and an optional crawl denial. */
  constructor(
    private readonly pages: Record<
      string,
      { body: string; contentType: string }
    >,
    private readonly denied = false,
  ) {
    super();
  }
  /** Uses real size/abort contracts without connecting to a provider or mailbox. */
  override async read(url: string, maximum: number, signal: AbortSignal) {
    signal.throwIfAborted();
    this.urls.push(url);
    if (url === `${origin}/robots.txt`) {
      return {
        status: 200,
        contentType: "text/plain",
        body: this.denied
          ? "User-agent: *\nDisallow: /"
          : "User-agent: *\nAllow: /",
      };
    }
    const page = this.pages[url];
    if (!page || Buffer.byteLength(page.body) > maximum) {
      throw new Error("unexpected_fixture_request");
    }
    return { status: 200, ...page };
  }
}

describe("public RSS and Atom discovery", () => {
  it("discovers only explicit typed head links and excludes credential URLs, body metadata, templates and guessed feed paths", () => {
    const html = `<head><base href="https://other.example.org"><link rel="alternate" type="application/rss+xml" title="Latest jobs" href="/feed"><link rel="alternate" type="application/atom+xml" href="/feed?token=secret"><link rel="alternate" type="application/rss+xml" href="http://127.0.0.1/feed"><link rel="stylesheet" type="text/css" href="/x"><template><link rel="alternate" type="application/rss+xml" href="/hidden"></template></head><body><link rel="alternate" type="application/rss+xml" href="/body"></body>`;
    expect(documentFeeds(html, origin)).toEqual([
      { url: feedUrl, text: "Latest jobs" },
    ]);
    expect(documentFeeds("<h1>Jobs</h1>", origin)).toEqual([]);
  });

  it("captures RSS titles and canonical links without treating descriptions, GUIDs or attachments as listings", () => {
    const result = capture();
    expect(result.feed).toEqual({
      format: "rss",
      title: "Design opportunities",
      entries: 1,
      omitted: 0,
    });
    expect(result.links).toEqual([
      { url: `${origin}/projects/42`, text: "Product designer needed" },
    ]);
    expect(result.text).not.toContain("tracker");
    expect(result.posting).toBeNull();
    const withoutLink = capture(
      rss.replace(
        /<link>.*?<\/link>/u,
        "<guid>https://opportunities.example.org/invented</guid>",
      ),
    );
    expect(withoutLink.links).toEqual([]);
    expect(withoutLink.feed?.omitted).toBe(1);
  });

  it("selects Atom HTML alternates instead of enclosures/self links and respects inherited xml:base", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom" xml:base="${origin}/list/"><title>Service requests</title><link rel="next" href="?page=2"/><link rel="next" href="https://other.example.org/feed"/><entry xml:base="../requests/"><id>urn:entry:1</id><title>Website designer needed</title><link rel="enclosure" href="file.pdf"/><link rel="self" href="entry.xml"/><link rel="alternate" type="text/html" href="42"/></entry></feed>`;
    const result = capture(atom);
    expect(result.links).toEqual([
      { url: `${origin}/requests/42`, text: "Website designer needed" },
    ]);
    expect(result.pagination?.next).toEqual([`${origin}/list/?page=2`]);
  });

  it("keeps complete empty feeds readable without claiming that the site has no opportunities", () => {
    const result = capture(
      '<rss version="2.0"><channel><title>Jobs</title></channel></rss>',
    );
    expect(result.links).toEqual([]);
    const input = reviewInput({
      id: "feed",
      url: feedUrl,
      title: null,
      snippet: null,
      content_status: "fetched",
      document: result,
      last_seen_at: new Date(),
    });
    const review = feedDirectoryReview(input)!;
    expect(
      monitoringKind(
        {
          leadId: "feed",
          reviewKey: "review",
          document: result,
          input,
          review,
        },
        new Date(),
      ),
    ).toBe("directory");
  });

  it.each([
    '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss version="2.0"><channel/></rss>',
    '<rss version="2.0"><channel><item></channel></rss>',
    '<rss version="2.0"><channel>',
    '<?xml version="1.0" encoding="ISO-8859-1"?><rss version="2.0"><channel/></rss>',
    '<rss version="2.0"><channel/></rss><rss version="2.0"><channel/></rss>',
    `<rss version="2.0"><channel>${"<nested>".repeat(25)}${"</nested>".repeat(25)}</channel></rss>`,
  ])("rejects unsafe or unsupported XML without fetching resources", (xml) => {
    expect(() => parseFeedDocument(xml, feedUrl)).toThrow(/source_feed_/u);
  });

  it("caps and deduplicates links while recording entries omitted from the window", () => {
    const items = Array.from(
      { length: 100 },
      (_, i) =>
        `<item><title>Designer ${i}</title><link>${origin}/requests/${i}</link></item>`,
    ).join("");
    const result = capture(
      `<rss version="2.0"><channel><title>Projects</title>${items}</channel></rss>`,
    );
    expect(result.links).toHaveLength(80);
    expect(result.feed).toMatchObject({ entries: 100, omitted: 20 });
    const duplicate = capture(
      rss.replace(
        "</channel>",
        `<item><title>Duplicate</title><link>${origin}/projects/42?utm_source=feed</link></item></channel>`,
      ),
    );
    expect(duplicate.links).toHaveLength(1);
    expect(duplicate.feed?.omitted).toBe(1);
  });

  it("does not manufacture changes from a rolling feed build timestamp", () => {
    const first = capture(
      rss.replace(
        "</channel>",
        "<lastBuildDate>Mon, 05 Oct 2026 10:00:00 GMT</lastBuildDate></channel>",
      ),
    );
    const second = capture(
      rss.replace(
        "</channel>",
        "<lastBuildDate>Tue, 06 Oct 2026 10:00:00 GMT</lastBuildDate></channel>",
      ),
    );
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(capture(rss.replace("/42", "/43")).fingerprint).not.toBe(
      first.fingerprint,
    );
  });

  it("rejects AI promotion or extracted facts about a feed even if its only entry looks like a job", () => {
    const document = capture();
    const input = reviewInput({
      id: "feed",
      url: feedUrl,
      title: null,
      snippet: null,
      content_status: "fetched",
      document,
      last_seen_at: new Date(),
    });
    const directory = feedDirectoryReview(input)!;
    expect(input.collection).toBe("feed");
    expect(validLeadReview(input, directory)).toBe(true);
    expect(validLeadReview(input, demandReview(input))).toBe(false);
    expect(mayPublishLead(input, demandReview(input), new Date())).toBe(false);
    const inventedPay = structuredClone(directory);
    inventedPay.analysis.pay.minimum = 1000;
    expect(validLeadReview(input, inventedPay)).toBe(false);
    expect(feedDirectoryReview({ ...input, truncated: true })).toBeNull();
    expect(feedDirectoryReview({ ...input, collection: undefined })).toBeNull();
    expect(monitorLinks(document)).toEqual(document.links);
  });

  it.each(["employment", "contract", "services"] as const)(
    "follows an observed feed to a relevant %s entry under existing budgets",
    async (category) => {
      const http = new FeedHttp({
        [`${origin}/board`]: {
          contentType: "text/html",
          body: '<head><link rel="alternate" type="application/rss+xml" href="/feed"></head><body><h1>Design opportunities</h1></body>',
        },
        [feedUrl]: {
          contentType: "application/rss+xml; charset=utf-8",
          body: rss,
        },
        [`${origin}/projects/42`]: {
          contentType: "text/html",
          body: "<h1>Product designer needed</h1><p>Remote work. Read requirements and apply.</p>",
        },
      });
      const reader = new PublicSourceDocumentRepository(http);
      const snapshot: DiscoveryExploration = {
        round: 0,
        operations: [],
        plan: planDiscovery(
          {
            target: "Product designer",
            category,
            arrangement: "remote",
          } as SearchDraft,
          1,
          4,
          undefined,
          true,
        ),
      };
      const parent = await reader.read(`${origin}/board`);
      snapshot.operations.push({
        key: "board",
        depth: 0,
        input: { kind: "document", url: parent.url },
        result: parent,
      });
      expect(planExploration(snapshot)).toMatchObject({
        action: { url: feedUrl },
        parentKey: "board",
        depth: 1,
      });
      const feed = await reader.read(feedUrl);
      expect(feed).toMatchObject({
        status: "fetched",
        posting: null,
        feed: { format: "rss" },
        capture: { method: "http", requests: 2, complete: true },
      });
      snapshot.operations.push({
        key: "feed",
        depth: 1,
        input: { kind: "document", url: feedUrl },
        result: feed,
      });
      expect(planExploration(snapshot)).toMatchObject({
        action: { url: `${origin}/projects/42` },
        parentKey: "feed",
        depth: 2,
      });
      const detail = await reader.read(`${origin}/projects/42`);
      expect(detail.feed).toBeUndefined();
      expect(http.urls).not.toContain("https://tracker.example.org/x");
      snapshot.plan.maximumDocuments = 2;
      expect(planExploration(snapshot).action).toBeNull();
    },
    15_000,
  );

  it("preserves robots denial and explicit failed parse results", async () => {
    const denied = new FeedHttp({}, true);
    expect(
      await new PublicSourceDocumentRepository(denied).read(feedUrl),
    ).toMatchObject({
      status: "access_limited",
      reason: "crawl_policy_denied",
    });
    expect(denied.urls).toEqual([`${origin}/robots.txt`]);
    const malformed = new FeedHttp({
      [feedUrl]: { contentType: "application/rss+xml", body: "<rss>" },
    });
    expect(
      await new PublicSourceDocumentRepository(malformed).read(feedUrl),
    ).toMatchObject({
      status: "access_limited",
      reason: "source_feed_invalid",
      capture: { complete: false },
    });
  }, 10_000);
});
