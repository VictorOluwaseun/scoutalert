import type { SearchDraft } from "../../onboarding/domain/search-draft.js";
import type { Assessment, Posting } from "./discovery.js";

const aliases: Record<string, string> = {
  designer: "design",
  designing: "design",
  engineer: "engineering",
  developer: "development",
  developers: "development",
};
const ignored = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "role",
  "roles",
  "job",
  "jobs",
  "remote",
  "work",
]);

/** Extracts bounded whole-word role terms; Java does not silently become JavaScript. */
export function roleTerms(target: string): string[] {
  return [
    ...new Set(
      (target.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
        .filter((term) => !ignored.has(term))
        .map((term) => aliases[term] ?? term),
    ),
  ].slice(0, 12);
}

/** Requires a role phrase in the job title's primary segment, excluding incidental department references. */
function hasRolePhrase(wanted: string[], title: string): boolean {
  const primary = title.split(/\s[-–—|]\s/u)[0] ?? title;
  const terms = roleTerms(primary);

  return terms.some((_, index) =>
    wanted.every((term, offset) => terms[index + offset] === term),
  );
}

/** Uses source evidence conservatively; location and remote wording do not prove applicant eligibility. */
export function assessPosting(
  search: SearchDraft,
  posting: Posting,
): Assessment | null {
  // General web demand requires personal evidence assessment; title fallback cannot publish it.
  if (["web-discovery", "web-client-requests"].includes(posting.source)) {
    return null;
  }

  const clientRequest = posting.kind === "client_request";

  if ((search.category === "services") !== clientRequest) {
    return null;
  }

  const wanted = roleTerms(search.target);

  if (
    !wanted.length ||
    !(clientRequest
      ? wanted.every((term) => roleTerms(posting.title).includes(term))
      : hasRolePhrase(wanted, posting.title))
  ) {
    return null;
  }

  const contract = /\b(contract|contractor|freelance|freelancer)\b/i.test(
    posting.title,
  );

  if (search.category === "contracts" && !contract) {
    return null;
  }

  if (search.category === "employment" && contract) {
    return null;
  }

  // Greenhouse board responses do not establish work authorization or an explicit pay period.
  if (
    search.unknownEligibility === "exclude" ||
    search.undisclosedPay === "exclude"
  ) {
    return null;
  }

  const place = `${posting.title} ${posting.location}`;
  const arrangement = /\bhybrid\b/i.test(place)
    ? "hybrid"
    : /\bremote\b/i.test(place)
      ? "remote"
      : /\bon[- ]?site\b/i.test(place)
        ? "onsite"
        : "unknown";

  if (search.arrangementRequired && arrangement !== search.arrangement) {
    return null;
  }

  const uncertainties = [
    "Applicant location and work authorization need confirmation.",
    clientRequest
      ? "The listed budget is not guaranteed earnings; check scope, fees and payment terms."
      : "Pay amount, currency, and period have not been verified.",
    "Experience and detailed requirements still need review.",
  ];

  if (arrangement === "unknown") {
    uncertainties.push(
      "Work arrangement is not clear in the posting title or location.",
    );
  }

  if (search.workLocations) {
    uncertainties.push(
      `Check whether this role accepts applicants in ${search.workLocations}.`,
    );
  }

  const reasons = [`The posting title matches your target: ${search.target}.`];

  if (arrangement !== "unknown") {
    reasons.push(`The source title or location describes ${arrangement} work.`);
  }

  return {
    policy: "evidence-v1",
    reasons,
    uncertainties,
    rank: wanted.length + (arrangement === search.arrangement ? 2 : 0),
  };
}
