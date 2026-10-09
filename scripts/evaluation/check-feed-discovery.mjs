import { writeFile } from "node:fs/promises";
import { PublicSourceDocumentRepository } from "../../packages/adapters/dist/discovery/public.js";

// This public endpoint is documented by the publisher at https://weworkremotely.com/remote-job-rss-feed.
// No configuration, account state, AI provider or SMTP client is loaded by this diagnostic.
const reader = new PublicSourceDocumentRepository();
const started = performance.now();
const feed = await reader.read("https://weworkremotely.com/remote-jobs.rss");
const link = feed.links?.[0];
const detail = link ? await reader.read(link.url) : null;
const report = {
  kind: "live-public-feed-access",
  recordedAt: new Date().toISOString(),
  feed: {
    url: feed.url,
    checkedAt: feed.checkedAt,
    status: feed.status,
    reason: feed.reason,
    window: feed.feed ?? null,
    links: feed.links?.length ?? 0,
    capture: feed.capture,
    promotedAsPosting: !!feed.posting,
  },
  detail: detail
    ? {
        url: detail.url,
        titleHint: link.text,
        status: detail.status,
        reason: detail.reason,
        characters: detail.text?.length ?? 0,
        capture: detail.capture,
        structuredPosting: !!detail.posting,
      }
    : null,
  elapsedMilliseconds: Math.round(performance.now() - started),
  limitations:
    "One documented public feed and at most one observed detail page. No search-provider run, account matching, relevance assessment, notification or production-scale claim. Policy denials and unsupported access remain explicit.",
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--write")) {
  await writeFile(
    new URL(
      "../../evaluations/discovery/feed-access-2026-10-10.json",
      import.meta.url,
    ),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (
  feed.status !== "fetched" ||
  !feed.feed ||
  !feed.links?.length ||
  feed.posting
) {
  process.exitCode = 1;
}
