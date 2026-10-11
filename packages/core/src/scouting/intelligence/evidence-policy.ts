import { arrangementCriterion } from "./arrangement-policy.js";
import { experienceCriterion } from "./experience-policy.js";
import { researchText, validResearch } from "../research/employer-evidence.js";
import type { SearchDraft } from "../../onboarding/domain/search-draft.js";
import type { Assessment, Posting } from "../domain/discovery.js";
import {
  criterionNames,
  factNames,
  type FitCriterion,
  type PersonalFit,
  type PostingAnalysis,
} from "./contracts.js";

/** Stable evidence input: quotes must be present in the exact captured text, not model memory. */
export function postingEvidence(posting: Posting): string {
  return [posting.title, posting.location, posting.text]
    .filter(Boolean)
    .join("\n");
}

/** Collects only user-confirmed search values, excluding the account identity and email. */
export function briefEvidence(search: SearchDraft): string[] {
  return Object.values(search).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

/** Rejects fabricated quotes, unsupported certainty, and internally inconsistent compensation. */
export function validAnalysis(
  posting: Posting,
  analysis: PostingAnalysis,
): boolean {
  const text = `${postingEvidence(posting)}\n${researchText(analysis)}`;

  if (analysis.research && !validResearch(analysis.research)) {
    return false;
  }

  const factsValid = factNames.every((name) => {
    const fact = analysis.facts[name];

    return (
      fact &&
      fact.quotes.every(
        (quote) => quote.trim().length >= 3 && text.includes(quote),
      ) &&
      (fact.status === "unknown" || fact.quotes.length > 0)
    );
  });
  const { minimum, maximum, currency, period } = analysis.pay;
  const hasPay = minimum !== null || maximum !== null;

  if (!factsValid) {
    return false;
  }

  if (!hasPay) {
    return true;
  } // A currency/period may be stated while the amount remains unknown.

  if (analysis.facts.compensation.status !== "stated" || !currency || !period) {
    return false;
  }

  if (minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) {
    return false;
  }

  if (maximum !== null && (!Number.isFinite(maximum) || maximum < 0)) {
    return false;
  }

  return minimum === null || maximum === null || minimum <= maximum;
}

/** Validates all required criteria and both sides of the evidence trail before applying any business rule. */
export function validFit(
  posting: Posting,
  search: SearchDraft,
  fit: PersonalFit,
  analysis?: PostingAnalysis,
): boolean {
  const text = `${postingEvidence(posting)}\n${researchText(analysis)}`;
  const brief = briefEvidence(search);

  if (fit.criteria.length !== criterionNames.length) {
    return false;
  }

  if (
    new Set(fit.criteria.map((item) => item.criterion)).size !==
    criterionNames.length
  ) {
    return false;
  }

  return fit.criteria.every(
    (item) =>
      criterionNames.includes(item.criterion) &&
      item.quotes.every(
        (quote) => quote.trim().length >= 3 && text.includes(quote),
      ) &&
      item.briefQuotes.every(
        (quote) =>
          quote.length > 0 && brief.some((value) => value.includes(quote)),
      ) &&
      (item.status === "unknown" ||
        (item.quotes.length > 0 && item.briefQuotes.length > 0)),
  );
}

/** Enforces compensation arithmetic without model-generated exchange rates or guessed annual hours. */
function payCriterion(
  search: SearchDraft,
  analysis: PostingAnalysis,
  proposed: FitCriterion,
): FitCriterion {
  if (!search.minimumPay) {
    return proposed;
  }

  if (proposed.status === "unknown") {
    return proposed;
  }

  const pay = analysis.pay;
  const minimum = Number(search.minimumPay);

  if (
    analysis.facts.compensation.status !== "stated" ||
    pay.currency !== search.currency ||
    pay.period !== search.payPeriod ||
    !Number.isFinite(minimum)
  ) {
    return {
      ...proposed,
      status: "unknown",
      explanation:
        "Pay cannot yet be compared with your minimum in the same currency and period.",
    };
  }

  if (pay.maximum !== null && pay.maximum < minimum) {
    return {
      ...proposed,
      status: "conflicts",
      explanation: "The stated pay range is below your minimum.",
    };
  }

  if (pay.minimum !== null && pay.minimum >= minimum) {
    return {
      ...proposed,
      status: "meets",
      explanation:
        "The stated minimum pay meets your minimum in the same currency and period.",
    };
  }

  return {
    ...proposed,
    status: "unknown",
    explanation:
      "The range does not guarantee your minimum; the offered amount needs confirmation.",
  };
}

/** Unknowns and contradictions stay visible; a model cannot waive a confirmed must-have. */
export function assessPersonalFit(
  search: SearchDraft,
  analysis: PostingAnalysis,
  fit: PersonalFit,
): Assessment | null {
  const criteria = fit.criteria.map((item): FitCriterion => {
    if (item.criterion === "arrangement") {
      return arrangementCriterion(search, analysis, item);
    }

    if (item.criterion === "compensation") {
      return payCriterion(search, analysis, item);
    }

    if (item.criterion === "experience") {
      return experienceCriterion(search, analysis, item);
    }

    // A positive authorization comparison needs explicit, current user-declared details.
    if (
      item.criterion === "authorization" &&
      item.status === "meets" &&
      (!search.authorizationConfirmed ||
        !search.authorizationLocations?.trim() ||
        !search.sponsorshipNeed ||
        search.sponsorshipNeed === "unknown" ||
        (search.sponsorshipNeed === "needed" &&
          analysis.facts.sponsorship.status !== "stated"))
    ) {
      return {
        ...item,
        status: "unknown",
        explanation:
          "Your authorization details or the employer’s sponsorship requirements still need confirmation.",
      };
    }

    const factName = item.criterion;

    if (
      analysis.facts[factName].status !== "stated" &&
      item.status === "meets"
    ) {
      return {
        ...item,
        status: "unknown",
        explanation:
          "The posting does not provide clear, consistent evidence for this requirement.",
      };
    }

    return item;
  });
  const get = (name: FitCriterion["criterion"]) =>
    criteria.find((item) => item.criterion === name)!;

  if (get("role").status !== "meets" || get("category").status !== "meets") {
    return null;
  }

  if (
    get("location").status === "conflicts" ||
    get("authorization").status === "conflicts" ||
    get("experience").status === "conflicts"
  ) {
    return null;
  }

  if (search.arrangementRequired && get("arrangement").status !== "meets") {
    return null;
  }

  if (search.minimumPay && get("compensation").status === "conflicts") {
    return null;
  }

  if (
    search.unknownEligibility === "exclude" &&
    [get("location"), get("authorization")].some(
      (item) => item.status !== "meets",
    )
  ) {
    return null;
  }

  if (
    search.undisclosedPay === "exclude" &&
    analysis.facts.compensation.status !== "stated"
  ) {
    return null;
  }

  const reasons = criteria
    .filter((item) => item.status === "meets")
    .map((item) => item.explanation);
  const uncertainties = criteria
    .filter((item) => item.status !== "meets")
    .map((item) => item.explanation);

  return {
    policy: "personal-fit-v1",
    reasons,
    uncertainties,
    rank:
      20 +
      reasons.length * 2 -
      criteria.filter((item) => item.status === "conflicts").length * 3,
    detail: {
      criteria,
      assessedBy: "ai",
      verificationPolicy: "supported-criteria-v4",
      ...(analysis.research
        ? {
            employerResearch: {
              ...analysis.research,
              documents: analysis.research.documents.map(
                ({ text: _text, ...document }) => document,
              ),
            },
          }
        : {}),
      research: criteria
        .filter((item) => item.status === "unknown")
        .map((item) => ({
          criterion: item.criterion,
          question: item.explanation,
          status: "unresolved" as const,
        })),
    },
  };
}
