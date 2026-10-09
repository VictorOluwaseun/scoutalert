import type {
  DiscoveryExploration,
  SourceDocumentResult,
} from "../domain/contracts.js";

/** Selects only observed same-origin continuations, bounded by page count and repeated-result signatures. */
export function sourceNextPages(
  document: SourceDocumentResult,
  snapshot: DiscoveryExploration,
): string[] {
  if (!document.pagination || document.status !== "fetched") {
    return [];
  }
  const origin = new URL(document.url).origin;
  const pages = snapshot.operations.flatMap(({ result }) =>
    result?.kind === "document" &&
    result.status === "fetched" &&
    result.pagination?.next.length &&
    new URL(result.url).origin === origin
      ? [result]
      : [],
  );
  if (pages.length >= (snapshot.plan.exploration?.maximumSourcePages ?? 3)) {
    return [];
  }
  const repeated = snapshot.operations.some(
    ({ result }) =>
      result?.kind === "document" &&
      result.url !== document.url &&
      result.pagination?.contentFingerprint ===
        document.pagination!.contentFingerprint &&
      new URL(result.url).origin === origin,
  );
  if (repeated) {
    return [];
  }
  const seen = new Set(
    snapshot.operations.flatMap(({ input }) =>
      input.kind === "document" ? [identity(input.url)] : [],
    ),
  );
  return document.pagination.next.slice(0, 2).filter((url) => {
    try {
      return new URL(url).origin === origin && !seen.has(identity(url));
    } catch {
      return false;
    }
  });
}

/** Query ordering and fragments cannot manufacture a new page in a navigation cycle. */
function identity(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.searchParams.sort();
  return url.href;
}
