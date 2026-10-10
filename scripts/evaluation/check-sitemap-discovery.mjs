import { writeFile } from "node:fs/promises";
import { PublicSourceDocumentRepository } from "../../packages/adapters/dist/discovery/public.js";

// Four public document captures at most, no account data, application configuration, AI, paid search or email.
const seed = "https://weworkremotely.com/";
const reader = new PublicSourceDocumentRepository();
const started = performance.now();
const documents = [];
const pending = [{ url: seed, parent: null }];
const seen = new Set();
let baseline = new Set();
const sitemapLinks = new Set();

while (pending.length && documents.length < 4) {
  const next = pending.shift();
  if (seen.has(next.url)) {
    continue;
  }
  seen.add(next.url);
  const began = performance.now();
  const document = await reader.read(next.url);
  documents.push({
    url: document.url,
    parent: next.parent,
    retrievedUrl: document.retrievedUrl ?? null,
    status: document.status,
    reason: document.reason,
    sitemap: document.sitemap ?? null,
    advertisedSitemaps: document.sitemaps ?? [],
    retainedLinks: document.links?.length ?? 0,
    formalPosting: !!document.posting,
    capture: document.capture,
    milliseconds: Math.round(performance.now() - began),
  });
  if (document.url === seed) {
    baseline = new Set((document.links ?? []).map((link) => link.url));
    pending.push(
      ...(document.sitemaps ?? [])
        .slice(0, 1)
        .map((link) => ({ url: link.url, parent: document.url })),
    );
    continue;
  }
  if (document.status !== "fetched" || !document.sitemap) {
    continue;
  }
  if (document.sitemap.format === "urlset") {
    for (const link of document.links ?? []) {
      sitemapLinks.add(link.url);
    }
  }
  const candidate =
    (document.links ?? []).find((link) =>
      /(?:jobs?|projects?|requests?)/iu.test(new URL(link.url).pathname),
    ) ?? (document.sitemap.format === "index" ? document.links?.[0] : null);
  if (candidate) {
    pending.push({ url: candidate.url, parent: document.url });
  }
}
const incremental = [...sitemapLinks].filter((url) => !baseline.has(url));
const report = {
  kind: "bounded-live-sitemap-discovery",
  recordedAt: new Date().toISOString(),
  seed,
  documents,
  baselineHtmlLinks: baseline.size,
  sitemapLinkWindow: sitemapLinks.size,
  additionalPageUrls: incremental.length,
  sampleAdditionalUrls: incremental.slice(0, 3),
  httpRequests: documents.reduce(
    (sum, item) => sum + (item.capture?.requests ?? 0),
    0,
  ),
  accountedBytes: documents.reduce(
    (sum, item) => sum + (item.capture?.bytes ?? 0),
    0,
  ),
  elapsedMilliseconds: Math.round(performance.now() - started),
  aiRequests: 0,
  paidSearchRequests: 0,
  modelAndSearchCostUsd: 0,
  limitations:
    "Known public homepage seeded explicitly. Additional URLs are relative only to its bounded HTML-link capture, not to Google's index or prior platform coverage. A sitemap is an unassessed URL window; this check does not establish personal relevance, full-site recall or global scale. No account worker, database, model review or email was invoked. Public HTTP hosting/compute costs are not priced; the diagnostic's bounded captures are separate from the worker ledger.",
};
const output = process.argv
  .find((arg) => arg.startsWith("--output="))
  ?.slice(9);
if (output) {
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
}
console.log(JSON.stringify(report, null, 2));
