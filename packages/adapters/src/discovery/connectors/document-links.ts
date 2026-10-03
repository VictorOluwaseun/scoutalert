import { Parser } from "htmlparser2";
import { canonicalDiscoveryUrl } from "../persistence/discovery-identities.js";

/** Captures at most 80 unique, visible HTTPS anchors without trusting base tags, executing scripts, or following links. */
export function documentLinks(
  html: string,
  source: string,
): { url: string; text: string }[] {
  const links = new Map<string, string>();
  const hidden: boolean[] = [];
  let anchor: { url: string; text: string } | null = null;
  const parser = new Parser({
    /** Tracks inert/boilerplate subtrees and starts only visible anchor captures. */
    onopentag(name, attributes) {
      const excluded =
        !!hidden.at(-1) ||
        ["script", "style", "nav", "footer", "header", "form"].includes(name) ||
        attributes.hidden !== undefined ||
        attributes["aria-hidden"] === "true";
      hidden.push(excluded);
      if (name !== "a" || excluded || !attributes.href || links.size >= 80) {
        return;
      }
      try {
        const url = canonicalDiscoveryUrl(
          new URL(attributes.href, source).href,
        );
        anchor =
          url && url !== canonicalDiscoveryUrl(source)
            ? { url, text: "" }
            : null;
      } catch {
        anchor = null;
      }
    },
    /** Retains bounded human-visible link wording as a routing hint, never an instruction. */
    ontext(text) {
      if (anchor && !hidden.at(-1)) {
        anchor.text = `${anchor.text}${text}`.slice(0, 300);
      }
    },
    /** Finalizes the anchor and unwinds the visibility stack, including parser-generated closing tags. */
    onclosetag(name) {
      if (name === "a" && anchor) {
        const text = anchor.text.replace(/\s+/gu, " ").trim();
        links.set(anchor.url, links.get(anchor.url) || text);
        anchor = null;
      }
      hidden.pop();
    },
  });
  parser.end(html);
  return [...links].map(([url, text]) => ({ url, text }));
}
