import type { SearchDraft } from "../../onboarding/domain/search-draft.js";
import type { FitCriterion, PostingAnalysis } from "./contracts.js";

const numbers: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};
const number = `(?:\\d{1,2}(?:\\.\\d+)?|${Object.keys(numbers).join("|")})`;
const tenurePattern = `\\b(${number})(?:\\s*(?:to|[-–—])\\s*(${number}))?(\\+)?\\s+years?\\b`;
type Tenure = {
  minimum: number;
  exact: boolean;
  experience: boolean;
  scope: string[];
};

/** Reads explicit English tenure claims only; open-ended amounts, alternatives and preferred criteria cannot establish a shortfall. */
function tenures(text: string): Tenure[] {
  const matches = [...text.matchAll(new RegExp(tenurePattern, "giu"))];
  return matches.flatMap((match, index) => {
    const prefix = text.slice(Math.max(0, match.index! - 45), match.index);
    const tail = text
      .slice(match.index! + match[0].length, matches[index + 1]?.index)
      .split(/[.;\n]/u)[0]!;
    const scope = tail.split(",")[0]!;
    if (
      /\b(?:preferred|preferably|ideally|desired|nice to have)\b/iu.test(
        prefix,
      ) ||
      /\b(?:up to|less than|under)\s*$/iu.test(prefix) ||
      /\b(?:or equivalent|not required|preferred|preferably|ideally|desired|nice to have)\b/iu.test(
        tail,
      )
    ) {
      return [];
    }
    return [
      {
        minimum: numbers[match[1]!.toLowerCase()] ?? Number(match[1]),
        experience: /\bexperience\b/iu.test(scope),
        exact:
          !match[2] &&
          !match[3] &&
          !/\b(?:over|more than|at least|about|approximately|nearly|twenty|thirty|forty|fifty)\s*$/iu.test(
            prefix,
          ),
        scope: (scope.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
          .filter(
            (word) =>
              ![
                "of",
                "in",
                "and",
                "or",
                "for",
                "with",
                "experience",
                "professional",
                "work",
                "working",
                "required",
              ].includes(word),
          )
          .map((word) => word.replace(/(?:ing|s)$/u, "")),
      },
    ];
  });
}

/** Corrects supported numerical contradictions without inventing total tenure, summing overlapping roles or upgrading an unknown to a match. Other skill/seniority comparisons remain model proposals. */
export function experienceCriterion(
  search: SearchDraft,
  analysis: PostingAnalysis,
  proposed: FitCriterion,
): FitCriterion {
  if (!search.background.trim()) {
    return {
      ...proposed,
      status: "unknown",
      explanation:
        "Add your experience before we can assess these requirements.",
    };
  }
  const requirements = analysis.facts.requirements;
  if (requirements.status !== "stated") {
    return {
      ...proposed,
      status: "unknown",
      explanation:
        "The posting does not state consistent experience requirements.",
    };
  }
  const declared = tenures(search.background);
  if (declared.length !== 1 || !declared[0]!.exact) {
    return proposed;
  }
  const actual = declared[0]!;
  const shortfall = requirements.quotes
    .flatMap(tenures)
    .find(
      (required) =>
        required.experience &&
        required.minimum > actual.minimum &&
        new Set(required.scope.filter((word) => actual.scope.includes(word)))
          .size >= 2,
    );
  if (!shortfall) {
    return proposed;
  }
  return {
    ...proposed,
    status: "conflicts",
    quotes: requirements.quotes,
    briefQuotes: [search.background],
    explanation: `The posting asks for at least ${shortfall.minimum} years in this area; your brief states ${actual.minimum} years.`,
  };
}
