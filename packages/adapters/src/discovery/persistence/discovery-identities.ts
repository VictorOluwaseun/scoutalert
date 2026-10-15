import { createHash } from "node:crypto";

/** Shared source-reader version invalidates old whole-page/failed-render cache entries without rewriting historical captures. */
export const PUBLIC_DOCUMENT_VERSION = "public-document-v10";

/** Stable public identity includes canonical semantic inputs rather than an account or profile. */
export function discoveryKey(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Removes only known tracking parameters; distinct paths and meaningful query variants remain distinct. */
export function canonicalDiscoveryUrl(value: string): string | null {
  try {
    const url = new URL(value);

    if (
      value.length > 2048 ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.includes(".") ||
      /(?:^|\.)(?:localhost|local|internal|test)$/i.test(url.hostname)
    ) {
      return null;
    }

    url.hash = "";

    const nativePost = /^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$/i.test(
      url.hostname,
    )
      ? /^\/(?:i|[A-Za-z0-9_]+)\/status\/(\d{1,25})(?:\/(?:photo|video)\/\d+)?\/?$/.exec(
          url.pathname,
        )
      : null;
    if (nativePost) {
      return `https://x.com/i/status/${nativePost[1]}`;
    }

    for (const name of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(name) || ["fbclid", "gclid"].includes(name)) {
        url.searchParams.delete(name);
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}
