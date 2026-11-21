import { EmailSubmissionError } from "@repo/core/notifications";

type SmtpFailure = {
  code?: unknown;
  command?: unknown;
  responseCode?: unknown;
  syscall?: unknown;
};

/** Recognizes only structured pre-submission failures; a generic CONN error can also occur after DATA was accepted. */
function failedBeforeSubmission(error: SmtpFailure): boolean {
  return (
    ["EDNS", "EAUTH", "ETLS", "ENOAUTH"].includes(String(error.code)) ||
    (error.code === "ESOCKET" && error.syscall === "connect")
  );
}

/** Requires a negative reply to a submission command; malformed replies and connection loss cannot establish rejection. */
function explicitlyRejected(error: SmtpFailure): boolean {
  return (
    typeof error.responseCode === "number" &&
    Number.isInteger(error.responseCode) &&
    error.responseCode >= 400 &&
    error.responseCode < 600 &&
    typeof error.command === "string" &&
    /^(?:EHLO|HELO|AUTH(?: [A-Z0-9_-]+)?|MAIL FROM|RCPT TO|DATA)$/.test(
      error.command,
    )
  );
}

/** Separates outages and temporary refusals from permanent recipient/content rejection, without inspecting or logging message text. */
export function smtpSubmissionError(cause: unknown): EmailSubmissionError {
  if (typeof cause !== "object" || cause === null) {
    return new EmailSubmissionError("unknown", { cause });
  }

  const error = cause as SmtpFailure;
  if (failedBeforeSubmission(error)) {
    return new EmailSubmissionError("rejected", {
      cause,
      fallbackAllowed: true,
    });
  }

  if (!explicitlyRejected(error)) {
    return new EmailSubmissionError("unknown", { cause });
  }

  const temporary = Number(error.responseCode) < 500;
  const providerConfiguration = ["EHLO", "HELO", "MAIL FROM"].includes(
    String(error.command),
  );
  return new EmailSubmissionError("rejected", {
    cause,
    fallbackAllowed: temporary || providerConfiguration,
  });
}
