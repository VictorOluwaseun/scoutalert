import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GreenhouseSourceConnector,
  GreenhouseAvailabilitySource,
} from "@repo/adapters/scouting";

const job = {
  id: 1,
  internal_job_id: 101,
  title: "Product Designer",
  updated_at: "2026-10-01T00:00:00Z",
  absolute_url: "https://example.com/job",
  location: { name: "Remote" },
  content: "&lt;p&gt;Remote in Nigeria&lt;/p&gt;",
};
const source = new GreenhouseAvailabilitySource({ example: "Example" });

/** Normalizes the fixture through actual collection so research must compare the same meaningful fields. */
async function posting() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ jobs: [job], meta: { total: 1 } })),
  );
  return (
    await new GreenhouseSourceConnector({ example: "Example" }).read(
      "example",
      new Date(),
    )
  ).postings[0]!;
}

describe("bounded public availability research", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("distinguishes unchanged content, edits and an unpublished posting", async () => {
    const captured = await posting();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ...job, updated_at: "2026-10-01T01:00:00Z" }),
      ),
    );
    expect((await source.check(captured)).status).toBe("available");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ...job, content: "United States only" }),
      ),
    );
    expect((await source.check(captured)).status).toBe("changed");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect((await source.check(captured)).status).toBe("closed");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ...job, application_deadline: "2020-01-01T00:00:00Z" }),
      ),
    );
    expect((await source.check(captured)).status).toBe("closed");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ...job, application_deadline: "next Friday" }),
      ),
    );
    expect((await source.check(captured)).status).toBe("unresolved");
  });
  it("does not treat provider failure, wrong identity or oversized content as a closed or verified posting", async () => {
    const captured = await posting();
    for (const response of [
      new Response(null, { status: 429 }),
      Response.json({ ...job, id: 2 }),
      new Response("x".repeat(1_000_001)),
      Response.json({ content: "partial" }),
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response),
      );
      expect((await source.check(captured)).status).toBe("unresolved");
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    expect((await source.check(captured)).status).toBe("unresolved");
  });
  it("never follows user URLs, arbitrary boards, inherited keys or path traversal", async () => {
    const captured = await posting();
    const fetch = vi.fn(async () => Response.json(job));
    vi.stubGlobal("fetch", fetch);
    for (const unsafe of [
      { source: "__proto__" },
      { source: "private" },
      { externalId: "../1" },
    ])
      expect((await source.check({ ...captured, ...unsafe })).status).toBe(
        "unresolved",
      );
    expect(fetch).not.toHaveBeenCalled();
    await source.check({ ...captured, url: "http://127.0.0.1/secrets" });
    expect(fetch).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/example/jobs/1",
      expect.objectContaining({ redirect: "error" }),
    );
  });
});
