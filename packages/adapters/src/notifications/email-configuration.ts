import { z } from "zod";
import type { SMTPPoolOptions } from "nodemailer";
import type { EmailSender } from "./delivery/smtp-email-provider.js";

/** Shared infrastructure settings consumed by both identity and opportunity-email composition. */
export interface EmailConfiguration {
  provider: "mailpit" | "smtp";
  transport: SMTPPoolOptions;
  sender: EmailSender;
  publicOrigin: string;
}

const senderFields = {
  EMAIL_FROM_ADDRESS: z.email(),
  EMAIL_FROM_NAME: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^\r\n]+$/)
    .default("ScoutAlert"),
  EMAIL_REPLY_TO: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.email().optional(),
  ),
};

const mailpitSchema = z.object({
  ...senderFields,
  EMAIL_FROM_ADDRESS: senderFields.EMAIL_FROM_ADDRESS.default(
    "no-reply@scoutalert.test",
  ),
  MAILPIT_HOST: z.string().trim().min(1).default("127.0.0.1"),
  MAILPIT_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
});

const smtpSchema = z.object({
  ...senderFields,
  SMTP_HOST: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  SMTP_USER: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[^\r\n]+$/),
  SMTP_PASSWORD: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[^\r\n]+$/),
});

/** Validates configuration without echoing supplied values, credentials, or provider errors. */
function parseSettings<T>(
  schema: z.ZodType<T>,
  environment: Record<string, string | undefined>,
): T {
  const result = schema.safeParse(environment);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ].sort();
    throw new Error(
      `Configure valid email settings. Invalid fields: ${fields.join(", ")}.`,
    );
  }
  return result.data;
}

/** Maps validated sender fields without leaking SMTP credentials into message configuration. */
function sender(
  settings: Pick<
    z.infer<typeof mailpitSchema>,
    "EMAIL_FROM_ADDRESS" | "EMAIL_FROM_NAME" | "EMAIL_REPLY_TO"
  >,
): EmailSender {
  return {
    address: settings.EMAIL_FROM_ADDRESS,
    name: settings.EMAIL_FROM_NAME,
    ...(settings.EMAIL_REPLY_TO ? { replyTo: settings.EMAIL_REPLY_TO } : {}),
  };
}

/** Rejects local/test sender domains for real delivery; provider-side domain verification is still required. */
function isTestDomain(hostname: string): boolean {
  const domain = hostname.toLowerCase();
  return (
    !domain.includes(".") ||
    /(?:^|\.)(?:test|invalid|localhost|example|example\.com|example\.net|example\.org)$/.test(
      domain,
    )
  );
}

/** Requires an explicit HTTPS website for real email links; local capture retains the development origin. */
function publicOrigin(
  environment: Record<string, string | undefined>,
  provider: "mailpit" | "smtp",
): string {
  const configured = environment.SCOUTALERT_WEB_ORIGIN;
  const fallback = provider === "mailpit" ? "http://localhost:3030" : "";
  try {
    const url = new URL(configured ?? fallback);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (provider === "smtp" &&
        (url.protocol !== "https:" ||
          isTestDomain(url.hostname) ||
          /^[\d.]+$|:/u.test(url.hostname)))
    ) {
      throw new Error("invalid_origin");
    }
    return url.origin;
  } catch {
    throw new Error(
      "Configure SCOUTALERT_WEB_ORIGIN as your website origin, without a path or credentials. SMTP email requires a public HTTPS origin.",
    );
  }
}

/** Selects local capture or authenticated SMTP. Production requires explicit SMTP with certificate-checked TLS. */
export function readEmailConfiguration(
  environment: Record<string, string | undefined> = process.env,
): EmailConfiguration {
  const provider = environment.EMAIL_PROVIDER ?? "mailpit";
  if (provider !== "mailpit" && provider !== "smtp") {
    throw new Error("Configure EMAIL_PROVIDER as mailpit or smtp.");
  }
  if (environment.NODE_ENV === "production" && provider !== "smtp") {
    throw new Error(
      "Configure EMAIL_PROVIDER=smtp and production sender credentials; Mailpit is a local email provider.",
    );
  }
  if (provider === "mailpit") {
    const settings = parseSettings(mailpitSchema, environment);
    return {
      provider,
      transport: {
        host: settings.MAILPIT_HOST,
        port: settings.MAILPIT_SMTP_PORT,
        secure: false,
      },
      sender: sender(settings),
      publicOrigin: publicOrigin(environment, provider),
    };
  }

  const settings = parseSettings(smtpSchema, environment);
  const secure =
    settings.SMTP_SECURE === undefined
      ? settings.SMTP_PORT === 465
      : settings.SMTP_SECURE === "true";
  if (isTestDomain(settings.EMAIL_FROM_ADDRESS.split("@")[1]!)) {
    throw new Error(
      "Configure EMAIL_FROM_ADDRESS on your provider-verified sending domain; test domains cannot send production email.",
    );
  }
  if (
    (settings.SMTP_PORT === 465 && !secure) ||
    (settings.SMTP_PORT === 587 && secure)
  ) {
    throw new Error(
      "Configure SMTP_SECURE=true for port 465 or false for STARTTLS on port 587.",
    );
  }
  return {
    provider,
    transport: {
      host: settings.SMTP_HOST,
      port: settings.SMTP_PORT,
      secure,
      requireTLS: true,
      auth: { user: settings.SMTP_USER, pass: settings.SMTP_PASSWORD },
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    },
    sender: sender(settings),
    publicOrigin: publicOrigin(environment, provider),
  };
}
