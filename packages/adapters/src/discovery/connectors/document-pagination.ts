import { Parser } from "htmlparser2";
import { canonicalDiscoveryUrl } from "../persistence/discovery-identities.js";

/** Retains at most two same-origin next-page destinations declared by links or explicit next-page anchor labels. */
export function documentPagination(html: string, source: string): string[] {
  const next = new Set<string>();
  const hidden: boolean[] = [];
  let anchor: {
    url: string;
    label: string;
    labelled: boolean;
    next: boolean;
  } | null = null;
  const parser = new Parser({
    /** Pagination may live inside nav, while hidden content, scripts and forms remain excluded. */
    onopentag(name, attributes) {
      const excluded =
        !!hidden.at(-1) ||
        ["script", "style", "form"].includes(name) ||
        attributes.hidden !== undefined ||
        attributes["aria-hidden"] === "true" ||
        attributes["aria-disabled"] === "true" ||
        /(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(
          attributes.style ?? "",
        );
      hidden.push(excluded);
      if (
        excluded ||
        !["a", "link"].includes(name) ||
        !attributes.href ||
        next.size >= 2
      ) {
        return;
      }
      const url = nextDestination(attributes.href, source);
      if (!url) {
        return;
      }
      const declared = (attributes.rel ?? "")
        .toLowerCase()
        .split(/\s+/u)
        .includes("next");
      if (name === "link" && declared) {
        next.add(url);
        return;
      }
      if (name === "a") {
        anchor = {
          url,
          next: declared,
          label: attributes["aria-label"] ?? "",
          labelled: !!attributes["aria-label"],
        };
      }
    },
    /** Visible wording is a routing hint; it never becomes a model instruction or a synthesized URL. */
    ontext(text) {
      if (anchor && !anchor.labelled && !hidden.at(-1)) {
        anchor.label = `${anchor.label} ${text}`.slice(0, 200);
      }
    },
    /** Emits explicit next controls and ignores page-number guesses, previous links and arbitrary load actions. */
    onclosetag(name) {
      if (
        name === "a" &&
        anchor &&
        (anchor.next ||
          /^(?:next(?:\s+(?:page|results))?|older\s+(?:jobs|projects|requests|posts))\s*[›»→]?$/iu.test(
            anchor.label.trim(),
          ))
      ) {
        next.add(anchor.url);
      }
      if (name === "a") {
        anchor = null;
      }
      hidden.pop();
    },
  });
  parser.end(html);
  return [...next].slice(0, 2);
}

/** Resolves against the observed page rather than untrusted base markup and excludes account/action destinations. */
function nextDestination(value: string, source: string): string | null {
  try {
    const url = new URL(value, source);
    if (
      url.origin !== new URL(source).origin ||
      /(?:login|logout|delete|subscribe|application|checkout)/iu.test(
        url.pathname,
      )
    ) {
      return null;
    }
    const canonical = canonicalDiscoveryUrl(url.href);
    return canonical !== canonicalDiscoveryUrl(source) ? canonical : null;
  } catch {
    return null;
  }
}
