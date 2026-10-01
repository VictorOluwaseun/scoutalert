import { z } from "zod";
import { criterionNames, factNames } from "@repo/core/scouting";
const quote = z.string().regex(/^p[0-9]+$/);
const fact = z.object({
  status: z.enum(["stated", "unknown", "conflicting"]),
  value: z.string().max(1200),
  quotes: z.array(quote).max(4),
});
export const postingAnalysisSchema = z.object({
  facts: z.object(
    Object.fromEntries(factNames.map((name) => [name, fact])) as Record<
      (typeof factNames)[number],
      typeof fact
    >,
  ),
  pay: z.object({
    minimum: z
      .string()
      .regex(/^[0-9]+(?:\.[0-9]+)?$/)
      .nullable()
      .describe(
        "Lower bound of the explicitly stated base-pay range as decimal digits, e.g. 60000. Null only when absent or ambiguous.",
      ),
    maximum: z
      .string()
      .regex(/^[0-9]+(?:\.[0-9]+)?$/)
      .nullable()
      .describe(
        "Upper bound of the explicitly stated base-pay range as decimal digits, e.g. 80000. Null only when absent or ambiguous.",
      ),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    period: z.enum(["year", "month", "hour", "project"]).nullable(),
  }),
});
export const personalFitSchema = z.object({
  criteria: z
    .array(
      z.object({
        criterion: z.enum(criterionNames),
        status: z.enum(["meets", "conflicts", "unknown"]),
        explanation: z.string().min(1).max(600),
        quotes: z.array(quote).max(4),
        briefQuotes: z.array(z.string().regex(/^b[0-9]+$/)).max(4),
      }),
    )
    .length(criterionNames.length),
});
