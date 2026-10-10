const messages: Record<string, string> = {
  source_authentication_required:
    "This page requires sign-in. Its contents have not been checked.",
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
