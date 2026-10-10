import type { SourceDocumentResult } from "./contracts.js";

/** Page-specific failures leave separately observed paths eligible; unknown or host-wide failures stop same-host exploration. */
export function blocksSourceHost(document: SourceDocumentResult): boolean {
  if (document.status === "fetched") {
    return false;
  }
  return ![
    "crawl_policy_denied",
    "source_not_found",
    "source_media_unsupported",
    "source_feed_invalid",
    "source_feed_unsupported",
    "source_feed_limit",
    "source_sitemap_invalid",
    "source_sitemap_unsupported",
    "source_sitemap_limit",
    "source_redirect_loop",
    "source_redirect_limit",
    "source_redirect_invalid",
    "source_response_too_large",
  ].includes(document.reason ?? "");
}
