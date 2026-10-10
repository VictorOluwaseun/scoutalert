import type { PublicResponse } from "./public-http.js";
import type { PublicPageSession } from "./public-page-session.js";
import { feedUrl } from "./document-feeds.js";

/** Follows at most three observed redirects; each hop gets fresh DNS admission, robots checks, pacing and bundle accounting. */
export async function readSourceResponse(
  session: PublicPageSession,
  url: string,
): Promise<{ response: PublicResponse; url: string }> {
  const visited = new Set<string>();
  let destination = url;
  for (let hop = 0; hop <= 3; hop++) {
    if (visited.has(destination)) {
      throw new Error("source_redirect_loop");
    }
    visited.add(destination);
    const response = await session.read(destination);
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, url: destination };
    }
    const location = response.headers?.location;
    const next =
      location && location.length <= 2048
        ? feedUrl(location, destination)
        : null;
    if (!next) {
      throw new Error("source_redirect_invalid");
    }
    destination = next;
  }
  throw new Error("source_redirect_limit");
}

/** Keeps access failures distinct from gone pages, throttling and unsupported formats; none establish posting closure. */
export function sourceResponseReason(response: PublicResponse): string {
  const statuses: Record<number, string> = {
    401: "source_authentication_required",
    403: "source_access_denied",
    404: "source_not_found",
    410: "source_not_found",
    429: "source_rate_limited",
  };
  if (statuses[response.status]) {
    return statuses[response.status]!;
  }
  if (response.status >= 500) {
    return "source_temporarily_unavailable";
  }
  return response.status === 200
    ? "source_media_unsupported"
    : "source_http_unavailable";
}
