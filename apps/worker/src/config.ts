import { z } from "zod";

/** Validates execution settings before constructing clients; this host currently supports local Mailpit only. */
export function readWorkerConfiguration(environment = process.env) {
  if (environment.NODE_ENV === "production")
    throw new Error(
      "Configure a production email provider before deploying this worker.",
    );
  const result = z
    .object({
      OPENAI_API_KEY: z.string().min(1).optional(),
      SCOUT_AI_ENABLED: z.enum(["true", "false"]).default("false"),
      SCOUT_AI_EXTRACTION_MODEL: z
        .string()
        .min(1)
        .default("gpt-5.4-mini-2026-03-17"),
      SCOUT_AI_FIT_MODEL: z.string().min(1).default("gpt-5.4-mini-2026-03-17"),
      SCOUT_AI_DAILY_REQUESTS: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(50),
      SCOUT_AI_DAILY_USD: z.coerce.number().min(0.075).max(100).default(5),
      DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:/.test(value)),
      TEMPORAL_ADDRESS: z.string().default("127.0.0.1:7233"),
      TEMPORAL_NAMESPACE: z.string().default("default"),
      MAILPIT_HOST: z.string().default("127.0.0.1"),
      MAILPIT_SMTP_PORT: z.coerce
        .number()
        .int()
        .min(1)
        .max(65535)
        .default(1025),
      EMAIL_FROM_ADDRESS: z.email().default("no-reply@scoutalert.test"),
      EMAIL_FROM_NAME: z.string().default("ScoutAlert"),
    })
    .safeParse(environment);
  if (!result.success)
    throw new Error(
      "Configure valid worker storage, Temporal and Mailpit settings before startup.",
    );
  if (result.data.SCOUT_AI_ENABLED === "true" && !result.data.OPENAI_API_KEY)
    throw new Error(
      "Configure OPENAI_API_KEY before enabling scout assessment.",
    );
  const priced = ["gpt-5.4-mini", "gpt-5.4-mini-2026-03-17"];
  if (
    result.data.SCOUT_AI_ENABLED === "true" &&
    (!priced.includes(result.data.SCOUT_AI_EXTRACTION_MODEL) ||
      !priced.includes(result.data.SCOUT_AI_FIT_MODEL))
  )
    throw new Error(
      "Configure a reviewed pricing policy before using another assessment model.",
    );
  return result.data;
}
export type WorkerConfiguration = ReturnType<typeof readWorkerConfiguration>;

/** Explicit initial coverage; extending coverage requires a validated connector/source decision. */
export const greenhouseBoards: Readonly<Record<string, string>> = {
  figma: "Figma",
  remotecom: "Remote",
};

/** Public recruiting sources, separate from customer support or EOR product policies. */
export const employerPolicyPages: Readonly<Record<string, readonly string[]>> =
  {
    figma: ["https://www.figma.com/careers/"],
    remotecom: ["https://remote.com/careers", "https://remote.com/openings"],
  };

/** Five-minute shared collection includes the bounded international buyer-request feed. */
export const discoverySourceIds = [
  ...Object.keys(greenhouseBoards),
  "freelancer",
] as const;
