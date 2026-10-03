import { validLeadReview } from "./review-policy.js";
import type { SourceDocumentResult } from "./contracts.js";
import type {
  MonitorCandidate,
  MonitorKind,
  MonitorOutcome,
  SourceMonitor,
} from "./source-monitoring.js";

/** Selects visible demand links, not authentication, advice, pagination traps or seller advertisements. */
export function monitorLinks(
  document: SourceDocumentResult,
): { url: string; text: string }[] {
  const unique = new Map<string, { url: string; text: string }>();
  for (const link of document.links ?? []) {
    if (
      !link.text.trim() ||
      /\b(?:sign in|log in|register|privacy|subscribe|salary guide|career advice|hire me|my services)\b/iu.test(
        link.text,
      )
    ) {
      continue;
    }
    if (
      !/\/(?:jobs?|positions?|openings?|careers?|projects?|requests?|opportunities)\/[^/?#]+/iu.test(
        link.url,
      ) &&
      !/\b(?:hiring|vacancy|apply for|project brief|seeking|request for proposals)\b/iu.test(
        link.text,
      )
    ) {
      continue;
    }
    unique.set(link.url, link);
  }
  return [...unique.values()].slice(0, 80);
}

/** Promotes only recent complete source reviews, with actionable anchors required for directories. */
export function monitoringKind(
  candidate: MonitorCandidate,
  now: Date,
): Exclude<MonitorKind, "probe"> | null {
  const { document, input, review } = candidate;
  const age = now.getTime() - Date.parse(document.checkedAt);
  if (
    document.nativePost ||
    input.scope !== "source" ||
    input.truncated ||
    document.status !== "fetched" ||
    input.documentFingerprint !== document.fingerprint ||
    age < -60_000 ||
    age > 6 * 60 * 60_000 ||
    !validLeadReview(input, review)
  ) {
    return null;
  }
  if (["job_opening", "client_request"].includes(review.label)) {
    return "posting";
  }
  if (review.label === "directory" && monitorLinks(document).length > 0) {
    return "directory";
  }
  return null;
}

/** Compares text and destinations: a changed link can expose a new posting even when visible text is identical. */
export function monitorFingerprint(document: SourceDocumentResult): string {
  return JSON.stringify([
    document.fingerprint,
    monitorLinks(document)
      .map(({ url, text }) => [url, text])
      .sort(),
  ]);
}

/** Adapts revisit intervals within a finite range; failures retain gaps and probes wait for evidence review. */
export function nextMonitorCheck(
  monitor: SourceMonitor,
  result: SourceDocumentResult | null,
): MonitorOutcome {
  if (!result || result.status !== "fetched") {
    const failures = monitor.failures + 1;
    const retired =
      result?.status === "blocked" ||
      (monitor.kind === "probe" && failures >= 3);
    return {
      status: retired ? "retired" : "deferred",
      reason: result?.reason ?? "attempt_outcome_unknown",
      intervalMinutes: Math.min(1440, 60 * 2 ** Math.min(failures - 1, 5)),
      unchanged: monitor.unchanged,
      failures,
      changed: false,
    };
  }
  const changed = monitor.fingerprint !== monitorFingerprint(result);
  const unchanged = changed ? 0 : monitor.unchanged + 1;
  return {
    status: monitor.kind === "probe" ? "pending_review" : "active",
    reason: changed ? "source_changed" : "source_unchanged",
    intervalMinutes: Math.min(1440, 30 * 2 ** Math.min(unchanged, 6)),
    unchanged,
    failures: 0,
    changed,
  };
}
