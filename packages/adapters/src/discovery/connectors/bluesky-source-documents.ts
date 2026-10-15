import { z } from "zod";
import {
  SourceDocumentRepository,
  type SourceDocumentResult,
} from "@repo/core/discovery";
import { PublicHttpRepository } from "./public-http.js";
import { discoveryKey } from "../persistence/discovery-identities.js";
import { feedUrl } from "./document-feeds.js";

const postSchema = z.object({
  uri: z.string(),
  cid: z.string().min(1),
  author: z.object({ did: z.string().startsWith("did:"), handle: z.string() }),
  record: z.object({
    $type: z.literal("app.bsky.feed.post"),
    text: z.string().min(1).max(30_000),
    createdAt: z.iso.datetime({ offset: true }),
    reply: z.unknown().optional(),
    embed: z.unknown().optional(),
    facets: z
      .array(
        z.object({
          features: z.array(
            z.object({ $type: z.string(), uri: z.string().optional() }),
          ),
        }),
      )
      .max(100)
      .optional(),
  }),
  labels: z.array(z.object({ val: z.string() })).optional(),
});

/** Recognizes only public post permalinks, never profiles, feeds or arbitrary API destinations. */
export function blueskyTarget(
  value: string,
): { actor: string; key: string } | null {
  try {
    const url = new URL(value);
    const match =
      /^\/profile\/([a-zA-Z0-9.:%-]+)\/post\/([a-zA-Z0-9]+)\/?$/u.exec(
        url.pathname,
      );
    if (
      url.protocol !== "https:" ||
      url.hostname !== "bsky.app" ||
      url.port ||
      url.username ||
      url.password ||
      !match
    ) {
      return null;
    }
    const actor = decodeURIComponent(match[1]!);
    return /^(?:did:plc:[a-z2-7]+|[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)$/u.test(
      actor,
    )
      ? { actor, key: match[2]! }
      : null;
  } catch {
    return null;
  }
}

/** Uses Bluesky's documented unauthenticated AppView API for exact observed posts, within ordinary document admission. */
export class BlueskySourceDocumentRepository extends SourceDocumentRepository {
  /** Receives pinned public HTTPS from composition; no session, credentials or provider follow-up requests are used. */
  constructor(private readonly http: PublicHttpRepository) {
    super();
  }

  /** Captures primary text and external-link destinations; replies, visual/quoted embeds and restricted records remain incomplete. */
  async read(url: string): Promise<SourceDocumentResult> {
    const empty: SourceDocumentResult = {
      kind: "document",
      url,
      checkedAt: new Date().toISOString(),
      status: "access_limited",
      reason: "bluesky_capture_failed",
      text: null,
      fingerprint: null,
      posting: null,
      hostDelaySeconds: 2,
    };
    const target = blueskyTarget(url);
    if (!target) {
      return { ...empty, reason: "unsupported_bluesky_url" };
    }
    const endpoint = new URL(
      "https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread",
    );
    endpoint.searchParams.set(
      "uri",
      `at://${target.actor}/app.bsky.feed.post/${target.key}`,
    );
    endpoint.searchParams.set("depth", "0");
    endpoint.searchParams.set("parentHeight", "0");
    try {
      const response = await this.http.read(
        endpoint.href,
        1_000_000,
        AbortSignal.timeout(12_000),
      );
      const capture = {
        method: "public_api" as const,
        requests: 1,
        bytes: response.accountedBytes ?? Buffer.byteLength(response.body),
        complete: false,
        parser: "bluesky-public-v1",
      };
      if (
        response.status !== 200 ||
        !/^application\/json(?:;|$)/iu.test(response.contentType)
      ) {
        return {
          ...empty,
          reason:
            response.status === 429
              ? "source_rate_limited"
              : "bluesky_api_unavailable",
          capture,
        };
      }
      const payload = z
        .object({
          thread: z.object({ $type: z.string(), post: z.unknown().optional() }),
        })
        .parse(JSON.parse(response.body));
      if (payload.thread.$type !== "app.bsky.feed.defs#threadViewPost") {
        return { ...empty, reason: "bluesky_post_unavailable", capture };
      }
      const post = postSchema.parse(payload.thread.post);
      if (
        post.uri !==
          `at://${post.author.did}/app.bsky.feed.post/${target.key}` ||
        ![post.author.did, post.author.handle].includes(target.actor)
      ) {
        return { ...empty, reason: "bluesky_identity_mismatch", capture };
      }
      if (
        post.labels?.some((label) =>
          ["!hide", "!no-unauthenticated"].includes(label.val),
        )
      ) {
        return { ...empty, reason: "bluesky_post_unavailable", capture };
      }
      const external = z
        .object({
          $type: z.literal("app.bsky.embed.external"),
          external: z.object({ uri: z.string() }),
        })
        .safeParse(post.record.embed);
      const incomplete =
        post.record.reply !== undefined ||
        (post.record.embed !== undefined && !external.success);
      const links = (post.record.facets ?? [])
        .flatMap((facet) => facet.features)
        .filter((feature) => feature.$type === "app.bsky.richtext.facet#link")
        .flatMap((feature) => {
          const destination = feedUrl(feature.uri, url);
          return destination
            ? [{ url: destination, text: "Link shared by the post author" }]
            : [];
        })
        .slice(0, 80);
      const externalUrl = external.success
        ? feedUrl(external.data.external.uri, url)
        : null;
      if (
        externalUrl &&
        !links.some((link) => link.url === externalUrl) &&
        links.length < 80
      ) {
        links.push({
          url: externalUrl,
          text: "Link shared by the post author",
        });
      }
      const text = `Author: ${post.author.handle}\nPublished: ${post.record.createdAt}\n\n${post.record.text}`;
      return {
        ...empty,
        status: incomplete ? "access_limited" : "fetched",
        reason: incomplete ? "bluesky_context_incomplete" : null,
        text,
        fingerprint: discoveryKey([
          "bluesky-public-v1",
          post.uri,
          post.cid,
          text,
        ]),
        truncated: incomplete,
        links,
        publicApi: {
          provider: "bluesky",
          url: endpoint.href,
          snapshotFingerprint: discoveryKey([post.uri, post.cid]),
        },
        capture: { ...capture, complete: !incomplete },
      };
    } catch {
      return empty;
    }
  }
}
