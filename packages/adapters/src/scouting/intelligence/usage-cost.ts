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

  const mini = /^gpt-5\.4-mini(?:-2026-03-17)?$/.test(usage.model);
  const full = /^gpt-5\.4(?:-2026-03-05)?$/.test(usage.model);
  if (!mini && !full) {
    return null;
  }

  const cached = Math.min(
    usage.inputTokens,
    Math.max(0, usage.cachedInputTokens ?? 0),
  );
  const longContext = full && usage.inputTokens > 272_000;
  const inputRate = (full ? 2.5 : 0.75) * (longContext ? 2 : 1);
  const cachedRate = (full ? 0.25 : 0.075) * (longContext ? 2 : 1);
  const outputRate = (full ? 15 : 4.5) * (longContext ? 1.5 : 1);

  return {
    currency: "USD" as const,
    pricingVersion: "openai-standard-2026-10-29",
    source: `https://developers.openai.com/api/docs/models/${full ? "gpt-5.4" : "gpt-5.4-mini"}`,
    estimatedMicrousd: Math.ceil(
      (usage.inputTokens - cached) * inputRate +
        cached * cachedRate +
        usage.outputTokens * outputRate,
    ),
  };
}

/** Conservative reserve for routine mini calls with 60KB input plus instructions and at most 4,000 output tokens; expert calls use their separate reserve below. */
export const intelligenceAttemptReserveMicrousd = 75_000;

/** Bounds a full-model review with 24KB serialized evidence, fixed instructions/schema, and at most 4,000 output tokens. */
export const expertAttemptReserveMicrousd = 200_000;
