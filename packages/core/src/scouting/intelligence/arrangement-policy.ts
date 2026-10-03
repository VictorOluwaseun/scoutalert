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

/** Removes engagement/payment terms misfiled as work arrangement; stated location modes need agreeing source citations. */
export function normalizeArrangement(
  analysis: PostingAnalysis,
): PostingAnalysis {
  const fact = analysis.facts.arrangement;
  const stated = arrangement(fact.value);
  const cited = arrangement(fact.quotes.join("\n"));
  const supported =
    fact.status === "stated" && stated !== null && stated === cited;
  const conflict =
    fact.status === "conflicting" && (stated !== null || cited !== null);
  if (supported || conflict || fact.status === "unknown") {
    return analysis;
  }
  return {
    ...analysis,
    facts: {
      ...analysis.facts,
      arrangement: { status: "unknown", value: "", quotes: [] },
    },
  };
}
