import { describe, expect, it } from "vitest";
import {
  BlueskySourceDocumentRepository,
  PublicHttpRepository,
  SourceDocumentRouter,
  blueskyTarget,
} from "@repo/adapters/discovery";
import type { SourceDocumentResult } from "@repo/core/discovery";

const url = "https://bsky.app/profile/buyer.example/post/3abc123";
const did = "did:plc:abcdefghijklmnopqrstuvwx";

/** Authored API record preserves real Bluesky thread/post types while avoiding external requests. */
function payload(
  record: Record<string, unknown> = {},
  post: Record<string, unknown> = {},
) {
  return {
    thread: {
      $type: "app.bsky.feed.defs#threadViewPost",
      post: {
        uri: `at://${did}/app.bsky.feed.post/3abc123`,
        cid: "bafyfixture",
        author: { did, handle: "buyer.example" },
        record: {
          $type: "app.bsky.feed.post",
          text: "We need a website redesign. Paid remote project; contact us here.",
          createdAt: "2026-10-15T00:00:00.000Z",
          ...record,
        },
        ...post,
      },
    },
  };
}

/** Executes the production API parser with a counted fixed transport response. */
async function capture(body: unknown, status = 200) {
  const urls: string[] = [];
  const http = {
    read: async (endpoint: string) => {
      urls.push(endpoint);
      return {
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      };
    },
  } as PublicHttpRepository;
  return {
    result: await new BlueskySourceDocumentRepository(http).read(url),
    urls,
  };
}

describe("supported public Bluesky source access", () => {
  it("keeps an external link preview separate from complete primary text", async () => {
    const { result } = await capture(
      payload({
        embed: {
          $type: "app.bsky.embed.external",
          external: {
            uri: "https://buyer.example/rfp.pdf",
            title: "UNVERIFIED preview",
            description: "PRIVATE REQUIREMENTS",
          },
        },
      }),
    );
    expect(result).toMatchObject({
      status: "fetched",
      capture: { complete: true },
      links: [
        {
          url: "https://buyer.example/rfp.pdf",
          text: "Link shared by the post author",
        },
      ],
    });
    expect(result.text).not.toMatch(/UNVERIFIED|PRIVATE REQUIREMENTS/);
  });
  it("routes exact public post permalinks and rejects unrelated or credential-bearing destinations", () => {
    expect(blueskyTarget(url)).toEqual({
      actor: "buyer.example",
      key: "3abc123",
    });
    expect(
      blueskyTarget(`https://bsky.app/profile/${did}/post/3abc123`),
    ).toEqual({ actor: did, key: "3abc123" });
    for (const address of [
      "https://bsky.app/profile/buyer.example",
      "https://bsky.app.evil.example/profile/buyer.example/post/3abc123",
      "https://secret@bsky.app/profile/buyer.example/post/3abc123",
      "http://bsky.app/profile/buyer.example/post/3abc123",
    ]) {
      expect(blueskyTarget(address)).toBeNull();
    }
  });

  it("captures one standalone primary post through the documented public endpoint", async () => {
    const { result, urls } = await capture(payload());
    expect(result).toMatchObject({
      status: "fetched",
      truncated: false,
      publicApi: { provider: "bluesky" },
      capture: { requests: 1, complete: true },
    });
    expect(result.text).toContain("Author: buyer.example");
    expect(result.text).toContain("We need a website redesign.");
    expect(urls).toHaveLength(1);
    const endpoint = new URL(urls[0]!);
    expect(endpoint.origin).toBe("https://public.api.bsky.app");
    expect(endpoint.searchParams.get("depth")).toBe("0");
    expect(endpoint.searchParams.get("parentHeight")).toBe("0");
    expect(endpoint.searchParams.get("uri")).toBe(
      "at://buyer.example/app.bsky.feed.post/3abc123",
    );
  });

  it.each([
    { reply: { parent: { uri: "at://other/post/1" } } },
    { embed: { $type: "app.bsky.embed.record" } },
    { embed: { $type: "app.bsky.embed.images" } },
  ])("withholds unresolved reply, quote and visual context", async (record) => {
    expect((await capture(payload(record))).result).toMatchObject({
      status: "access_limited",
      reason: "bluesky_context_incomplete",
      truncated: true,
      capture: { complete: false },
    });
  });

  it("keeps missing or moderated posts unavailable and never substitutes another identity", async () => {
    expect(
      (await capture({ thread: { $type: "app.bsky.feed.defs#notFoundPost" } }))
        .result.reason,
    ).toBe("bluesky_post_unavailable");
    expect(
      (await capture(payload({}, { labels: [{ val: "!no-unauthenticated" }] })))
        .result.text,
    ).toBeNull();
    expect(
      (
        await capture(
          payload({}, { uri: `at://${did}/app.bsky.feed.post/other` }),
        )
      ).result.reason,
    ).toBe("bluesky_identity_mismatch");
    expect((await capture(payload(), 429)).result.reason).toBe(
      "source_rate_limited",
    );
  });

  it("uses API source routing without falling through to HTML on denied access", async () => {
    const result = (await capture(payload())).result;
    const never = {
      read: async (): Promise<SourceDocumentResult> => {
        throw new Error("unexpected HTML request");
      },
    };
    expect(
      await new SourceDocumentRouter(never, never, {
        read: async () => result,
      }).read(url),
    ).toEqual(result);
  });

  it("offers only observed safe facet links as separate unverified destinations", async () => {
    const record = {
      facets: [
        {
          features: [
            {
              $type: "app.bsky.richtext.facet#link",
              uri: "https://buyer.example/rfp.pdf",
            },
            {
              $type: "app.bsky.richtext.facet#link",
              uri: "https://buyer.example/private?token=secret",
            },
            {
              $type: "app.bsky.richtext.facet#link",
              uri: "javascript:alert(1)",
            },
          ],
        },
      ],
    };
    expect((await capture(payload(record))).result.links).toEqual([
      {
        url: "https://buyer.example/rfp.pdf",
        text: "Link shared by the post author",
      },
    ]);
  });
});
