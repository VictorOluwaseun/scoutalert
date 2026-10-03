import { describe, expect, it } from "vitest";
import {
  buildNativeContext,
  validLeadReview,
  type NativeDocument,
} from "@repo/core/discovery";
import { demandReview } from "./fixtures/lead-review.js";

const now = new Date("2026-10-03T01:00:00Z");

/** Creates a source-declared native reference graph without network calls or real account data. */
function document(id: string, references: string[] = []): NativeDocument {
  return {
    kind: "document",
    url: `https://x.com/i/status/${id}`,
    checkedAt: now.toISOString(),
    status: "fetched",
    reason: null,
    text: `Post ${id}`,
    fingerprint: id,
    posting: null,
    hostDelaySeconds: 0,
    nativePost: {
      platform: "x",
      id,
      authorId: id,
      publishedAt: now.toISOString(),
      conversationId: id,
      editIds: [id],
      references: references.map((ref) => ({ id: ref, type: "replied_to" })),
      textTruncated: false,
    },
  };
}

/** Indexes all edit aliases like the native repository does while keeping a single captured source. */
function sources(...documents: NativeDocument[]): Map<string, NativeDocument> {
  return new Map(
    documents.flatMap((doc) =>
      doc.nativePost.editIds.map((id) => [id, doc] as const),
    ),
  );
}

describe("bounded native context", () => {
  it("keeps source authors and the primary text separate across two reference levels", () => {
    const primary = document("1", ["2"]);
    const parent = document("2", ["3"]);
    const root = document("3");
    const result = buildNativeContext(primary, sources(parent, root), now)!;
    expect(result.complete).toBe(true);
    expect(
      result.posts.map((post) => [post.id, post.authorId, post.depth]),
    ).toEqual([
      ["2", "2", 1],
      ["3", "3", 2],
    ]);
    expect(primary.text).toBe("Post 1");
  });
  it("retains missing and expired references as unresolved", () => {
    const stale = document("3");
    stale.checkedAt = "2026-10-02T01:00:00Z";
    const result = buildNativeContext(
      document("1", ["2", "3"]),
      sources(stale),
      now,
    )!;
    expect(result.complete).toBe(false);
    expect(result.missingIds).toEqual(["2", "3"]);
    expect(result.posts).toEqual([]);
  });
  it("does not turn a conversation cycle or a deeper chain into complete context", () => {
    const cycle = buildNativeContext(
      document("1", ["2"]),
      sources(document("2", ["3"]), document("3", ["2"])),
      now,
    )!;
    expect(cycle.complete).toBe(false);
    const deep = buildNativeContext(
      document("1", ["2"]),
      sources(document("2", ["3"]), document("3", ["4"]), document("4")),
      now,
    )!;
    expect(deep.bounded).toBe(true);
    expect(deep.dependencies).toEqual(["2", "3"]);
  });
  it("deduplicates edit aliases and conversation roots", () => {
    const primary = document("1", ["2", "3"]);
    primary.nativePost.conversationId = "2";
    const parent = document("3");
    parent.nativePost.editIds = ["2", "3"];
    parent.url = "https://x.com/i/status/2";
    const result = buildNativeContext(primary, sources(parent), now)!;
    expect(result.complete).toBe(true);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]!.url).toBe(parent.url);
  });
  it("bounds total references and UTF-8 context without claiming truncated text is complete", () => {
    const parents = ["2", "3", "4"].map((id) =>
      document(id, [id + "0", id + "1", id + "2"]),
    );
    const result = buildNativeContext(
      document("1", ["2", "3", "4"]),
      sources(...parents),
      now,
    )!;
    expect(result.dependencies).toHaveLength(6);
    expect(result.complete).toBe(false);
    const long = document("2");
    long.text = "🧭".repeat(2000);
    const bounded = buildNativeContext(
      document("1", ["2"]),
      sources(long),
      now,
    )!;
    expect(Buffer.byteLength(bounded.posts[0]!.text)).toBeLessThanOrEqual(2000);
    expect(bounded.bounded).toBe(true);
    expect(bounded.complete).toBe(false);
  });
  it("rejects facts cited only from another author's post", () => {
    const primary = document("1", ["2"]);
    primary.text = "I am available for this.";
    const parent = document("2");
    parent.text = "Product designer wanted. Apply today.";
    const input = {
      id: "1",
      url: primary.url,
      text: primary.text,
      fingerprint: "input",
      documentFingerprint: "doc",
      scope: "source" as const,
      truncated: false,
      observedAt: now.toISOString(),
      nativePost: primary.nativePost,
      nativeContext: buildNativeContext(primary, sources(parent), now),
    };
    const review = demandReview(input);
    review.quotes = [parent.text];
    review.analysis.facts.role = {
      status: "stated",
      value: "Product designer",
      quotes: [parent.text],
    };
    expect(validLeadReview(input, review)).toBe(false);
  });

  it("keeps older shortened captures incomplete until explicit long-post metadata is available", () => {
    const shortened = document("2");
    delete shortened.nativePost.textTruncated;
    shortened.text = "A partial message… https://t.co/example";
    const result = buildNativeContext(
      document("1", ["2"]),
      sources(shortened),
      now,
    )!;
    expect(result.complete).toBe(false);
    expect(result.bounded).toBe(true);
  });
});
