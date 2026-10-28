import type { SourceDocumentResult } from "@repo/core/discovery";
import type { PublicPageSession } from "./public-page-session.js";
import { PdfTextRepository } from "./pdf-text.js";
import { discoveryKey } from "../persistence/discovery-identities.js";

/** Turns a permitted PDF response into cited page text; partial extraction never authorizes publication. */
export async function pdfSourceContent(
  bytes: Uint8Array,
  empty: SourceDocumentResult,
  session: PublicPageSession,
): Promise<SourceDocumentResult> {
  const parsed = await new PdfTextRepository().read(bytes, session.signal);
  return {
    ...empty,
    checkedAt: new Date().toISOString(),
    status: parsed.reason ? "access_limited" : "fetched",
    reason: parsed.reason,
    text: parsed.text || null,
    fingerprint: discoveryKey(["public-pdf-v2", parsed]),
    truncated: parsed.reason !== null,
    hostDelaySeconds: session.hostDelaySeconds,
    links: parsed.links,
    pdf: { pages: parsed.pages, extractedPages: parsed.extractedPages },
    capture: {
      method: "http",
      parser: "public-pdf-v2",
      requests: session.requests,
      bytes: session.bytes,
      complete: parsed.reason === null,
    },
  };
}
