import { z } from "zod";

/** Daily request counters are persisted as PostgreSQL integers. */
const maximumDailyRequests = 2_147_483_647;

/** Dollar ceilings become integer microdollars at composition, before PostgreSQL bigint admission. */
const maximumDailyUsd = Math.floor(Number.MAX_SAFE_INTEGER / 1_000_000);

/** Validates execution settings before constructing clients; this host currently supports local Mailpit only. */
export function readWorkerConfiguration(environment = process.env) {
  if (environment.NODE_ENV === "production") {
    throw new Error(
      "Configure a production email provider before deploying this worker.",
    );
  }

  const result = z
    .object({
      SCOUT_X_ENABLED: z.enum(["true", "false"]).default("false"),
      X_BEARER_TOKEN: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().min(1).optional(),
      ),
      SCOUT_X_DAILY_REQUESTS: z.coerce
        .number()
        .int()
        .min(1)
        .max(maximumDailyRequests)
        .default(20),
      SCOUT_X_DAILY_USD: z.coerce
        .number()
        .positive()
        .max(maximumDailyUsd)
        .default(1),
      SCOUT_X_POST_USD: z.coerce.number().min(0.005).max(1).default(0.005),
      SCOUT_X_PAGE_SIZE: z.coerce.number().int().min(10).max(100).default(10),
      SCOUT_MONITOR_ENABLED: z.enum(["true", "false"]).default("true"),
      SCOUT_MONITOR_MAX_SOURCES: z.coerce
        .number()
        .int()
        .min(1)
        .max(256)
        .default(32),
      SCOUT_WEB_ENABLED: z.enum(["true", "false"]).default("false"),
      SERPER_API_KEY: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().min(1).optional(),
      ),
      SCOUT_WEB_LANGUAGE: z
        .string()
        .regex(/^[a-z]{2}$/)
        .default("en"),
      SCOUT_WEB_COUNTRY: z
        .string()
        .regex(/^[a-z]{2}$/)
        .default("us"),
      SCOUT_WEB_DAILY_REQUESTS: z.coerce
        .number()
        .int()
        .min(1)
        .max(maximumDailyRequests)
        .default(100),
      SCOUT_WEB_DAILY_USD: z.coerce
        .number()
        .positive()
        .max(maximumDailyUsd)
        .default(1),
      SCOUT_WEB_REQUEST_USD: z.coerce.number().positive().max(1).default(0.01),
      SCOUT_WEB_DAILY_DOCUMENTS: z.coerce
        .number()
        .int()
        .min(1)
        .max(maximumDailyRequests)
        .default(200),
      SCOUT_WEB_MAX_DOCUMENTS: z.coerce
        .number()
        .int()
        .min(1)
        .max(12)
        .default(4),
      SCOUT_WEB_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
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
        .max(maximumDailyRequests)
        .default(50),
      SCOUT_AI_DAILY_USD: z.coerce
        .number()
        .min(0.075)
        .max(maximumDailyUsd)
        .default(5),
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

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ].sort();

    throw new Error(
      `Configure valid worker settings before startup. Invalid fields: ${fields.join(", ")}.`,
    );
  }

  if (result.data.SCOUT_AI_ENABLED === "true" && !result.data.OPENAI_API_KEY) {
    throw new Error(
      "Configure OPENAI_API_KEY before enabling scout assessment.",
    );
  }

  const priced = ["gpt-5.4-mini", "gpt-5.4-mini-2026-03-17"];

  if (result.data.SCOUT_X_ENABLED === "true" && !result.data.X_BEARER_TOKEN) {
    throw new Error(
      "Configure X_BEARER_TOKEN before enabling native X discovery.",
    );
  }

  if (result.data.SCOUT_WEB_ENABLED === "true" && !result.data.SERPER_API_KEY) {
    throw new Error("Configure SERPER_API_KEY before enabling web discovery.");
  }

  if (
    result.data.SCOUT_AI_ENABLED === "true" &&
    (!priced.includes(result.data.SCOUT_AI_EXTRACTION_MODEL) ||
      !priced.includes(result.data.SCOUT_AI_FIT_MODEL))
  ) {
    throw new Error(
      "Configure a reviewed pricing policy before using another assessment model.",
    );
  }

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
