import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";
import {
  SourceDocumentRepository,
  type SourceDocumentResult,
} from "@repo/core/discovery";
import { PublicHttpRepository } from "./public-http.js";
import { documentText, parseFormalPosting } from "./document-parser.js";
import { documentLinks } from "./document-links.js";
import { discoveryKey } from "../persistence/discovery-identities.js";

// robots-parser publishes a CommonJS function with an ESM default declaration.
const robotsParser = createRequire(import.meta.url)(
  "robots-parser",
) as typeof import("robots-parser").default;

/** Reads permitted public pages; restrictions remain visible evidence gaps rather than triggering bypasses. */
export class PublicSourceDocumentRepository extends SourceDocumentRepository {
  /** Receives a pinned public-network repository; private/authenticated sessions are never involved. */
  constructor(private readonly http = new PublicHttpRepository()) {
    super();
  }

  /** Bounds robots and page retrieval together to 25 seconds and stores text separately from formal listings. */
  async read(url: string): Promise<SourceDocumentResult> {
    const empty: SourceDocumentResult = {
      kind: "document",
      url,
      checkedAt: new Date().toISOString(),
      status: "unavailable",
      reason: null,
      text: null,
      fingerprint: null,
      posting: null,
      hostDelaySeconds: 2,
    };

    try {
      return await this.retrieve(url, empty);
    } catch (error) {
      const blocked =
        error instanceof Error && error.message === "source_address_blocked";
      return {
        ...empty,
        status: blocked ? "blocked" : "unavailable",
        reason: blocked ? "source_address_blocked" : "source_request_failed",
      };
    }
  }

  /** Requires a readable crawl policy before fetching content and refuses redirects, challenges and unsupported media. */
  private async retrieve(
    url: string,
    empty: SourceDocumentResult,
  ): Promise<SourceDocumentResult> {
    const signal = AbortSignal.timeout(25_000);
    const robotsUrl = new URL("/robots.txt", url).href;
    const robots = await this.http.read(robotsUrl, 512_000, signal);

    if (robots.status !== 200 && robots.status !== 404) {
      return {
        ...empty,
        status: "access_limited",
        reason: "crawl_policy_unavailable",
      };
    }

    if (
      robots.status === 200 &&
      !/^text\/plain(?:;|$)/i.test(robots.contentType)
    ) {
      return {
        ...empty,
        status: "access_limited",
        reason: "crawl_policy_unavailable",
      };
    }

    const policy = robotsParser(
      robotsUrl,
      robots.status === 404 ? "" : robots.body,
    );
    const crawlDelay = Math.max(2, policy.getCrawlDelay("ScoutAlert") ?? 2);

    if (policy.isAllowed(url, "ScoutAlert") !== true || crawlDelay > 5) {
      return {
        ...empty,
        status: "access_limited",
        reason:
          crawlDelay > 5
            ? "crawl_delay_exceeds_run_budget"
            : "crawl_policy_denied",
        hostDelaySeconds: Number.isFinite(crawlDelay) ? crawlDelay : 86_400,
      };
    }

    await delay(crawlDelay * 1_000, undefined, { signal });
    const response = await this.http.read(url, 2_000_000, signal);

    if (
      response.status !== 200 ||
      !/^(text\/html|application\/xhtml\+xml|text\/plain)(;|$)/i.test(
        response.contentType,
      )
    ) {
      return {
        ...empty,
        status: "access_limited",
        reason: "source_requires_another_access_path",
        hostDelaySeconds: crawlDelay,
      };
    }

    const text = documentText(response.body);
    const now = new Date();
    return {
      ...empty,
      checkedAt: now.toISOString(),
      status: "fetched",
      text,
      fingerprint: discoveryKey(text),
      posting: parseFormalPosting(response.body, url, now),
      hostDelaySeconds: crawlDelay,
      links: documentLinks(response.body, url),
    };
  }
}
