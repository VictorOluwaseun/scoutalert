import { Parser } from "htmlparser2";
import { canonicalDiscoveryUrl } from "../persistence/discovery-identities.js";

/** Resolves an observed public feed destination; credential-bearing subscription URLs never enter shared discovery. */
export function feedUrl(
  value: string | undefined,
  base: string,
): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value, base);
    const credential = [...url.searchParams.keys()].some((name) =>
      /^(?:access_?token|token|auth|authorization|api_?key|key|secret|signature|password|code)$/iu.test(
        name,
      ),
    );
    return credential ? null : canonicalDiscoveryUrl(url.href);
  } catch {
    return null;
  }
}

/** Reads up to four explicit RSS/Atom advertisements in the HTML head; base tags and guessed /feed paths are ignored. */
export function documentFeeds(
  html: string,
  source: string,
): { url: string; text: string }[] {
  const feeds = new Map<string, string>();
  let head = false;
  let hidden = 0;
  const parser = new Parser({
    /** Restricts discovery to typed alternate links in the real head, outside inert templates. */
    onopentag(name, attributes) {
      if (name === "head") {
        head = true;
      }
      if (["template", "noscript"].includes(name)) {
        hidden++;
      }
      if (
        !head ||
        hidden ||
        name !== "link" ||
        feeds.size >= 4 ||
        !attributes.rel?.toLowerCase().split(/\s+/u).includes("alternate") ||
        !/^(?:application\/rss\+xml|application\/atom\+xml)$/iu.test(
          attributes.type ?? "",
        )
      ) {
        return;
      }
      const url = feedUrl(attributes.href, source);
      if (url && url !== canonicalDiscoveryUrl(source)) {
        feeds.set(
          url,
          (attributes.title?.trim() || "Public listing feed").slice(0, 300),
        );
      }
    },
    /** Restores head/template state without reading body anchors as metadata. */
    onclosetag(name) {
      if (name === "head") {
        head = false;
      }
      if (["template", "noscript"].includes(name)) {
        hidden = Math.max(0, hidden - 1);
      }
    },
  });
  parser.end(html);
  return [...feeds].map(([url, text]) => ({ url, text }));
}
