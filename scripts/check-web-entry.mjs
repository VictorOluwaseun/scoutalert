import assert from "node:assert/strict";

const origin = process.env.SCOUTALERT_WEB_ORIGIN ?? "http://localhost:3030";

/** Reads public responses without following redirects, creating accounts, or activating scouts. */
async function readPage(path) {
  const response = await fetch(new URL(path, origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });

  return { response, html: await response.text() };
}

/** Protects direct onboarding entry and verifies that search metadata follows that product flow. */
async function checkWebEntry() {
  const root = await readPage("/");
  assert.equal(
    root.response.status,
    307,
    "The root must redirect straight to onboarding",
  );
  assert.equal(root.response.headers.get("location"), "/onboarding");

  for (const path of ["/onboarding", "/onboarding?utm_source=entry-check"]) {
    const { response, html } = await readPage(path);
    assert.equal(response.status, 200, path);
    assert.deepEqual(
      [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map(
        (match) => match[1],
      ),
      ["index, follow"],
      `${path} must be indexable`,
    );
    assert.match(
      html,
      /rel="canonical" href="https:\/\/scoutalert.app\/onboarding"/,
    );
    assert.match(
      html,
      /property="og:url" content="https:\/\/scoutalert.app\/onboarding"/,
    );
    assert.match(html, /application\/ld\+json/);
  }

  for (const path of [
    "/onboarding?step=goal",
    "/onboarding?step=focus",
    "/onboarding?step=verify",
    "/onboarding?step=goal&step=verify",
    "/onboarding?new=1",
    "/onboarding?scout=entry-check",
    "/sign-in",
    "/preview/discovery",
  ]) {
    const { response, html } = await readPage(path);
    assert.equal(response.status, 200, path);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(html, /rel="canonical"/);
  }

  const sitemap = await readPage("/sitemap.xml");
  assert.equal(sitemap.response.status, 200);
  assert.deepEqual(
    [...sitemap.html.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]),
    ["https://scoutalert.app/onboarding"],
  );

  console.log(
    "Direct onboarding redirect, canonical entry, sitemap, and index exclusions passed.",
  );
}

await checkWebEntry();
