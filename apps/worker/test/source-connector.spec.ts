import { afterEach, describe, expect, it, vi } from "vitest";
import { GreenhouseSourceConnector } from "@repo/adapters/scouting";

const job = {
  id: 1,
  internal_job_id: 101,
  title: "Product Designer",
  updated_at: "2026-10-01T00:00:00Z",
  absolute_url: "https://example.com/job",
  location: { name: "Remote" },
  content: "&lt;p&gt;A role in &lt;strong&gt;design&lt;/strong&gt;&lt;/p&gt;",
};
const connector = new GreenhouseSourceConnector({ example: "Example" });

describe("complete public source snapshots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("normalizes encoded HTML and retains job/family identity without rendering source markup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          jobs: [job, { ...job, id: 2, internal_job_id: null }],
          meta: { total: 2 },
        }),
      ),
    );
    const snapshot = await connector.read("example", new Date());
    expect(snapshot.postings).toHaveLength(1);
    expect(snapshot.postings[0]?.text).toBe("A role in design");
    expect(snapshot.postings[0]?.familyId).toBe("example:101");
  });
  it("rejects partial boards, malformed posts and unsafe source links", async () => {
    for (const body of [
      { jobs: [job], meta: { total: 2 } },
      { jobs: [{ ...job, title: null }], meta: { total: 1 } },
      {
        jobs: [{ ...job, absolute_url: "javascript:alert(1)" }],
        meta: { total: 1 },
      },
      { jobs: [job, job], meta: { total: 2 } },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(body)),
      );
      await expect(connector.read("example", new Date())).rejects.toThrow();
    }
  });
  it("refuses user-controlled boards before making a request and enforces the response-byte limit", async () => {
    const fetch = vi.fn(async () => new Response("x".repeat(8_000_001)));
    vi.stubGlobal("fetch", fetch);
    await expect(connector.read("untrusted", new Date())).rejects.toThrow(
      "unsupported_source",
    );
    await expect(connector.read("__proto__", new Date())).rejects.toThrow(
      "unsupported_source",
    );
    expect(fetch).not.toHaveBeenCalled();
    await expect(connector.read("example", new Date())).rejects.toThrow(
      "source_too_large",
    );
  });
});
