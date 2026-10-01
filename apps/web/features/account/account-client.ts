export interface VerifiedAccount {
  id: string;
  email: string;
}
export interface CodeChallenge {
  id: string;
  email: string;
  expiresAt: string;
  resendAt: string;
}
export interface AccountContext {
  account: VerifiedAccount | null;
  challenge: CodeChallenge | null;
  csrfToken: string;
}
const messages: Record<string, string> = {
  scout_changed:
    "This scout changed in another tab. Load the latest saved version before trying again.",
  feedback_changed:
    "Your feedback changed in another tab. Refresh to see your latest choice.",
  scout_not_found: "This scout is no longer available to your account.",
  opportunity_not_found:
    "This opportunity is no longer available to your account.",
  request_conflict:
    "This request changed while it was being saved. Reload and try again.",
  invalid_request: "Review your answers and try again.",
  invalid_email: "Enter a valid email address.",
  invalid_code:
    "That code isn’t correct. Check your latest email and try again.",
  code_expired: "That code has expired. Request a new one below.",
  code_locked:
    "Too many incorrect attempts. Request a new code when the resend timer ends.",
  challenge_changed:
    "A newer code was requested. Use the latest email or request a new code.",
  email_unavailable:
    "We couldn’t confirm the email was sent. If it arrives, you can use its code. Otherwise, request another when the timer ends.",
  unauthenticated: "Your session has ended. Sign in again to continue.",
  activation_conflict:
    "This save request was already used for different answers. Review your scout and try again.",
  invalid_alerts: "Confirm your alert settings, or choose dashboard only.",
  search_needs_changes: "Review your search details before saving your scout.",
};

/** Safe client failure distinguishes expired sessions and rate limits from transport outages. */
export class AccountRequestError extends Error {
  /** Preserves only public failure codes and a bounded resend delay. */
  constructor(
    public readonly code: string,
    public readonly retryAfter = 0,
    public readonly issues: { field: string; message: string }[] = [],
  ) {
    super(
      code === "rate_limited"
        ? `Please wait ${retryAfter || 60} seconds before trying again.`
        : (messages[code] ??
            "We couldn’t connect right now. Please try again."),
    );
    this.name = "AccountRequestError";
  }
}

/** Reads non-cacheable identity/scout JSON and converts private transport failures into helpful text. */
export async function sendAccountRequest(
  path: string,
  body?: unknown,
  csrf?: string,
): Promise<unknown> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined
          ? undefined
          : { "content-type": "application/json", "x-scout-csrf": csrf ?? "" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const value: unknown = await response.json();

    if (response.ok) {
      return value;
    }

    const error = object(value);
    throw new AccountRequestError(
      typeof error?.code === "string" ? error.code : "service_unavailable",
      typeof error?.retryAfter === "number" ? error.retryAfter : 0,
      Array.isArray(error?.issues)
        ? error.issues
            .filter(
              (item): item is { field: string; message: string } =>
                typeof item?.field === "string" &&
                typeof item?.message === "string",
            )
            .slice(0, 20)
        : [],
    );
  } catch (error) {
    if (error instanceof AccountRequestError) {
      throw error;
    }

    throw new AccountRequestError("service_unavailable");
  }
}

/** Narrows untrusted JSON to a property bag without accepting primitives or arrays. */
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Validates public account markers before rendering an authenticated account state. */
function isAccount(value: unknown): value is VerifiedAccount {
  const account = object(value);

  return typeof account?.id === "string" && typeof account.email === "string";
}

/** Validates generation timing; no challenge cookie, digest or code is returned to JavaScript. */
function isChallenge(value: unknown): value is CodeChallenge {
  const challenge = object(value);

  return (
    typeof challenge?.id === "string" &&
    typeof challenge.email === "string" &&
    typeof challenge.expiresAt === "string" &&
    typeof challenge.resendAt === "string" &&
    Number.isFinite(Date.parse(challenge.expiresAt)) &&
    Number.isFinite(Date.parse(challenge.resendAt))
  );
}

/** Restores account/contact state only from the authoritative identity endpoint. */
export async function loadAccountContext(): Promise<AccountContext> {
  const context = object(await sendAccountRequest("/api/identity/context"));

  if (
    typeof context?.csrfToken !== "string" ||
    (context.account !== null && !isAccount(context.account)) ||
    (context.challenge !== null && !isChallenge(context.challenge))
  ) {
    throw new AccountRequestError("service_unavailable");
  }

  return {
    account: context.account as VerifiedAccount | null,
    challenge: context.challenge as CodeChallenge | null,
    csrfToken: context.csrfToken,
  };
}

/** Requests a new generation; resend uses the same server-side cooldown and rate limits. */
export async function requestEmailCode(
  email: string,
  csrf: string,
): Promise<CodeChallenge> {
  const result = await sendAccountRequest(
    "/api/identity/code",
    { email },
    csrf,
  );

  if (!isChallenge(result)) {
    throw new AccountRequestError("service_unavailable");
  }

  return result;
}

/** Exchanges proof for an HttpOnly cookie; session tokens never enter this view model. */
export async function verifyEmailCode(
  challenge: CodeChallenge,
  code: string,
  csrf: string,
): Promise<VerifiedAccount> {
  const result = object(
    await sendAccountRequest(
      "/api/identity/verify",
      { id: challenge.id, code },
      csrf,
    ),
  );

  if (!isAccount(result?.account)) {
    throw new AccountRequestError("service_unavailable");
  }

  return result.account;
}

/** Revokes the durable session before the server expires its HttpOnly cookie. */
export async function logoutAccount(csrf: string): Promise<void> {
  await sendAccountRequest("/api/identity/logout", {}, csrf);
}
