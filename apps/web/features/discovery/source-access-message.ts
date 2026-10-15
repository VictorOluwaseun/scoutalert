const messages: Record<string, string> = {
  upwork_api_access_required:
    "Upwork requires approved API access for automated discovery. This listing has not been checked.",
  bluesky_context_incomplete:
    "This post depends on a reply or attachment that has not been fully checked.",
  bluesky_api_unavailable: "Bluesky’s public API could not return this post.",
  bluesky_post_unavailable:
    "This post is unavailable through Bluesky’s public API.",
  bluesky_capture_failed:
    "This post could not be captured reliably from Bluesky.",
  bluesky_identity_mismatch:
    "The returned Bluesky post did not match the requested author and post.",
  source_pdf_invalid: "This PDF could not be read reliably.",
  source_pdf_timeout: "This PDF exceeded the reading time limit.",
  source_pdf_page_limit: "This PDF exceeds the 50-page reading limit.",
  source_pdf_text_limit: "This PDF exceeds the text reading limit.",
  source_pdf_password_required:
    "This PDF requires a password. Its contents have not been checked.",
  source_pdf_ocr_required:
    "This PDF contains pages without extractable text and needs OCR before matching.",
  source_authentication_required:
    "This page requires sign-in. Its contents have not been checked.",
  source_details_require_sign_in:
    "We could read the summary, but the full request requires sign-in. It needs more evidence before matching.",
  buyer_brief_structure_unrecognized:
    "We could not separate the client’s full request from other content on this page. It needs another check.",
  buyer_brief_too_large:
    "The client’s request exceeds this check’s reading limit. It has not entered matching.",
  browser_resource_unavailable:
    "Part of this page could not load. The capture is incomplete and needs another check.",
  crawl_delay_exceeds_run_budget:
    "The site requires a longer wait between requests than this check allows. Its contents have not been checked.",
  source_access_denied: "This site refused access to the page.",
  crawl_policy_denied:
    "This site does not allow automated checks of this page.",
  crawl_policy_unavailable:
    "The site’s rules for automated access could not be read, so the page was not fetched.",
  source_not_found:
    "The page could not be found. This alone does not confirm that the opportunity has closed.",
  source_rate_limited:
    "The site asked us to slow down. This check is incomplete.",
  source_temporarily_unavailable: "The site returned a temporary error.",
  source_media_unsupported: "This page uses a format we cannot read yet.",
  source_redirect_invalid:
    "The page redirected to an address we could not safely follow.",
  source_redirect_loop:
    "The page’s redirects led back to an address already checked.",
  source_redirect_limit: "The page exceeded this check’s redirect limit.",
  source_response_too_large: "The page exceeded this check’s size limit.",
  source_sitemap_invalid:
    "The site’s page directory could not be read as a valid sitemap.",
  source_sitemap_limit:
    "The site’s sitemap exceeded this check’s reading limit.",
  source_feed_invalid: "The site’s feed could not be read.",
  source_encoding_invalid:
    "The site returned an unreadable compressed response.",
  source_encoding_unsupported:
    "The site used a compression format we cannot read yet.",
};

/** Presents only known access outcomes; raw infrastructure errors never become user-facing instructions. */
export function sourceAccessMessage(reason?: string | null): string | null {
  return reason ? (messages[reason] ?? null) : null;
}
