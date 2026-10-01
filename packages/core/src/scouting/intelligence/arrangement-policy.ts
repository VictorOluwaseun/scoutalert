import type { SearchDraft } from "../../onboarding/domain/search-draft.js";
import type { FitCriterion, PostingAnalysis } from "./contracts.js";

/** Recognizes explicit work-location language; payment units and engagement type never establish an arrangement. */
function arrangement(value: string): SearchDraft["arrangement"] | null {
  if (/\bhybrid\b/i.test(value)) {
    return "hybrid";
  }

  const remote = /\bremote(?:ly)?\b|\bwork(?:ing)? from home\b/i.test(value);
  const onsite = /\bon[ -]?site\b|\boffice[ -]based\b/i.test(value);

  if (remote === onsite) {
    return null;
  }

  return remote ? "remote" : "onsite";
}

/** Requires the extracted arrangement and its own cited passages to agree before accepting a claimed match. */
export function arrangementCriterion(
  search: SearchDraft,
  analysis: PostingAnalysis,
  proposed: FitCriterion,
): FitCriterion {
  if (proposed.status !== "meets") {
    return proposed;
  }

  const fact = analysis.facts.arrangement;
  const stated = arrangement(fact.value);
  const cited = arrangement(fact.quotes.join("\n"));

  if (fact.status !== "stated" || stated === null || stated !== cited) {
    return {
      ...proposed,
      status: "unknown",
      explanation:
        "The evidence does not establish whether this work is remote, hybrid or on site. Hourly or contract terms do not answer that question.",
    };
  }

  if (stated !== search.arrangement) {
    return {
      ...proposed,
      status: "conflicts",
      explanation: `The source describes ${stated === "onsite" ? "on-site" : stated} work, which differs from your ${search.arrangement === "onsite" ? "on-site" : search.arrangement} preference.`,
    };
  }

  return proposed;
}
