import { z } from "zod";
import {
  SocialProvider,
  SocialProviderError,
  type NativePost,
  type SocialOperation,
  type SocialResult,
} from "@repo/core/discovery";
import { readSourceResponse } from "../../scouting/connectors/source-http.js";
import { discoveryKey } from "../persistence/discovery-identities.js";

const id = z.string().regex(/^\d{1,25}$/);
const postSchema = z.object({
  id,
  text: z.string().max(100_000),
  author_id: id,
  created_at: z.iso.datetime(),
  conversation_id: id,
  edit_history_tweet_ids: z.array(id).min(1).max(20),
  note_tweet: z.object({ text: z.string().max(100_000) }).optional(),
  referenced_tweets: z
    .array(
      z.object({ id, type: z.enum(["replied_to", "quoted", "retweeted"]) }),
    )
    .max(3)
    .optional(),
});
const resultSchema = z.object({
  data: z.array(postSchema).max(100).optional(),
  meta: z
    .object({
      result_count: z.number().int().nonnegative(),
      next_token: z.string().min(1).max(4096).optional(),
    })
    .optional(),
  errors: z
    .array(
      z.object({
        resource_id: id.optional(),
        value: z.string().optional(),
        type: z.string().optional(),
      }),
    )
    .max(100)
    .optional(),
});

/** App-only public X reads preserve native identities; no HTML scraping, private posts or hidden follow-up calls. */
export class XSocialProvider extends SocialProvider {
  /** Receives the bearer credential only at composition; an injected transport supports captured contract tests. */
  constructor(
    private readonly bearerToken: string,
    private readonly request: typeof fetch = fetch,
  ) {
    super();
  }

  /** Fetches one frozen page or availability batch with bounded response size, time and redirect behavior. */
  async read(operation: SocialOperation): Promise<SocialResult> {
    const url = new URL(
      operation.kind === "search"
        ? "https://api.x.com/2/tweets/search/recent"
        : "https://api.x.com/2/tweets",
    );
    url.searchParams.set(
      "tweet.fields",
      "author_id,created_at,conversation_id,edit_history_tweet_ids,referenced_tweets,note_tweet",
    );
    if (operation.kind === "search") {
      url.searchParams.set("query", operation.query);
      url.searchParams.set("start_time", operation.startTime);
      url.searchParams.set("end_time", operation.endTime);
      url.searchParams.set("max_results", String(operation.limit));
      url.searchParams.set("sort_order", "recency");
    }
    if (operation.kind === "search" && operation.nextToken) {
      url.searchParams.set("next_token", operation.nextToken);
    }
    if (operation.kind === "lookup") {
      url.searchParams.set("ids", operation.ids.join(","));
    }
    const response = await this.request(url, {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    });
    const retryAfterSeconds = providerDelay(response);
    if (!response.ok) {
      await response.body?.cancel();
      const reason =
        response.status === 429
          ? "rate_limited"
          : [401, 402, 403].includes(response.status)
            ? "access_unavailable"
            : response.status === 400 &&
                operation.kind === "search" &&
                operation.nextToken
              ? "invalid_cursor"
              : "provider_unavailable";
      throw new SocialProviderError(
        reason,
        reason === "access_unavailable"
          ? Math.max(3600, retryAfterSeconds)
          : Math.max(60, retryAfterSeconds),
      );
    }
    const parsed = resultSchema.parse(
      await readSourceResponse(response, 2_000_000),
    );
    const posts = parsed.data ?? [];
    if (
      operation.kind === "search" &&
      (!parsed.meta ||
        parsed.meta.result_count !== posts.length ||
        posts.length > operation.limit)
    ) {
      throw new SocialProviderError("provider_unavailable");
    }
    if (
      operation.kind === "lookup" &&
      posts.some(
        (post) =>
          !post.edit_history_tweet_ids.some((value) =>
            operation.ids.includes(value),
          ),
      )
    ) {
      throw new SocialProviderError("provider_unavailable");
    }
    const unavailableIds =
      operation.kind === "lookup"
        ? (parsed.errors ?? [])
            .filter((error) =>
              /\/(?:resource-not-found|not-authorized-for-resource)$/.test(
                error.type ?? "",
              ),
            )
            .flatMap((error) => {
              const value = error.resource_id ?? error.value;
              return value && operation.ids.includes(value) ? [value] : [];
            })
        : [];
    const checkedAt = new Date().toISOString();
    const documents = posts.map((post) => {
      const nativePost: NativePost = {
        platform: "x",
        id: post.id,
        authorId: post.author_id,
        publishedAt: post.created_at,
        conversationId: post.conversation_id,
        editIds: post.edit_history_tweet_ids,
        references: post.referenced_tweets ?? [],
        textTruncated:
          !post.note_tweet &&
          /(?:…|\.\.\.)\s*https:\/\/t\.co\//u.test(post.text),
      };
      const text = post.note_tweet?.text ?? post.text;
      return {
        kind: "document" as const,
        url: `https://x.com/i/status/${post.edit_history_tweet_ids[0]}`,
        checkedAt,
        status: "fetched" as const,
        reason: null,
        text,
        fingerprint: discoveryKey([nativePost, text]),
        posting: null,
        hostDelaySeconds: 0,
        nativePost,
        // A later admitted context lookup may complete this packet; transport never makes hidden follow-up calls.
        truncated:
          nativePost.references.length > 0 ||
          !nativePost.editIds.includes(nativePost.conversationId) ||
          nativePost.textTruncated,
        links: [],
      };
    });
    const unresolvedLookup =
      operation.kind === "lookup" &&
      operation.ids.some(
        (value) =>
          !unavailableIds.includes(value) &&
          !posts.some((post) => post.edit_history_tweet_ids.includes(value)),
      );
    return {
      documents,
      unavailableIds,
      nextToken: parsed.meta?.next_token ?? null,
      partial:
        operation.kind === "search"
          ? Boolean(parsed.errors?.length) ||
            (operation.nextToken !== null &&
              operation.nextToken === parsed.meta?.next_token)
          : unresolvedLookup,
      checkedAt,
      retryAfterSeconds,
    };
  }
}

/** Honors native reset and Retry-After headers without leaking provider responses or depending on local timezone. */
function providerDelay(response: Response): number {
  const retry = response.headers.get("retry-after");
  const retrySeconds =
    retry && /^\d+$/.test(retry)
      ? Number(retry)
      : Math.ceil((Date.parse(retry ?? "") - Date.now()) / 1000);
  const exhausted =
    response.headers.get("x-rate-limit-remaining") === "0" ||
    response.status === 429;
  const reset = exhausted
    ? Number(response.headers.get("x-rate-limit-reset")) - Date.now() / 1000
    : 0;
  return Math.max(
    0,
    ...[retrySeconds, reset].filter(Number.isFinite).map(Math.ceil),
  );
}
