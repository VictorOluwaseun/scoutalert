import { DomUtils, parseDocument } from "htmlparser2";
import type { SourceDocumentResult } from "@repo/core/discovery";
import { discoveryKey } from "../persistence/discovery-identities.js";
import { documentText } from "./document-parser.js";
import { feedUrl } from "./document-feeds.js";

import { checkPublicXml } from "./public-xml.js";

type XmlElement = ReturnType<typeof DomUtils.getElementsByTagName>[number];
type FeedCapture = Pick<
  SourceDocumentResult,
  "text" | "fingerprint" | "feed" | "links" | "pagination"
>;

/** Recognizes XML feed responses even when a publisher serves a valid feed as plain text. */
export function isFeedDocument(contentType: string, body: string): boolean {
  return (
    /^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu.test(
      contentType,
    ) || /^\s*(?:<\?xml[^?]*\?>\s*)?<(?:rss|feed)(?:\s|>)/u.test(body)
  );
}

/** Parses a bounded RSS 2.0 or Atom window as link hints; no collection, description, enclosure or GUID becomes a posting. */
export function parseFeedDocument(body: string, source: string): FeedCapture {
  checkPublicXml(body, "feed");
  const tree = parseDocument(body, { xmlMode: true });
  const roots = tree.children.filter(
    (node): node is XmlElement => node.type === "tag",
  );
  if (roots.length !== 1) {
    throw new Error("source_feed_invalid");
  }
  const root = roots[0]!;
  const atom =
    root.name === "feed" &&
    root.attribs.xmlns === "http://www.w3.org/2005/Atom";
  const channels = children(root, "channel");
  if (
    !atom &&
    !(
      root.name === "rss" &&
      root.attribs.version === "2.0" &&
      channels.length === 1
    )
  ) {
    throw new Error("source_feed_unsupported");
  }
  const container = atom ? root : channels[0]!;
  const entries = children(container, atom ? "entry" : "item");
  const title = plain(value(container, "title"), 300) || "Untitled public feed";
  const unique = new Map<string, string>();
  for (const entry of entries) {
    const url = entryUrl(entry, atom, source);
    const text = plain(
      value(entry, "title") || value(entry, atom ? "summary" : "description"),
      300,
    );
    if (
      !url ||
      url === source ||
      !text ||
      unique.has(url) ||
      unique.size >= 80
    ) {
      continue;
    }
    unique.set(url, text);
  }
  const links = [...unique].map(([url, text]) => ({ url, text }));
  const next = nextPages(container, atom, source);
  const feed = {
    format: atom ? ("atom" as const) : ("rss" as const),
    title,
    entries: entries.length,
    omitted: entries.length - links.length,
  };
  // This small display window is not entry evidence. Structural directory review never extracts personal-fit facts from it.
  const text = [
    `Feed directory: ${title}`,
    "Entries are unassessed links. Each source page needs a separate check.",
    `Observed ${feed.entries} entries; retained ${links.length} unique readable links; omitted ${feed.omitted}.`,
    ...links.map((link) => link.text.slice(0, 100)),
  ].join("\n");
  return {
    feed,
    text,
    links,
    fingerprint: discoveryKey(["public-feed-v1", feed, links, next]),
    pagination: { next, contentFingerprint: discoveryKey(links) },
  };
}

/** Reads only direct children, preventing embedded markup from impersonating entry or feed metadata. */
function children(node: XmlElement, name: string): XmlElement[] {
  return DomUtils.getElementsByTagName(name, node.children, false);
}

/** Returns one direct text field; markup is converted to inert text separately. */
function value(node: XmlElement, name: string): string {
  return DomUtils.textContent(children(node, name)[0] ?? []).trim();
}

/** Resolves XML base inheritance using observed values; final URL policy still rejects credentials and non-public protocols. */
function baseUrl(node: XmlElement, source: string): string {
  const bases: string[] = [];
  let current: XmlElement | null = node;
  while (current) {
    if (current.attribs["xml:base"]) {
      bases.unshift(current.attribs["xml:base"]!);
    }
    current = current.parent?.type === "tag" ? current.parent : null;
  }
  try {
    return bases.reduce(
      (base, relative) => new URL(relative, base).href,
      source,
    );
  } catch {
    return "invalid:";
  }
}

/** Selects an actual HTML alternate, never the first Atom link (which may be an enclosure or API self link). */
function entryUrl(
  entry: XmlElement,
  atom: boolean,
  source: string,
): string | null {
  const link = children(entry, "link").find(
    (node) =>
      !atom ||
      ((node.attribs.rel ?? "alternate") === "alternate" &&
        (!node.attribs.type ||
          /^(?:text\/html|application\/xhtml\+xml)$/iu.test(
            node.attribs.type,
          ))),
  );
  if (!link) {
    return null;
  }
  return feedUrl(
    atom ? link.attribs.href : DomUtils.textContent(link).trim(),
    baseUrl(link, source),
  );
}

/** Admits at most two observed same-origin next links; existing document/page/depth budgets handle continuation. */
function nextPages(
  container: XmlElement,
  atom: boolean,
  source: string,
): string[] {
  const names = atom ? ["link"] : ["atom:link"];
  const urls = names
    .flatMap((name) => children(container, name))
    .filter((node) => node.attribs.rel === "next")
    .map((node) => feedUrl(node.attribs.href, baseUrl(node, source)))
    .filter(
      (url): url is string =>
        !!url &&
        url !== source &&
        new URL(url).origin === new URL(source).origin,
    );
  return [...new Set(urls)].slice(0, 2);
}

/** Strips embedded HTML and bounds display hints without loading images, enclosures or linked content. */
function plain(text: string, maximum: number): string {
  return documentText(text).replace(/\s+/gu, " ").trim().slice(0, maximum);
}
