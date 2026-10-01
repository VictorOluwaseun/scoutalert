import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { validateCorpus } from "./corpus.mjs";

const corpusPath = process.argv[2];
assert.ok(
  corpusPath,
  "Usage: node scripts/evaluation/serve-review.mjs corpus.json [port]",
);
const port = Number(process.argv[3] ?? 3035);
assert.ok(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
const corpus = validateCorpus(JSON.parse(await readFile(corpusPath, "utf8")));
// Deliberately omit all judgments, including prior human labels, from the browser payload.
const packet = {
  schema: corpus.schema,
  capturedAt: corpus.capturedAt,
  sampling: corpus.sampling,
  contentHash: corpus.contentHash,
  postings: corpus.postings,
  documents: corpus.documents,
  briefs: corpus.briefs,
  cases: corpus.cases.map(({ id, briefId, postingId }) => ({
    id,
    briefId,
    postingId,
  })),
};
const assets = new Map([
  [
    "/",
    [
      "text/html; charset=utf-8",
      await readFile(new URL("./review/index.html", import.meta.url)),
    ],
  ],
  [
    "/review.css",
    [
      "text/css; charset=utf-8",
      await readFile(new URL("./review/review.css", import.meta.url)),
    ],
  ],
  [
    "/review.js",
    [
      "text/javascript; charset=utf-8",
      await readFile(new URL("./review/review.js", import.meta.url)),
    ],
  ],
  [
    "/manrope.woff2",
    [
      "font/woff2",
      await readFile(
        new URL("../../apps/web/app/fonts/ManropeLatin.woff2", import.meta.url),
      ),
    ],
  ],
  [
    "/review-data.json",
    ["application/json; charset=utf-8", JSON.stringify(packet)],
  ],
]);
/** Serves only the immutable review packet and bundled assets on loopback; no filesystem browsing or mutation routes exist. */
function respond(request, response) {
  const asset = assets.get(request.url);
  if (request.method !== "GET" || !asset) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "content-type": asset[0],
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(asset[1]);
}
createServer(respond).listen(port, "127.0.0.1", () =>
  console.log(
    `Independent review ready: http://127.0.0.1:${port} (${corpus.cases.length} pairs; model judgments excluded)`,
  ),
);
