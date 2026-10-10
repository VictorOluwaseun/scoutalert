import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { PublicHttpRepository, type PublicResponse } from "./public-http.js";
import { canonicalDiscoveryUrl } from "../persistence/discovery-identities.js";
import { feedUrl } from "./document-feeds.js";

const robotsParser = createRequire(import.meta.url)(
  "robots-parser",
) as typeof import("robots-parser").default;
type Policy = ReturnType<typeof robotsParser>;

/** Serializes one bounded page bundle through pinned HTTPS and per-origin crawl policy, including browser resources. */
export class PublicPageSession {
  requests = 0;
  bytes = 0;
  hostDelaySeconds = 2;
  private readonly policies = new Map<string, Policy>();
  private readonly lastRequest = new Map<string, number>();
  private pending: Promise<unknown> = Promise.resolve();
  private readonly stopped = new AbortController();
  readonly signal: AbortSignal;

  /** A single deadline covers policy, document and browser requests; attempts remain bounded even on failure. */
  constructor(
    private readonly http: PublicHttpRepository,
    signal: AbortSignal,
  ) {
    this.signal = AbortSignal.any([signal, this.stopped.signal]);
  }

  /** Cancels queued and in-flight resources when a capture ends, including browser timeouts. */
  close(): void {
    this.stopped.abort();
  }

  /** Returns only already-observed, same-origin sitemap advertisements; no extra request or permission is implied. */
  sitemaps(value: string): { url: string; text: string }[] {
    const canonical = canonicalDiscoveryUrl(value);
    if (!canonical) {
      return [];
    }
    const origin = new URL(canonical).origin;
    const urls = (this.policies.get(origin)?.getSitemaps() ?? [])
      .map((url) => feedUrl(url, origin))
      .filter(
        (url): url is string =>
          !!url && url !== canonical && new URL(url).origin === origin,
      );
    return [...new Set(urls)]
      .slice(0, 4)
      .map((url) => ({ url, text: "Site-advertised sitemap" }));
  }

  /** Queues requests to prevent parallel browser resources from evading pacing or the 12-request/6-MB bundle ceiling. */
  read(url: string): Promise<PublicResponse> {
    const next = this.pending.then(() => this.retrieve(url));
    this.pending = next.catch(() => undefined);
    return next;
  }

  /** Rejects unavailable crawl policies and denied destinations before fetching their content. */
  private async retrieve(value: string): Promise<PublicResponse> {
    this.signal.throwIfAborted();
    const canonical = canonicalDiscoveryUrl(value);
    if (!canonical) {
      throw new Error("source_address_blocked");
    }
    const url = new URL(canonical);
    const policy = await this.policy(url.origin);
    const seconds = Math.max(2, policy.getCrawlDelay("ScoutAlert") ?? 2);
    this.hostDelaySeconds = Math.max(this.hostDelaySeconds, seconds);
    if (!Number.isFinite(seconds) || seconds > 5) {
      throw new Error("crawl_delay_exceeds_run_budget");
    }
    if (policy.isAllowed(canonical, "ScoutAlert") !== true) {
      throw new Error("crawl_policy_denied");
    }
    const wait = Math.max(
      0,
      (this.lastRequest.get(url.origin) ?? 0) + seconds * 1000 - Date.now(),
    );
    await delay(wait, undefined, { signal: this.signal });
    return this.fetch(canonical, 2_000_000);
  }

  /** Caches only this capture's robots policy; redirects, HTML challenges and unreadable policies are not permission. */
  private async policy(origin: string): Promise<Policy> {
    const cached = this.policies.get(origin);
    if (cached) {
      return cached;
    }
    const url = new URL("/robots.txt", origin).href;
    const response = await this.fetch(url, 512_000);
    if (
      response.status !== 404 &&
      (response.status !== 200 ||
        !/^text\/plain(?:;|$)/i.test(response.contentType))
    ) {
      throw new Error("crawl_policy_unavailable");
    }
    const policy = robotsParser(
      url,
      response.status === 404 ? "" : response.body,
    );
    this.policies.set(origin, policy);
    return policy;
  }

  /** Counts attempts before network I/O and consumes the remaining aggregate byte allowance. */
  private async fetch(
    url: string,
    maximumBytes: number,
  ): Promise<PublicResponse> {
    this.signal.throwIfAborted();
    if (this.requests >= 12 || this.bytes >= 6_000_000) {
      throw new Error("source_bundle_limit");
    }
    this.requests += 1;
    this.lastRequest.set(new URL(url).origin, Date.now());
    const response = await this.http.read(
      url,
      Math.min(maximumBytes, 6_000_000 - this.bytes),
      this.signal,
    );
    this.bytes +=
      response.accountedBytes ?? Buffer.byteLength(response.body, "utf8");
    return response;
  }
}
