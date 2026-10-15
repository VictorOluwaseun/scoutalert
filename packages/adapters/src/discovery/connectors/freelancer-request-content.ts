import { DomUtils, parseDocument } from "htmlparser2";
import { canonicalDiscoveryUrl } from "../persistence/discovery-identities.js";
import {
  withClass,
  explicitlyClosed,
  hidden,
  sectionText,
  type Element,
  type BuyerRequestContent,
} from "./buyer-request-markup.js";

/** Extracts the complete server-rendered buyer brief from recognized public project pages. This does not execute scripts, use embedded private state, or imply bidder/applicant eligibility. */
export function freelancerRequestContent(
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
    parser: "freelancer-public-html-v1",
  };
  const dom = parseDocument(html, { withEndIndices: true });
  const main = DomUtils.getElementsByTagName(
    "app-project-view-logged-out-main",
    dom,
  );
  const canonical = DomUtils.findAll(
    (node) =>
      node.name === "link" && node.attribs.rel?.toLowerCase() === "canonical",
    dom,
  );
  if (
    main.length !== 1 ||
    canonical.length !== 1 ||
    projectUrl(canonical[0]!.attribs.href ?? "") !== url ||
    !explicitlyClosed(main[0]!, html)
  ) {
    return incomplete;
  }
  const root = main[0]!;
  const heading = withClass(root, "Project-heading");
  const description = withClass(root, "Project-description");
  const about = DomUtils.getElementsByTagName(
    "app-project-view-logged-out-about",
    root,
  );
  const identity = DomUtils.findAll(
    (node) =>
      node.name === "p" &&
      /^Project ID:\s*\d{1,16}$/u.test(DomUtils.textContent(node).trim()),
    root,
  );
  if (
    heading.length !== 1 ||
    description.length !== 1 ||
    about.length !== 1 ||
    identity.length !== 1
  ) {
    return incomplete;
  }
  const skills = skillSection(description[0]!);
  const sections = [
    heading[0]!,
    description[0]!,
    ...(skills ? [skills] : []),
    identity[0]!,
    about[0]!,
  ];
  const titles = DomUtils.getElementsByTagName("h1", heading[0]!);
  const headerText = sectionText(heading[0]!);
  const body = sectionText(description[0]!);
  if (
    titles.length !== 1 ||
    !DomUtils.textContent(titles[0]!).trim() ||
    body.length < 40 ||
    !/\b(?:Open|Closed|Completed|Cancelled|Canceled|Awarded)\b/u.test(
      headerText,
    ) ||
    sections.some(
      (section) => hidden(section) || !explicitlyClosed(section, html),
    )
  ) {
    return incomplete;
  }
  const text = sections
    .map((section) =>
      section === skills
        ? `Listed skills: ${sectionText(section)}`
        : sectionText(section),
    )
    .join("\n\n");
  const complete = text.length < 48_000 && Buffer.byteLength(text) < 48_000;
  return {
    text: complete ? text : text.slice(0, 48_000),
    complete,
    reason: complete ? null : "buyer_brief_too_large",
    parser: "freelancer-public-html-v1",
  };
}

/** Includes only skill tags immediately following the buyer description, never matching tags elsewhere in bidder profiles. */
function skillSection(description: Element): Element | null {
  const sibling = DomUtils.nextElementSibling(description);
  if (!sibling || sibling.name !== "div") {
    return null;
  }
  const children = sibling.children.filter(
    (node): node is Element => "attribs" in node,
  );
  return children.length > 0 &&
    children.every(
      (node) =>
        node.name === "fl-tag" &&
        node.attribs.fltrackinglabel === "ProjectViewLoggedOut-SkillTag",
    )
    ? sibling
    : null;
}

/** Admits only public project-detail identities; tracking and fragments cannot redirect extraction into account or search pages. */
function projectUrl(value: string): string | null {
  const canonical = canonicalDiscoveryUrl(value);
  if (!canonical) {
    return null;
  }
  const url = new URL(canonical);
  return ["www.freelancer.com", "freelancer.com"].includes(url.hostname) &&
    !url.search &&
    /^\/projects\/[a-z0-9_-]+\/[a-z0-9_-]+\/?$/iu.test(url.pathname)
    ? `https://www.freelancer.com${url.pathname.replace(/\/$/u, "")}`
    : null;
}
