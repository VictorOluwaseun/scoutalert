import type {
  LeadReviewInput,
  NativeContext,
  NativePost,
} from "@repo/core/discovery";
import { discoveryKey } from "../persistence/discovery-identities.js";

/** Public row fields only; owner IDs and private briefs never enter classification input or cache keys. */
export interface ReviewableLead {
  id: string;
  url: string;
  title: string | null;
  snippet: string | null;
  content_status: string;
  document: {
    feed?: { format: "rss" | "atom" };
    nativePost?: NativePost;
    nativeContext?: NativeContext;
    truncated?: boolean;
    text?: string | null;
    fingerprint?: string | null;
    checkedAt?: string;
  } | null;
  last_seen_at: Date | string;
}

/** Bounds source and excerpt inputs explicitly; a truncated source cannot become a published opportunity. */
export function reviewInput(lead: ReviewableLead): LeadReviewInput {
  const source = lead.content_status === "fetched" && !!lead.document?.text;
  const original = source
    ? lead.document!.text!
    : [lead.title, lead.snippet].filter(Boolean).join("\n");
  const maximumBytes = source
    ? lead.document?.nativeContext
      ? 32_000
      : 48_000
    : 2_000;
  let text = original.slice(0, maximumBytes);
  while (Buffer.byteLength(text, "utf8") > maximumBytes) {
    text = text.slice(0, Math.floor(text.length * 0.9));
  }
  const scope = source ? "source" : "search_excerpt";
  const truncated =
    text.length < original.length ||
    (source && lead.document?.truncated === true);
  const nativePost = source ? lead.document?.nativePost : undefined;
  const nativeContext = source ? lead.document?.nativeContext : undefined;
  const collection =
    source && lead.document?.feed ? ("feed" as const) : undefined;
  const observedAt = source
    ? lead.document!.checkedAt!
    : new Date(lead.last_seen_at).toISOString();
  return {
    collection,
    nativePost,
    nativeContext,
    id: lead.id,
    url: lead.url,
    scope,
    truncated,
    text,
    observedAt: nativeContext?.posts.length
      ? new Date(
          Math.min(
            Date.parse(observedAt),
            ...nativeContext.posts.map((post) => Date.parse(post.checkedAt)),
          ),
        ).toISOString()
      : observedAt,
    documentFingerprint: source ? (lead.document!.fingerprint ?? null) : null,
    fingerprint: discoveryKey([
      lead.url,
      scope,
      truncated,
      text,
      source ? lead.document?.fingerprint : null,
      ...(nativePost ? ["native-attribution-v1", nativePost] : []),
      ...(collection ? ["feed-directory-v1"] : []),
    ]),
  };
}
