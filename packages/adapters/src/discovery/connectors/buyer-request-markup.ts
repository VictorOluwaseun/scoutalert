import { DomUtils } from "htmlparser2";
import { documentText } from "./document-parser.js";

export type Element = ReturnType<typeof DomUtils.getElementsByTagName>[number];

/** A bounded primary buyer section; missing structure never grants source provenance to surrounding seller content. */
export interface BuyerRequestContent {
  text: string | null;
  complete: boolean;
  reason: string | null;
  parser: string;
  /** Explicit platform closure from a complete primary section; absence makes no availability claim. */
  availability?: "closed";
}

/** Uses complete class tokens, not substring matches that could accidentally select bidder or preview markup. */
export function withClass(root: Element, name: string): Element[] {
  return DomUtils.findAll(
    (node) => (node.attribs.class ?? "").split(/\s+/u).includes(name),
    root,
  );
}

/** Requires explicit source closing markup so a cut-off HTTP body cannot be repaired into a seemingly complete buyer section. */
export function explicitlyClosed(node: Element, html: string): boolean {
  const close = `</${node.name}>`;
  return (
    node.endIndex !== null &&
    html
      .slice(node.endIndex - close.length + 1, node.endIndex + 1)
      .toLowerCase() === close
  );
}

/** Rejects hidden primary sections or hidden ancestors; visibility is never inferred from hydration state. */
export function hidden(node: Element): boolean {
  let current = node;
  while (current) {
    if (
      "hidden" in current.attribs ||
      current.attribs["aria-hidden"] === "true" ||
      /(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(
        current.attribs.style ?? "",
      )
    ) {
      return true;
    }
    const parent = current.parent;
    if (!parent || !("attribs" in parent)) {
      return false;
    }
    current = parent;
  }
  return false;
}

/** Converts only platform-owned primary sections to inert text; bids, profiles and related listings never enter the assessment body. */
export function sectionText(node: Element): string {
  return documentText(DomUtils.getOuterHTML(node));
}
