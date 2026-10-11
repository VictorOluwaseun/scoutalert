import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../packages/adapters/package.json", import.meta.url),
);
const { chromium } = require("playwright");

// Browser regression against the local preview. Synthetic local storage and mocked API responses only.
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/identity/context", (route) =>
  route.fulfill({
    json: { account: null, challenge: null, csrfToken: "test-token" },
  }),
);
await page.route("**/api/onboarding/review", (route) =>
  route.fulfill({ json: { status: "review_ready" } }),
);
try {
  await page.goto("http://localhost:3030/onboarding?step=goal&new=1");
  await page
    .getByLabel("What would you like your scout to find?")
    .fill("Find remote product design work");
  await page.getByRole("button", { name: "Continue to details" }).click();
  await page.waitForURL("**step=focus");
  await page.locator("#target").fill("Product designer");
  await page.getByRole("button", { name: "Continue to preferences" }).click();
  await page.waitForURL("**step=preferences");
  await page.getByRole("button", { name: "Review my scout" }).click();
  await page.waitForURL("**step=review");
  await page
    .getByRole("button", { name: "Continue to alert settings" })
    .waitFor();
  await page.goBack();
  await page.waitForURL("**step=preferences");
  await page.goForward();
  await page.waitForURL("**step=review");
  await page
    .getByRole("button", { name: "Continue to alert settings" })
    .waitFor();
  await page.goto("http://localhost:3030/onboarding");
  await page.waitForURL("**step=review");
  await page
    .getByRole("button", { name: "Continue to alert settings" })
    .waitFor();
  await page.goto("http://localhost:3030/onboarding?step=verify");
  await page.waitForURL("**step=email");
  await page.getByRole("button", { name: "Send verification code" }).waitFor();
  await page.goto("http://localhost:3030/onboarding?step=preferences");
  await page.getByRole("button", { name: "Review my scout" }).waitFor();
  let releaseReview;
  const reviewGate = new Promise((resolve) => {
    releaseReview = resolve;
  });
  let observedRequest;
  const reviewStarted = new Promise((resolve) => {
    observedRequest = resolve;
  });
  await page.route("**/api/onboarding/review", async (route) => {
    observedRequest();
    await reviewGate;
    await route.fulfill({ json: { status: "review_ready" } });
  });
  await page.getByRole("button", { name: "Review my scout" }).click();
  await reviewStarted;
  await page.locator("#residence").fill("New York, United States");
  releaseReview();
  await page
    .getByText("Your answers changed while we checked them. Review again.")
    .waitFor();
  assert.ok(page.url().endsWith("step=preferences"));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: server-reviewed route, browser Back/Forward, restored review, verification access guard and stale-review rejection (mock API)",
  );
} finally {
  await browser.close();
}
