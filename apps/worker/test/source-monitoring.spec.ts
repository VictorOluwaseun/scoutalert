import { describe, expect, it } from "vitest";
import {
  monitorFingerprint,
  monitorLinks,
  monitoringKind,
  nextMonitorCheck,
  type MonitorCandidate,
  type SourceDocumentResult,
  type SourceMonitor,
} from "@repo/core/discovery";
import { reviewInput } from "@repo/adapters/discovery";
import { demandReview } from "./fixtures/lead-review.js";

const document: SourceDocumentResult = {
  kind: "document",
  url: "https://example.org/careers",
  checkedAt: new Date().toISOString(),
  status: "fetched",
  reason: null,
  text: "Directory: Product designer opportunities. Browse current openings.",
  fingerprint: "one",
  posting: null,
  hostDelaySeconds: 2,
  links: [{ url: "https://example.org/jobs/design", text: "Product designer" }],
};
const input = reviewInput({
  id: "one",
  url: document.url,
  title: null,
  snippet: null,
  content_status: "fetched",
  document,
  last_seen_at: document.checkedAt,
});
const candidate: MonitorCandidate = {
  leadId: "one",
  reviewKey: "review",
  input,
  review: { ...demandReview(input), label: "directory" },
  document,
};
const monitor: SourceMonitor = {
  id: "one",
  url: document.url,
  kind: "directory",
  depth: 0,
  fingerprint: monitorFingerprint(document),
  unchanged: 0,
  failures: 0,
};

describe("source monitoring policy", () => {
  it("requires recent complete cited source evidence, not snippets or stale classifications", () => {
    expect(monitoringKind(candidate, new Date())).toBe("directory");
    expect(
      monitoringKind(
        { ...candidate, input: { ...input, scope: "search_excerpt" } },
        new Date(),
      ),
    ).toBeNull();
    expect(
      monitoringKind(
        { ...candidate, input: { ...input, truncated: true } },
        new Date(),
      ),
    ).toBeNull();
    expect(
      monitoringKind(candidate, new Date(Date.now() + 7 * 3600000)),
    ).toBeNull();
    expect(
      monitoringKind(
        {
          ...candidate,
          review: { ...candidate.review, label: "service_offer" },
        },
        new Date(),
      ),
    ).toBeNull();
  });
  it("recognizes changed destinations even when visible text stays identical", () => {
    const changed = {
      ...document,
      links: [
        {
          url: "https://example.org/jobs/design-new",
          text: "Product designer",
        },
      ],
    };
    expect(nextMonitorCheck(monitor, document)).toMatchObject({
      changed: false,
      intervalMinutes: 60,
    });
    expect(nextMonitorCheck(monitor, changed)).toMatchObject({
      changed: true,
      intervalMinutes: 30,
    });
  });
  it("bounds backoff and retains explicit access gaps without claiming closure", () => {
    expect(
      nextMonitorCheck({ ...monitor, unchanged: 50 }, document),
    ).toMatchObject({ intervalMinutes: 1440 });
    expect(
      nextMonitorCheck(monitor, {
        ...document,
        status: "access_limited",
        reason: "crawl_policy_denied",
      }),
    ).toMatchObject({ status: "deferred", changed: false, failures: 1 });
    expect(
      nextMonitorCheck(monitor, {
        ...document,
        truncated: true,
        reason: "browser_deadline",
      }),
    ).toMatchObject({
      status: "deferred",
      changed: false,
      failures: 1,
      reason: "browser_deadline",
    });
    expect(
      nextMonitorCheck({ ...monitor, kind: "probe", failures: 2 }, null),
    ).toMatchObject({ status: "retired" });
    expect(
      nextMonitorCheck(
        { ...monitor, kind: "probe", fingerprint: null },
        document,
      ),
    ).toMatchObject({ status: "pending_review" });
  });
  it("excludes obvious seller, account and advice links from expansion", () => {
    expect(
      monitorLinks({
        ...document,
        links: [
          ...document.links!,
          { url: "https://example.org/jobs/advice", text: "Career advice" },
          { url: "https://example.org/projects/seller", text: "Hire me" },
          { url: "https://example.org/about", text: "About us" },
        ],
      }),
    ).toEqual(document.links);
  });
});
