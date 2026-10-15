import { DomUtils, parseDocument } from "htmlparser2";
import { canonicalDiscoveryUrl } from "../persistence/discovery-identities.js";
import {
  explicitlyClosed,
  hidden,
  sectionText,
  withClass,
  type BuyerRequestContent,
  type Element,
} from "./buyer-request-markup.js";

/** Captures public PeoplePerHour buyer scope and platform status, excluding proposal writers, profiles and clarification questions. */
export function peoplePerHourRequestContent(
  html: string,
  destination: string,
): BuyerRequestContent | null {
  const url = projectUrl(destination);
  if (!url) {
    return null;
  }
  const incomplete: BuyerRequestContent = {
    text: null,
    complete: false,
    reason: "buyer_brief_structure_unrecognized",
    parser: "peopleperhour-public-html-v2",
  };
  const dom = parseDocument(html, { withEndIndices: true });
  const canonical = DomUtils.findAll(
    (node) => node.name === "link" && node.attribs.rel === "canonical",
    dom,
  );
  const roots = DomUtils.findAll(
    (node) =>
      ["main-content", "controller-job", "action-view"].every((token) =>
        (node.attribs.class ?? "").split(/\s+/u).includes(token),
      ),
    dom,
  );
  if (
    canonical.length !== 1 ||
    projectUrl(canonical[0]!.attribs.href ?? "") !== url ||
    roots.length !== 1 ||
    hidden(roots[0]!) ||
    !explicitlyClosed(roots[0]!, html)
  ) {
    return incomplete;
  }
  const root = roots[0]!;
  const moderated = withClass(root, "view-moderated");
  if (moderated.length === 1) {
    const text = sectionText(moderated[0]!);
    return /\b(?:project has been cancell?ed|project is no longer available)\b/iu.test(
      text,
    )
      ? capture([moderated[0]!], html, incomplete)
      : incomplete;
  }
  const headers = root.children.filter(
    (node): node is Element => "name" in node && node.name === "header",
  );
  const descriptions = withClass(root, "project-description");
  const levels = withClass(root, "description-experience-level");
  if (
    headers.length !== 1 ||
    descriptions.length !== 1 ||
    levels.length !== 1
  ) {
    return incomplete;
  }
  const header = headers[0]!;
  const titles = DomUtils.getElementsByTagName("h1", header);
  const statuses = withClass(header, "job-status");
  const id = url.match(/-(\d+)$/u)![1]!;
  if (
    titles.length !== 1 ||
    !DomUtils.textContent(titles[0]!).trim() ||
    statuses.length !== 1 ||
    !/\b(?:Open for Proposals|Expired|Closed|Awarded|Cancell?ed|In Progress)\b/iu.test(
      sectionText(statuses[0]!),
    ) ||
    !new RegExp(`#${id}\\b`, "u").test(sectionText(header)) ||
    sectionText(descriptions[0]!).length < 40
  ) {
    return incomplete;
  }
  return capture([header, levels[0]!, descriptions[0]!], html, incomplete);
}

/** Admits only public numeric project identities; collections, profiles and query routes retain their generic behavior. */
function projectUrl(value: string): string | null {
  const canonical = canonicalDiscoveryUrl(value);
  if (!canonical) {
    return null;
  }
  const url = new URL(canonical);
  return ["www.peopleperhour.com", "peopleperhour.com"].includes(
    url.hostname,
  ) &&
    !url.search &&
    /^\/freelance-jobs\/(?:[a-z0-9-]+\/)*[a-z0-9-]+-\d+\/?$/iu.test(
      url.pathname,
    )
    ? `https://www.peopleperhour.com${url.pathname.replace(/\/$/u, "")}`
    : null;
}

/** Requires visible, explicitly closed source sections and the same byte/text ceiling used for other primary buyer briefs. */
function capture(
  sections: Element[],
  html: string,
  incomplete: BuyerRequestContent,
): BuyerRequestContent {
  if (sections.some((node) => hidden(node) || !explicitlyClosed(node, html))) {
    return incomplete;
  }
  // Preserve the unit beside its counter so evidence passages cannot split a two-digit number from its meaning.
  const text = sections
    .map(sectionText)
    .join("\n\n")
    .replace(/\bEnds in\s*\(days\)\s*(\d+)\b/giu, "Ends in $1 days");
  const complete = text.length < 48_000 && Buffer.byteLength(text) < 48_000;
  return {
    ...incomplete,
    text: complete ? text : text.slice(0, 48_000),
    complete,
    reason: complete ? null : "buyer_brief_too_large",
  };
}
