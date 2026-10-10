import { DomUtils, parseDocument } from "htmlparser2";
import type { SourceDocumentResult } from "@repo/core/discovery";
import { discoveryKey } from "../persistence/discovery-identities.js";
import { feedUrl } from "./document-feeds.js";
import { checkPublicXml } from "./public-xml.js";

type Element = ReturnType<typeof DomUtils.getElementsByTagName>[number];
const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
const listing =
  /(?:^|[/_-])(?:jobs?|careers?|positions?|projects?|requests?|opportunities|tenders?)(?:[/_.-]|$)/iu;

/** Recognizes the first element only, allowing declarations/comments but never a sitemap embedded in another document. */
export function isSitemapDocument(body: string): boolean {
  const leading = body.replace(
    /^\s*(?:(?:<\?xml[^?]*\?>|<!--[\s\S]*?-->)\s*)*/u,
    "",
  );
  return /^<(?:[\w.-]+:)?(?:urlset|sitemapindex)(?:\s|>)/u.test(leading);
}

/** Keeps a bounded same-origin URL window from structural XML; dates and priorities never establish listing facts. */
export function parseSitemapDocument(
  body: string,
  source: string,
): Pick<SourceDocumentResult, "text" | "fingerprint" | "sitemap" | "links"> {
  checkPublicXml(body, "sitemap");
  const roots = parseDocument(body, { xmlMode: true }).children.filter(
    (node): node is Element => node.type === "tag",
  );
  const root = roots[0];
  if (roots.length !== 1 || !root || !inNamespace(root)) {
    throw new Error("source_sitemap_invalid");
  }
  const index = localName(root) === "sitemapindex";
  if (!index && localName(root) !== "urlset") {
    throw new Error("source_sitemap_unsupported");
  }
  const entries = children(root, index ? "sitemap" : "url");
  const unique = new Map<string, { url: string; text: string }>();
  for (const entry of entries) {
    const locations = children(entry, "loc");
    const value =
      locations.length === 1 ? DomUtils.textContent(locations[0]!).trim() : "";
    const url = /^https:\/\//u.test(value) ? feedUrl(value, source) : null;
    if (
      !url ||
      url === source ||
      new URL(url).origin !== new URL(source).origin ||
      unique.has(url)
    ) {
      continue;
    }
    unique.set(url, {
      url,
      text: `${index ? "Sitemap" : "Unassessed page"}: ${pathHint(url)}`,
    });
  }
  const links = [...unique.values()]
    .sort((a, b) => routingPriority(b.url) - routingPriority(a.url))
    .slice(0, 80);
  const sitemap = {
    format: index ? ("index" as const) : ("urlset" as const),
    entries: entries.length,
    omitted: entries.length - links.length,
  };
  return {
    sitemap,
    links,
    text: [
      `Sitemap directory: ${index ? "sitemap index" : "page URLs"}`,
      "Entries are unassessed links. Each source page needs a separate check.",
      `Observed ${sitemap.entries} entries; retained ${links.length} unique same-origin links; omitted ${sitemap.omitted}.`,
      ...links.map((link) => link.text.slice(0, 100)),
    ].join("\n"),
    fingerprint: discoveryKey(["public-sitemap-v1", sitemap, links]),
  };
}

/** Supplies routing context from the observed path, without inventing a title or opportunity claim. */
function pathHint(url: string): string {
  const path = new URL(url).pathname;
  try {
    return decodeURIComponent(path).replace(/[-_]/gu, " ").slice(0, 300);
  } catch {
    return path.slice(0, 300);
  }
}

/** Resolves the declared XML namespace through parents, excluding extension elements that imitate sitemap fields. */
function inNamespace(node: Element): boolean {
  const prefix = node.name.includes(":") ? node.name.split(":")[0]! : "";
  const attribute = prefix ? `xmlns:${prefix}` : "xmlns";
  let current: Element | null = node;
  while (current) {
    const declared = current.attribs[attribute];
    if (declared !== undefined) {
      return declared === namespace;
    }
    current = current.parent?.type === "tag" ? current.parent : null;
  }
  return false;
}

/** Removes only the namespace prefix when interpreting a validated sitemap element. */
function localName(node: Element): string {
  return node.name.split(":").at(-1)!;
}

/** Reads direct children in the sitemap namespace; nested extensions cannot inject listing destinations. */
function children(node: Element, name: string): Element[] {
  return node.children.filter(
    (child): child is Element =>
      child.type === "tag" && localName(child) === name && inNamespace(child),
  );
}

/** Prefers likely detail paths over category pages inside a bounded window; actual demand still needs source review. */
function routingPriority(url: string): number {
  const path = new URL(url).pathname;
  if (
    /\/(?:remote-jobs|jobs?|positions?|openings?|projects?|requests?|opportunities|tenders?)\/[^/]+/iu.test(
      path,
    )
  ) {
    return 2;
  }
  return listing.test(path) ? 1 : 0;
}
