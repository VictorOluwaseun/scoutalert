import type { AnalysisUsage } from "@repo/core/scouting";

/** Versioned standard-tier USD estimate; unknown models remain explicitly unpriced. This is not an invoice. */
export function estimateIntelligenceCost(usage: AnalysisUsage) {
  if (usage.model === "no-provider-call") {
    return {
      currency: "USD" as const,
      pricingVersion: "no-provider-call",
      source: "none",
      estimatedMicrousd: 0,
    };
  }

  if (!/^gpt-5\.4-mini(?:-2026-03-17)?$/.test(usage.model)) {
    return null;
  }

  const cached = Math.min(
    usage.inputTokens,
    Math.max(0, usage.cachedInputTokens ?? 0),
  );

  return {
    currency: "USD" as const,
    pricingVersion: "openai-standard-2026-10-01",
    source: "https://developers.openai.com/api/docs/models/gpt-5.4-mini",
    estimatedMicrousd: Math.ceil(
      (usage.inputTokens - cached) * 0.75 +
        cached * 0.075 +
        usage.outputTokens * 4.5,
    ),
  };
}

/** Conservative admission reserve for 60KB input plus instructions and at most 4,000 output tokens on the priced model. */
export const intelligenceAttemptReserveMicrousd = 75_000;
