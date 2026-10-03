import { describe, expect, it, vi } from "vitest";
import {
  socialQuery,
  SocialProviderError,
  mayPublishLead,
  type SocialSearchPage,
} from "@repo/core/discovery";
import {
  XSocialProvider,
  reviewInput,
  canonicalDiscoveryUrl,
} from "@repo/adapters/discovery";
import type { SearchDraft } from "@repo/core/onboarding";
import { demandReview } from "./fixtures/lead-review.js";
import { readWorkerConfiguration } from "../src/config.js";

const page: SocialSearchPage = {
  kind: "search",
  query: '"product designer" hiring',
  startTime: "2026-10-01T00:00:00.000Z",
  endTime: "2026-10-01T01:00:00.000Z",
  nextToken: "cursor",
  limit: 10,
};
const post = {
  id: "101",
  text: "Product designer. Permanent remote employment. Apply through this page.",
  author_id: "20",
  created_at: "2026-10-01T00:10:00Z",
  conversation_id: "101",
  edit_history_tweet_ids: ["100", "101"],
};

describe("native X public contract", () => {
  it("coalesces public X and Twitter handle URLs by native post ID", () => {
    expect(
      canonicalDiscoveryUrl("https://twitter.com/someone/status/101?s=20"),
    ).toBe("https://x.com/i/status/101");
    expect(
      canonicalDiscoveryUrl("https://x.com/another/status/101/photo/1"),
    ).toBe("https://x.com/i/status/101");
    expect(canonicalDiscoveryUrl("https://x.com/search?q=design")).toBe(
      "https://x.com/search?q=design",
    );
  });
  it("sends only a safe public target, without requiring omitted location or arrangement", () => {
    const search = {
      target: "Product designer",
      residence: "PRIVATE RESIDENCE",
      background: "PRIVATE BACKGROUND",
      arrangement: "remote",
    } as SearchDraft;
    const query = socialQuery(search)!;
    expect(query).toContain('"product designer"');
    expect(query).toContain('"looking for"');
    expect(query).not.toMatch(/PRIVATE|remote/);
    expect(socialQuery({ ...search, target: "person@example.org" })).toBeNull();
    expect(
      socialQuery({ ...search, target: "https://example.org" }),
    ).toBeNull();
    expect(socialQuery({ ...search, target: "designer\nprivate" })).toBeNull();
  });
  it("keeps a frozen page and native identity and uses expanded long-post text without extra calls", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          data: [
            {
              ...post,
              note_tweet: { text: post.text + " Full long-post text." },
            },
          ],
          meta: { result_count: 1, next_token: "next" },
        }),
      );
    const result = await new XSocialProvider("test-secret", request).read(page);
    const [url, options] = request.mock.calls[0]!;
    expect(url.hostname).toBe("api.x.com");
    expect(url.searchParams.get("start_time")).toBe(page.startTime);
    expect(url.searchParams.get("next_token")).toBe("cursor");
    expect(url.searchParams.has("expansions")).toBe(false);
    expect(options.redirect).toBe("error");
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.documents[0]!.url).toBe("https://x.com/i/status/100");
    expect(result.documents[0]!.text).toContain("Full long-post text");
    expect(result.documents[0]!.nativePost.authorId).toBe("20");
    expect(result.nextToken).toBe("next");
  });
  it("keeps incomplete reply context out of complete-source publication", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          data: [
            { ...post, referenced_tweets: [{ type: "replied_to", id: "90" }] },
          ],
          meta: { result_count: 1 },
        }),
      );
    const result = await new XSocialProvider("test", request).read(page);
    const doc = result.documents[0]!;
    const input = reviewInput({
      id: "post",
      url: doc.url,
      title: null,
      snippet: null,
      content_status: "fetched",
      document: doc,
      last_seen_at: doc.checkedAt,
    });
    expect(input.truncated).toBe(true);
    expect(mayPublishLead(input, demandReview(input), new Date())).toBe(false);
  });
  it("distinguishes unavailable lookup IDs from transient partial errors", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        errors: [
          {
            resource_id: "101",
            type: "https://api.x.com/2/problems/resource-not-found",
          },
          {
            resource_id: "102",
            type: "https://api.x.com/2/problems/service-unavailable",
          },
        ],
      }),
    );
    const result = await new XSocialProvider("test", request).read({
      kind: "lookup",
      ids: ["101", "102"],
    });
    expect(result.unavailableIds).toEqual(["101"]);
    expect(result.partial).toBe(true);
  });
  it("preserves partial-page state instead of treating missing posts as exhaustive search", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          data: [post],
          meta: { result_count: 1 },
          errors: [{ type: "upstream-error" }],
        }),
      );
    expect(
      (await new XSocialProvider("test", request).read(page)).partial,
    ).toBe(true);
  });
  it.each([401, 402, 403, 429, 500])(
    "redacts errors and does not retry HTTP %s implicitly",
    async (status) => {
      const request = vi
        .fn()
        .mockResolvedValue(
          new Response("secret provider response", {
            status,
            headers: { "retry-after": "600" },
          }),
        );
      await expect(
        new XSocialProvider("test-secret", request).read(page),
      ).rejects.toMatchObject({
        reason:
          status === 429
            ? "rate_limited"
            : [401, 402, 403].includes(status)
              ? "access_unavailable"
              : "provider_unavailable",
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("honors a successful response's exhausted rate-limit window", async () => {
    const reset = Math.ceil(Date.now() / 1000) + 900;
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { meta: { result_count: 0 } },
          {
            headers: {
              "x-rate-limit-remaining": "0",
              "x-rate-limit-reset": String(reset),
            },
          },
        ),
      );
    const result = await new XSocialProvider("test", request).read(page);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(899);
  });
  it("rejects malformed search responses instead of committing an empty coverage window", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ data: [post] }));
    await expect(
      new XSocialProvider("test", request).read(page),
    ).rejects.toBeInstanceOf(SocialProviderError);
  });
  it("requires explicit native enablement and a credential", () => {
    const env = {
      DATABASE_URL: "postgres://test:test@localhost/scoutalert_test",
    };
    expect(readWorkerConfiguration(env).SCOUT_X_ENABLED).toBe("false");
    expect(() =>
      readWorkerConfiguration({ ...env, SCOUT_X_ENABLED: "true" }),
    ).toThrow("X_BEARER_TOKEN");
  });
});
