import type { PostingAnalysis } from "./contracts.js";

/** Normalizes one explicit base-pay range from cited text; ambiguous currencies, periods and multiple ranges stay unresolved. */
export function normalizeCompensation(
  analysis: PostingAnalysis,
): PostingAnalysis {
  const fact = analysis.facts.compensation;
  const unknown: PostingAnalysis["pay"] = {
    minimum: null,
    maximum: null,
    currency: null,
    period: null,
  };

  if (fact.status !== "stated") {
    return { ...analysis, pay: unknown };
  }

  const ranges = new Map<string, PostingAnalysis["pay"]>();

  for (const quote of fact.quotes) {
    const pattern =
      /\b(?:base\s+(?:salary|pay)|salary|pay\s+rate)\s*(?:is\s*|:\s*)?(USD|EUR|GBP|NGN)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:to|[-–—])\s*(?:\1\s*)?([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:per\s+|\/)(year|month|hour|project)\b/gi;

    for (const match of quote.matchAll(pattern)) {
      const minimum = Number(match[2]!.replaceAll(",", ""));
      const maximum = Number(match[3]!.replaceAll(",", ""));

      if (
        !Number.isFinite(minimum) ||
        !Number.isFinite(maximum) ||
        minimum > maximum
      ) {
        continue;
      }

      const pay = {
        minimum,
        maximum,
        currency: match[1]!.toUpperCase(),
        period: match[4]!.toLowerCase() as PostingAnalysis["pay"]["period"],
      };
      ranges.set(JSON.stringify(pay), pay);
    }
  }

  if (ranges.size !== 1) {
    return { ...analysis, pay: unknown };
  }

  return { ...analysis, pay: [...ranges.values()][0]! };
}
