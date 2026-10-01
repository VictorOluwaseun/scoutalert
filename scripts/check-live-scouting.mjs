import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const origin = process.env.SCOUTALERT_WEB_ORIGIN ?? "http://localhost:3030";
const mailbox = process.env.MAILPIT_HTTP_URL ?? "http://127.0.0.1:8025";
const email = `live-scouting-${randomUUID()}@scoutalert.test`;
const cookies = new Map();
let csrf;

/** Uses only the public Next.js boundary and a new synthetic account's own cookie jar. */
async function call(path, body) {
  const response = await fetch(new URL(path, origin), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      ...(body === undefined
        ? {}
        : { origin, "content-type": "application/json", "x-scout-csrf": csrf }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  for (const header of response.headers.getSetCookie()) {
    const cookie = header.split(";")[0];
    const position = cookie.indexOf("=");
    cookies.set(cookie.slice(0, position), cookie.slice(position + 1));
  }
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response.json();
}

/** Reads only messages belonging to this test's logical recipient or verification identity. */
async function messages(query) {
  const url = new URL("/api/v1/search", mailbox);
  url.searchParams.set("query", query);
  const result = await fetch(url, { signal: AbortSignal.timeout(5_000) }).then(
    (response) => response.json(),
  );
  return result.messages;
}

/** Verifies saved scouts, actual source postings, grouped current recommendations, and captured scheduled delivery. */
async function verify() {
  csrf = (await call("/api/identity/context")).csrfToken;
  const challenge = await call("/api/identity/code", { email });
  const proof = await messages(`message-id:${challenge.id}@scoutalert.test`);
  assert.equal(proof.length, 1);
  const verification = await fetch(
    new URL(`/api/v1/message/${proof[0].ID}`, mailbox),
  ).then((response) => response.json());
  const code = verification.Text.match(/code is (\d{6})/u)?.[1];
  assert.ok(code);
  await call("/api/identity/verify", { id: challenge.id, code });
  const search = {
    goal: "Find account executive jobs",
    category: "employment",
    target: "Account Executive",
    name: "Live account executive scout",
    arrangement: "open",
    arrangementRequired: false,
    residence: "",
    workLocations: "",
    background: "Sales experience",
    minimumPay: "",
    currency: "USD",
    payPeriod: "year",
    unknownEligibility: "review",
    undisclosedPay: "include",
  };
  const alerts = {
    frequency: "daily",
    timezone: "UTC",
    deliveryTime: "00:00",
    weekday: "Monday",
    promptAlerts: false,
    consent: true,
    consentVersion: "opportunity-alerts-v1",
  };
  const first = { key: randomUUID(), search, alerts, confirmed: true };
  const scout = await call("/api/onboarding/scouts", first);
  assert.equal((await call("/api/onboarding/scouts", first)).id, scout.id);
  const another = await call("/api/onboarding/scouts", {
    ...first,
    key: randomUUID(),
    search: { ...search, name: "Live overlapping sales scout" },
  });
  let page;
  for (let attempt = 0; attempt < 120; attempt++) {
    page = await call("/api/scouts");
    if (
      page.items.every((item) => item.discovery === "completed") &&
      page.opportunities.length &&
      page.discovery.email.acceptedAt
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.ok(page.opportunities.length > 0, "No real opportunities appeared.");
  assert.ok(
    page.items.some(
      (item) => item.id === scout.id && item.discovery === "completed",
    ),
  );
  assert.ok(
    page.items.some(
      (item) => item.id === another.id && item.discovery === "completed",
    ),
  );
  assert.ok(
    page.opportunities.some((opportunity) => opportunity.scouts.length === 2),
    "Overlapping recommendations were not grouped.",
  );
  assert.ok(
    page.opportunities.every(
      (opportunity) =>
        opportunity.url.startsWith("https://") &&
        opportunity.uncertainties.length > 0,
    ),
  );
  assert.ok(
    page.discovery.email.acceptedAt,
    "No scheduled opportunity email was accepted.",
  );
  const captured = await messages(
    `to:${email} subject:"opportunities to review"`,
  );
  assert.equal(captured.length, 1);
  const message = await fetch(
    new URL(`/api/v1/message/${captured[0].ID}`, mailbox),
  ).then((response) => response.json());
  assert.match(message.Text, /Read the reasons and unresolved questions/);
  assert.match(message.Text, /https:\/\//);
  const assessed = page.opportunities.filter(
    (opportunity) => opportunity.detail?.assessedBy === "ai",
  );
  if (process.env.SCOUT_AI_LIVE_CHECK === "1")
    assert.ok(
      assessed.length > 0,
      "No evidence-linked AI recommendation appeared.",
    );
  console.info(
    JSON.stringify({
      result: "Live scouting check passed",
      scouts: page.items.length,
      groupedOpportunities: page.opportunities.length,
      aiAssessed: assessed.length,
      capturedDigests: captured.length,
      sources: page.discovery.sources.map((source) => source.id),
    }),
  );
}
try {
  await verify();
} finally {
  if (cookies.has("scout-session") || cookies.has("__Host-scout-session"))
    await call("/api/identity/logout", {});
}
