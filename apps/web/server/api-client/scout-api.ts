import "server-only";
import { parseWebDiscoveryPage } from "@/features/discovery/discovery-contracts";
import { NextResponse } from "next/server";
import {
  cookieOptions,
  csrfToken,
  requestSession,
  sessionCookie,
  validateBrowserMutation,
} from "../session/request-session";
import { readRequestBody } from "./request-body";
import {
  parseScoutDashboard,
  parseManagedScout,
  type ScoutDashboard,
} from "@/features/scouts/scout-contracts";

/** Reads the private API origin without placing transport credentials in browser configuration. */
function apiOrigin(): string {
  const value =
    process.env.SCOUTALERT_API_URL ??
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:4040" : null);

  if (!value || !process.env.WEB_API_SECRET) {
    throw new Error("service_unavailable");
  }

  return value;
}

/** Constructs private context from cookies; public browser-supplied owner and session headers are ignored. */
function apiHeaders(
  request: Request | null,
  browser: string,
  token: string | null,
): Headers {
  const headers = new Headers({
    "content-type": "application/json",
    "x-scout-web-key": process.env.WEB_API_SECRET!,
    "x-scout-browser": browser,
  });

  if (token) {
    headers.set("x-scout-session", token);
  }

  // Only deployments with an edge that overwrites this header may opt into per-network limits.
  const network =
    process.env.SCOUTALERT_TRUST_PROXY === "true"
      ? request?.headers
          .get("x-forwarded-for")
          ?.split(",")[0]
          ?.trim()
          .slice(0, 64)
      : null;
  headers.set("x-scout-network", network || "unattributed");

  return headers;
}

export type DashboardRead =
  | { status: "ready"; page: ScoutDashboard }
  | { status: "signed_out" | "unavailable" | "invalid_cursor" };

/** Reads account-owned scouts directly from Nest for server rendering; cookies and transport keys stay server-only. */
export async function readScoutDashboard(
  after?: string,
): Promise<DashboardRead> {
  const session = await requestSession();

  if (!session.browser || !session.token) {
    return { status: "signed_out" };
  }

  if (
    after !== undefined &&
    (after.length > 256 || !/^[A-Za-z0-9_-]+$/.test(after))
  ) {
    return { status: "invalid_cursor" };
  }

  try {
    const url = new URL("/v1/scouts", apiOrigin());

    if (after) {
      url.searchParams.set("after", after);
    }

    const response = await fetch(url, {
      headers: apiHeaders(null, session.browser, session.token),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 401) {
      const failure: unknown = await response.json();
      const unauthenticated =
        failure !== null &&
        typeof failure === "object" &&
        "code" in failure &&
        failure.code === "unauthenticated";

      return { status: unauthenticated ? "signed_out" : "unavailable" };
    }

    if (response.status === 400) {
      return { status: "invalid_cursor" };
    }

    if (!response.ok) {
      return { status: "unavailable" };
    }

    const page = parseScoutDashboard(await response.json());

    return page ? { status: "ready", page } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

/** Produces private, non-cacheable JSON for authentication and personal scout responses. */
function privateResponse(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: {
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Maps transport failures without returning upstream secrets, stack traces or provider details. */
function failure(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : "service_unavailable";

  if (code === "invalid_origin" || code === "invalid_csrf") {
    return privateResponse({ code }, 403);
  }

  if (code === "request_too_large") {
    return privateResponse({ code }, 413);
  }

  if (code === "invalid_request") {
    return privateResponse({ code }, 400);
  }

  return privateResponse({ code: "service_unavailable" }, 503);
}

/** Creates browser binding and returns server-authorized recovery state plus a CSRF token. */
export async function identityContext(request: Request): Promise<NextResponse> {
  try {
    const origin = apiOrigin();
    const session = await requestSession(true);
    const upstream = await fetch(new URL("/v1/identity/context", origin), {
      headers: apiHeaders(request, session.browser!, session.token),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      return privateResponse({ code: "service_unavailable" }, 503);
    }

    const result: unknown = await upstream.json();

    if (!result || typeof result !== "object") {
      throw new Error("service_unavailable");
    }

    return privateResponse({
      ...result,
      csrfToken: csrfToken(session.browser!),
    });
  } catch (error) {
    return failure(error);
  }
}

/** Forwards fixed private routes, establishes HttpOnly sessions, and preserves safe API failures. */
export async function forwardScoutRequest(
  request: Request,
  path: string,
  options: { establishSession?: boolean; logout?: boolean } = {},
): Promise<NextResponse> {
  try {
    const session = await requestSession();

    if (request.method !== "GET") {
      validateBrowserMutation(request, session.browser);
    }

    if (!session.browser) {
      return privateResponse({ code: "unauthenticated" }, 401);
    }

    const body =
      request.method === "GET" ? undefined : await readRequestBody(request);
    const upstream = await fetch(new URL(path, apiOrigin()), {
      method: request.method,
      headers: apiHeaders(request, session.browser, session.token),
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (![200, 400, 401, 404, 409, 422, 429, 503].includes(upstream.status)) {
      return privateResponse({ code: "service_unavailable" }, 503);
    }

    const result: unknown = await upstream.json();

    if (options.establishSession && upstream.ok) {
      return establishSession(result);
    }

    const response = privateResponse(result, upstream.status);
    const retryAfter = upstream.headers.get("retry-after");

    if (retryAfter) {
      response.headers.set("retry-after", retryAfter);
    }

    if (options.logout && upstream.ok) {
      response.cookies.set(sessionCookie, "", { ...cookieOptions, maxAge: 0 });
    }

    return response;
  } catch (error) {
    return failure(error);
  }
}

/** Removes the upstream session secret from JSON and sets it only in a host-only HttpOnly cookie. */
function establishSession(value: unknown): NextResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !("token" in value) ||
    !("expiresAt" in value) ||
    !("account" in value)
  ) {
    throw new Error("service_unavailable");
  }

  if (
    typeof value.token !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.token) ||
    typeof value.expiresAt !== "string"
  ) {
    throw new Error("service_unavailable");
  }

  const expires = new Date(value.expiresAt);

  if (!Number.isFinite(expires.getTime())) {
    throw new Error("service_unavailable");
  }

  const response = privateResponse({
    account: value.account,
    expiresAt: value.expiresAt,
  });
  response.cookies.set(sessionCookie, value.token, {
    ...cookieOptions,
    expires,
  });

  return response;
}

/** Reads one account-owned editable scout on the server; personal data and errors stay non-cacheable. */
export async function readManagedScout(id: string) {
  const session = await requestSession();

  if (!session.browser || !session.token) {
    return { status: "signed_out" as const };
  }

  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return { status: "missing" as const };
  }

  try {
    const response = await fetch(
      new URL(`/v1/scouts/${encodeURIComponent(id)}`, apiOrigin()),
      {
        headers: apiHeaders(null, session.browser, session.token),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const value = await response.json();

    if (response.status === 401 && value?.code === "unauthenticated") {
      return { status: "signed_out" as const };
    }

    if (response.status === 404 || response.status === 400) {
      return { status: "missing" as const };
    }

    const scout = response.ok ? parseManagedScout(value?.scout) : null;

    if (
      !scout ||
      typeof value?.account?.id !== "string" ||
      typeof value?.account?.email !== "string"
    ) {
      return { status: "unavailable" as const };
    }

    return {
      status: "ready" as const,
      scout,
      account: {
        id: value.account.id as string,
        email: value.account.email as string,
      },
    };
  } catch {
    return { status: "unavailable" as const };
  }
}

/** Reads current-account web discovery directly for server rendering with the same private session boundary as scouts. */
export async function readWebDiscovery() {
  const session = await requestSession();

  if (!session.browser || !session.token) {
    return { status: "signed_out" as const };
  }

  try {
    const response = await fetch(new URL("/v1/discovery", apiOrigin()), {
      headers: apiHeaders(null, session.browser, session.token),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const value = await response.json();

    if (response.status === 401 && value?.code === "unauthenticated") {
      return { status: "signed_out" as const };
    }

    const page = response.ok ? parseWebDiscoveryPage(value) : null;
    return page
      ? { status: "ready" as const, page }
      : { status: "unavailable" as const };
  } catch {
    return { status: "unavailable" as const };
  }
}
