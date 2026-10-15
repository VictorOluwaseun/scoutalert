import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PublicPageSession,
  PublicHttpRepository,
} from "@repo/adapters/discovery";

const clock = vi.hoisted(() => ({ now: 100_000, waits: [] as number[] }));
vi.mock("node:timers/promises", () => ({
  /** Advances the isolated test clock while retaining abort behavior and exact requested spacing. */
  setTimeout: async (
    milliseconds: number,
    _value: unknown,
    options: { signal: AbortSignal },
  ) => {
    options.signal.throwIfAborted();
    clock.waits.push(milliseconds);
    clock.now += milliseconds;
  },
}));

/** Records request start times to verify robots delays without waiting on wall time or external servers. */
class PacingHttp extends PublicHttpRepository {
  readonly calls: { url: string; at: number }[] = [];

  /** Supplies one source's explicit robots policy. */
  constructor(private readonly robots: string) {
    super();
  }

  /** Returns a public HTML page only after the session has applied its crawl policy. */
  override async read(url: string) {
    this.calls.push({ url, at: clock.now });
    const policy = url.endsWith("/robots.txt");
    return {
      status: 200,
      contentType: policy ? "text/plain" : "text/html",
      body: policy ? this.robots : "<p>Public request</p>",
    };
  }
}

describe("public source crawl pacing", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    clock.now = 100_000;
    clock.waits = [];
    vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  });

  it.each([20, 30])(
    "honors a %s-second policy for robots, page and queued resource requests",
    async (seconds) => {
      const http = new PacingHttp(`User-agent: *\nCrawl-delay: ${seconds}`);
      const session = new PublicPageSession(http, new AbortController().signal);
      await Promise.all([
        session.read("https://rfp.example.org/brief"),
        session.read("https://rfp.example.org/details"),
      ]);
      expect(http.calls.map(({ at }) => at)).toEqual([
        100_000,
        100_000 + seconds * 1000,
        100_000 + seconds * 2000,
      ]);
      expect(clock.waits).toEqual([seconds * 1000, seconds * 1000]);
      expect(session.hostDelaySeconds).toBe(seconds);
      expect(session.requests).toBe(3);
      session.close();
    },
  );

  it("does not shorten excessive delays, override robots denial, or fetch after cancellation", async () => {
    for (const [policy, reason] of [
      ["Crawl-delay: 31", "crawl_delay_exceeds_run_budget"],
      ["Crawl-delay: 20\nDisallow: /brief", "crawl_policy_denied"],
    ]) {
      const http = new PacingHttp(`User-agent: *\n${policy}`);
      const session = new PublicPageSession(http, new AbortController().signal);
      await expect(
        session.read("https://rfp.example.org/brief"),
      ).rejects.toThrow(reason);
      expect(http.calls).toHaveLength(1);
      session.close();
      await expect(
        session.read("https://rfp.example.org/other"),
      ).rejects.toThrow();
      expect(http.calls).toHaveLength(1);
    }
  });
});
