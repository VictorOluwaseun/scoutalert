import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const secure = process.env.NODE_ENV === "production";
export const browserCookie = secure ? "__Host-scout-browser" : "scout-browser";
export const sessionCookie = secure ? "__Host-scout-session" : "scout-session";
export const cookieOptions = {
  httpOnly: true,
  secure,
  sameSite: "lax",
  path: "/",
} as const;

/** Obtains browser/session transport without exposing either secret to client JavaScript. */
export async function requestSession(createBrowser = false) {
  const store = await cookies();
  const saved = store.get(browserCookie)?.value;
  const browser = saved && /^[a-f0-9]{64}$/.test(saved) ? saved : null;

  if (browser || !createBrowser) {
    return { browser, token: store.get(sessionCookie)?.value ?? null };
  }

  const fresh = randomBytes(32).toString("hex");
  store.set(browserCookie, fresh, { ...cookieOptions, maxAge: 7 * 86400 });

  return { browser: fresh, token: store.get(sessionCookie)?.value ?? null };
}

/** Derives a browser-bound CSRF token; same-origin context reads can expose this token safely. */
export function csrfToken(browser: string): string {
  const secret = process.env.WEB_API_SECRET;

  if (!secret) {
    throw new Error("service_unavailable");
  }

  return createHmac("sha256", secret)
    .update(`csrf-v1:${browser}`)
    .digest("hex");
}

/** Requires origin, fetch metadata and a keyed browser token on every mutation. */
export function validateBrowserMutation(
  request: Request,
  browser: string | null,
): void {
  const origin =
    process.env.SCOUTALERT_WEB_ORIGIN ?? new URL(request.url).origin;

  if (request.headers.get("origin") !== origin) {
    throw new Error("invalid_origin");
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new Error("invalid_origin");
  }

  if (!browser) {
    throw new Error("invalid_csrf");
  }

  const candidate = Buffer.from(request.headers.get("x-scout-csrf") ?? "");
  const expected = Buffer.from(csrfToken(browser));

  if (
    candidate.length !== expected.length ||
    !timingSafeEqual(candidate, expected)
  ) {
    throw new Error("invalid_csrf");
  }
}
