import {
  SourceDocumentRepository,
  type SourceDocumentResult,
} from "@repo/core/discovery";
import { PublicHttpRepository } from "./public-http.js";
import { PublicPageSession } from "./public-page-session.js";
import { BrowserDocumentRepository } from "./browser-document.js";
import { documentText, parseFormalPosting } from "./document-parser.js";
import { documentPagination } from "./document-pagination.js";
import { documentLinks } from "./document-links.js";
import { documentSearchForms } from "./document-search-forms.js";
import { documentFeeds } from "./document-feeds.js";
import { isFeedDocument, parseFeedDocument } from "./feed-document.js";
import { discoveryKey } from "../persistence/discovery-identities.js";

/** Reads permitted public pages, escalating thin JavaScript shells to an optional bounded browser repository. */
export class PublicSourceDocumentRepository extends SourceDocumentRepository {
  /** Receives network and rendering repositories from composition; authenticated sessions are never involved. */
  constructor(
    private readonly http = new PublicHttpRepository(),
    private readonly browser: BrowserDocumentRepository | null = null,
  ) {
    super();
  }

  /** Bounds the complete page bundle to 25 seconds; failed rendering remains explicit and cannot publish a listing. */
  async read(url: string): Promise<SourceDocumentResult> {
    const session = new PublicPageSession(
      this.http,
      AbortSignal.timeout(25_000),
    );
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
      return await this.retrieve(url, empty, session);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "source_request_failed";
      const known = [
        "source_address_blocked",
        "crawl_policy_unavailable",
        "crawl_policy_denied",
        "crawl_delay_exceeds_run_budget",
        "source_bundle_limit",
        "source_feed_invalid",
        "source_feed_unsupported",
        "source_feed_limit",
      ];
      return {
        ...empty,
        status:
          reason === "source_address_blocked" ? "blocked" : "access_limited",
        reason: known.includes(reason) ? reason : "source_request_failed",
        hostDelaySeconds: session.hostDelaySeconds,
        capture: {
          method: "http",
          requests: session.requests,
          bytes: session.bytes,
          complete: false,
        },
      };
    } finally {
      session.close();
    }
  }

  /** Preserves the fast HTML path, observed form controls and source identity; browser failures keep only incomplete evidence. */
  private async retrieve(
    url: string,
    empty: SourceDocumentResult,
    session: PublicPageSession,
  ): Promise<SourceDocumentResult> {
    const response = await session.read(url);
    if (
      response.status === 200 &&
      isFeedDocument(response.contentType, response.body)
    ) {
      return {
        ...empty,
        ...parseFeedDocument(response.body, url),
        checkedAt: new Date().toISOString(),
        status: "fetched",
        truncated: false,
        hostDelaySeconds: session.hostDelaySeconds,
        capture: {
          method: "http",
          requests: session.requests,
          bytes: session.bytes,
          complete: true,
        },
      };
    }
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
        hostDelaySeconds: session.hostDelaySeconds,
        capture: {
          method: "http",
          requests: session.requests,
          bytes: session.bytes,
          complete: false,
        },
      };
    }
    let html = response.body;
    let text = documentText(html);
    let reason: string | null =
      text.length >= 64_000 ? "source_text_truncated" : null;
    let method: "http" | "browser" = "http";
    const dynamic = needsBrowser(html, text, url);
    if (dynamic && !this.browser) {
      reason = "browser_rendering_disabled";
    }
    if (dynamic && this.browser) {
      method = "browser";
      const rendered = await this.browser
        .render(url, response, session)
        .catch(() => null);
      html = rendered?.html ?? html;
      text = rendered?.text ?? text;
      reason = rendered
        ? (rendered.reason ??
          (rendered.complete ? null : "browser_capture_incomplete"))
        : "browser_render_failed";
    }
    const links = documentLinks(html, url);
    const feeds = documentFeeds(html, url);
    const searchForms = documentSearchForms(html, url);
    const next = documentPagination(html, url);
    const items = links.filter((link) => !next.includes(link.url));
    const pagination = {
      next,
      contentFingerprint: discoveryKey(items.length ? items : text),
    };
    const now = new Date();
    return {
      ...empty,
      checkedAt: now.toISOString(),
      status: "fetched",
      text,
      reason,
      fingerprint: discoveryKey([
        "public-capture-v5",
        text,
        links,
        searchForms,
        next,
        feeds,
        reason,
      ]),
      posting: reason ? null : parseFormalPosting(html, url, now),
      truncated: reason !== null,
      hostDelaySeconds: session.hostDelaySeconds,
      links,
      feeds,
      searchForms,
      pagination,
      capture: {
        method,
        requests: session.requests,
        bytes: session.bytes,
        complete: reason === null,
      },
    };
  }
}

/** Renders executable shells with little useful content; full HTML listings and ordinary pages keep the inexpensive path. */
export function needsBrowser(html: string, text: string, url: string): boolean {
  const executable =
    /<script\b(?![^>]*type\s*=\s*["']application\/(?:ld\+json|json)["'])[^>]*>/iu.test(
      html,
    );
  const usefulLinks = documentLinks(html, url).filter(
    (link) =>
      !/^(?:log.?in|sign.?in|home|next|previous|back)(?:\s|$)/iu.test(
        link.text,
      ) && new URL(link.url).pathname !== "/",
  );
  return (
    executable &&
    !parseFormalPosting(html, url, new Date()) &&
    (/\b(?:enable|requires?) javascript\b/iu.test(text) ||
      (text.length < 1200 && usefulLinks.length < 2))
  );
}
