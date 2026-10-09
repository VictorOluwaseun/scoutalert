import {
  BrowserDocumentRepository,
  PublicSourceDocumentRepository,
  PublicHttpRepository,
} from "../../packages/adapters/dist/discovery/public.js";

const urls = process.argv.slice(2);
if (
  urls.length < 1 ||
  urls.length > 3 ||
  urls.some((value) => new URL(value).protocol !== "https:")
) {
  throw new Error("Pass one to three explicit public HTTPS URLs.");
}
const repository = new PublicSourceDocumentRepository(
  new PublicHttpRepository(),
  new BrowserDocumentRepository(),
);
const captures = [];
for (const url of urls) {
  const start = performance.now();
  const result = await repository.read(url);
  captures.push({
    url,
    checkedAt: result.checkedAt,
    status: result.status,
    reason: result.reason,
    truncated: result.truncated ?? false,
    capture: result.capture,
    characters: result.text?.length ?? 0,
    links: result.links?.length ?? 0,
    searchForms: result.searchForms?.length ?? 0,
    milliseconds: Math.round(performance.now() - start),
    formalPosting: Boolean(result.posting),
  });
}
console.log(
  JSON.stringify(
    {
      kind: "live-source-read-smoke-check",
      captures,
      limitations:
        "Read-only public captures. No AI assessment, personal match, email or comprehensive coverage test.",
    },
    null,
    2,
  ),
);
