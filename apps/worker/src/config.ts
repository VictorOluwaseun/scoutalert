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
      SCOUT_DISCOVERY_REFRESH_MINUTES: z.coerce
        .number()
        .int()
        .min(10)
        .max(1440)
        .default(60),
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
      SCOUT_WEB_RENDER_ENABLED: z.enum(["true", "false"]).default("true"),
      SCOUT_WEB_MAX_DEPTH: z.coerce.number().int().min(1).max(8).default(4),
      SCOUT_WEB_MAX_ROUNDS: z.coerce.number().int().min(1).max(16).default(8),
      SCOUT_WEB_MAX_SOURCE_PAGES: z.coerce
        .number()
        .int()
        .min(1)
        .max(5)
        .default(3),
      SCOUT_WEB_MAX_DOCUMENTS: z.coerce
        .number()
        .int()
        .min(1)
        .max(12)
        .default(4),
      SCOUT_WEB_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
      OPENAI_API_KEY: z.string().min(1).optional(),
      SCOUT_AI_ENABLED: z.enum(["true", "false"]).default("false"),
      SCOUT_AI_PLANNING_MODEL: z
        .string()
        .min(1)
        .default("gpt-5.4-mini-2026-03-17"),
      SCOUT_AI_EXPERT_MODEL: z.string().min(1).default("gpt-5.4-2026-03-05"),
      SCOUT_AI_EXPERT_ENABLED: z.enum(["true", "false"]).default("true"),
      SCOUT_AI_AUDIT_PERCENT: z.coerce.number().int().min(0).max(10).default(5),
      SCOUT_AI_AUDIT_DAILY_TOKENS: z.coerce
        .number()
        .int()
        .min(0)
        .max(maximumDailyRequests)
        .optional(),
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
      SCOUT_AI_DAILY_TOKENS: z.coerce
        .number()
        .int()
        .min(0)
        .max(maximumDailyRequests)
        .optional(),
      SCOUT_AI_GPT54_DAILY_TOKENS: z.coerce
        .number()
        .int()
        .min(0)
        .max(maximumDailyRequests)
        .default(250_000),
      SCOUT_AI_GPT54_MINI_DAILY_TOKENS: z.coerce
        .number()
        .int()
        .min(0)
        .max(maximumDailyRequests)
        .default(2_400_000),
      SCOUT_AI_MAX_OUTPUT_TOKENS: z.coerce
        .number()
        .int()
        .min(16)
        .max(4_000)
        .default(4_000),
      SCOUT_AI_DAILY_USD: z.coerce
        .number()
        .min(0.075)
        .max(maximumDailyUsd)
        .default(5),
      REDIS_URL: z
        .url()
        .refine((value) => /^rediss?:/.test(value))
        .optional(),
      DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:/.test(value)),
      TEMPORAL_ADDRESS: z.string().default("127.0.0.1:7233"),
      TEMPORAL_NAMESPACE: z.string().default("default"),
      MAILPIT_HOST: z.string().default("127.0.0.1"),
      MAILPIT_HTTP_URL: z
        .url()
        .refine((value) => {
          if (!URL.canParse(value)) {
            return false;
          }

          const url = new URL(value);
          return (
            /^https?:$/.test(url.protocol) && !url.username && !url.password
          );
        })
        .default("http://localhost:8025"),
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
  const expertModels = ["gpt-5.4", "gpt-5.4-2026-03-05"];
  const fullTokens = result.data.SCOUT_AI_GPT54_DAILY_TOKENS;
  const miniTokens = result.data.SCOUT_AI_GPT54_MINI_DAILY_TOKENS;
  const auditTokens =
    result.data.SCOUT_AI_AUDIT_DAILY_TOKENS ?? Math.floor(fullTokens / 10);
  if (auditTokens > fullTokens) {
    throw new Error(
      "SCOUT_AI_AUDIT_DAILY_TOKENS must fit inside SCOUT_AI_GPT54_DAILY_TOKENS.",
    );
  }
  if (
    (fullTokens > 0 && miniTokens <= fullTokens) ||
    fullTokens + miniTokens > maximumDailyRequests
  ) {
    throw new Error(
      "Configure SCOUT_AI_GPT54_MINI_DAILY_TOKENS above SCOUT_AI_GPT54_DAILY_TOKENS, or set both to zero; their sum must fit the supported daily ceiling.",
    );
  }

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
      !priced.includes(result.data.SCOUT_AI_FIT_MODEL) ||
      !priced.includes(result.data.SCOUT_AI_PLANNING_MODEL) ||
      !expertModels.includes(result.data.SCOUT_AI_EXPERT_MODEL))
  ) {
    throw new Error(
      "Use GPT-5.4 mini for routine planning, discovery, extraction, research and fit, and GPT-5.4 for expert review. Other routes require a reviewed pricing policy.",
    );
  }

  return {
    ...result.data,
    SCOUT_AI_DAILY_TOKENS:
      result.data.SCOUT_AI_DAILY_TOKENS ?? fullTokens + miniTokens,
    SCOUT_AI_AUDIT_DAILY_TOKENS: auditTokens,
  };
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
