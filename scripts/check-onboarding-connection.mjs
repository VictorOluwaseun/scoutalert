import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const origin = process.env.SCOUTALERT_WEB_ORIGIN ?? "http://localhost:3030";
const mailbox = process.env.MAILPIT_HTTP_URL ?? "http://127.0.0.1:8025";
const cookies = new Map();
let csrf = "";

/** Calls the live Next.js boundary; the cookie jar belongs only to this synthetic test session. */
async function call(path, body, options = {}) {
  const headers = {
    cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
  };

  if (body !== undefined) {
    Object.assign(headers, {
      "content-type": "application/json",
      origin,
      "x-scout-csrf": csrf,
    });
  }

  Object.assign(headers, options.headers);
  const response = await fetch(new URL(path, origin), {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  for (const line of response.headers.getSetCookie()) {
    const [cookie] = line.split(";");
    const split = cookie.indexOf("=");
    cookies.set(cookie.slice(0, split), cookie.slice(split + 1));
  }

  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/json/,
    `${path} returned HTTP ${response.status} without JSON`,
  );

  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

/** Reads only the synthetic verification message whose UUID was returned by this test. */
async function readCode(id) {
  const query = new URL("/api/v1/search", mailbox);
  query.searchParams.set("query", `message-id:${id}@scoutalert.test`);
  const search = await fetch(query, { signal: AbortSignal.timeout(5000) });
  const results = await search.json();
  assert.equal(results.messages.length, 1);
  const captured = await fetch(
    new URL(`/api/v1/message/${results.messages[0].ID}`, mailbox),
    { signal: AbortSignal.timeout(5000) },
  );
  const message = await captured.json();
  const code = message.Text.match(/code is (\d{6})/u)?.[1];
  assert.match(code, /^\d{6}$/);

  return code;
}

/** Inspects server-rendered pages with this script's own cookie jar; redirect responses are kept visible. */
async function readPage(path) {
  return fetch(new URL(path, origin), {
    headers: {
      cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
}

/** Verifies real cookies, CSRF, Mailpit proof exchange, activation retries, reads and revocation. */
async function checkConnection() {
  const context = await call("/api/identity/context");
  assert.equal(context.status, 200);
  csrf = context.body.csrfToken;
  assert.equal((await call("/api/scouts")).status, 401);
  const email = `web-check-${randomUUID()}@scoutalert.test`;
  assert.equal(
    (
      await call(
        "/api/identity/code",
        { email },
        { headers: { origin: "https://untrusted.example" } },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/identity/code",
        { email },
        { headers: { "x-scout-csrf": "forged" } },
      )
    ).status,
    403,
  );
  const sent = await call("/api/identity/code", { email });
  assert.equal(sent.status, 200);
  const code = await readCode(sent.body.id);
  const verified = await call("/api/identity/verify", {
    id: sent.body.id,
    code,
  });
  assert.equal(verified.status, 200);
  assert.equal("token" in verified.body, false);
  assert.match(verified.headers.getSetCookie().join(";"), /HttpOnly/i);
  assert.match(verified.headers.getSetCookie().join(";"), /SameSite=lax/i);
  assert.equal(verified.headers.get("cache-control"), "no-store, private");
  const empty = await call("/api/scouts");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.items, []);
  assert.equal(empty.body.account.email, email);
  const input = {
    key: randomUUID(),
    confirmed: true,
    search: {
      goal: "Find remote client website projects",
      category: "services",
      target: "Website design",
      name: "Synthetic connection check",
      arrangement: "remote",
      arrangementRequired: true,
      residence: "",
      workLocations: "",
      background: "",
      minimumPay: "",
      currency: "USD",
      payPeriod: "project",
      unknownEligibility: "review",
      undisclosedPay: "include",
    },
    alerts: {
      frequency: "dashboard",
      timezone: "UTC",
      deliveryTime: "08:00",
      weekday: "Monday",
      promptAlerts: false,
      consent: false,
      consentVersion: "opportunity-alerts-v1",
    },
  };
  const saved = await call("/api/onboarding/scouts", input);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.discovery, "pending");
  assert.equal(saved.body.alerts.consent, false);
  const retry = await call("/api/onboarding/scouts", input);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.id, saved.body.id);
  assert.equal(
    (await call(`/api/onboarding/scouts/${saved.body.id}`)).status,
    200,
  );
  const scouts = await call("/api/scouts");
  assert.equal(scouts.status, 200);
  assert.deepEqual(
    scouts.body.items.map((item) => item.id),
    [saved.body.id],
  );
  assert.equal(scouts.headers.get("cache-control"), "no-store, private");
  assert.equal((await call("/api/scouts?after=invalid")).status, 400);
  const dashboard = await readPage("/dashboard");
  assert.equal(dashboard.status, 200);
  // Next development forces no-cache; production dynamic pages use private, no-store.
  assert.match(dashboard.headers.get("cache-control"), /no-store|no-cache/);
  const html = await dashboard.text();
  assert.match(html, /Synthetic connection check/);
  assert.match(html, /Search queued|Source needed/);
  assert.match(html, /Opportunity emails off/);
  const sessionToken =
    cookies.get("scout-session") ?? cookies.get("__Host-scout-session");
  assert.ok(sessionToken);
  assert.equal(html.includes(sessionToken), false);
  const examples = await readPage("/dashboard/examples?category=services");
  assert.equal(examples.status, 200);
  assert.match(await examples.text(), /Illustrative opportunities/);
  const changePath = `/api/scouts/${saved.body.id}/change`;
  const pause = {
    key: randomUUID(),
    action: "pause",
    version: scouts.body.items[0].version,
  };
  assert.equal(
    (await call(changePath, pause, { headers: { "x-scout-csrf": "forged" } }))
      .status,
    403,
  );
  assert.equal(
    (
      await call(changePath, pause, {
        headers: { origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  const paused = await call(changePath, pause);
  assert.equal(paused.status, 200);
  assert.equal(paused.body.status, "paused");
  assert.deepEqual((await call(changePath, pause)).body, paused.body);
  assert.equal(
    (await call(changePath, { ...pause, key: randomUUID(), action: "resume" }))
      .status,
    409,
  );
  const editPage = await readPage(`/dashboard/scouts/${saved.body.id}`);
  assert.equal(editPage.status, 200);
  const editorHtml = await editPage.text();
  assert.match(editorHtml, /Edit your scout/);
  assert.match(editorHtml, /Countries covered by these details/);
  const invalid = await call(changePath, {
    key: randomUUID(),
    version: paused.body.version,
    action: "update",
    search: { ...input.search, target: "" },
    alerts: input.alerts,
  });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.issues[0].field, "target");
  const edited = await call(changePath, {
    key: randomUUID(),
    version: paused.body.version,
    action: "update",
    search: {
      ...input.search,
      name: "Revised synthetic scout",
      authorizationLocations: "Nigeria",
      sponsorshipNeed: "not_needed",
      authorizationConfirmed: true,
    },
    alerts: input.alerts,
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.status, "paused");
  assert.equal(edited.body.name, "Revised synthetic scout");
  assert.equal(edited.body.search.authorizationLocations, "Nigeria");
  assert.equal(edited.body.search.authorizationConfirmed, true);
  assert.equal(edited.body.search.sponsorshipNeed, "not_needed");
  const feedbackBody = {
    key: randomUUID(),
    postingId: "unrelated:posting",
    version: 0,
    value: "hidden",
  };
  assert.equal(
    (
      await call("/api/scouts/feedback", feedbackBody, {
        headers: { "x-scout-csrf": "forged" },
      })
    ).status,
    403,
  );
  assert.equal((await call("/api/scouts/feedback", feedbackBody)).status, 404);
  assert.equal((await call("/api/identity/logout", {})).status, 200);
  assert.equal((await call("/api/scouts")).status, 401);
  const signedOut = await readPage("/dashboard");
  const redirectPage = await signedOut.text();
  assert.ok(
    signedOut.headers.get("location") === "/sign-in" ||
      /url=\/sign-in/.test(redirectPage),
  );
  assert.equal(
    (await call(`/api/onboarding/scouts/${saved.body.id}`)).status,
    401,
  );
  console.info(
    "Connected onboarding and dashboard check passed: CSRF, verification, private sessions, activation retries, account-owned listing, server rendering, revision-fenced edits and pauses, feedback boundaries, examples and logout.",
  );
}

try {
  await checkConnection();
} finally {
  // A failed assertion must also revoke this script's own synthetic session.
  if (cookies.get("scout-session") || cookies.get("__Host-scout-session")) {
    await call("/api/identity/logout", {}).catch(() => null);
  }
}
