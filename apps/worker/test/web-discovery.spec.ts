import { describe, expect, it, vi } from "vitest";
import { planDiscovery } from "@repo/core/discovery";
import type { SearchDraft } from "@repo/core/onboarding";
import {
  SerperSearchProvider,
  PublicSourceDocumentRepository,
  PublicHttpRepository,
  isPublicAddress,
  documentText,
  parseFormalPosting,
  canonicalDiscoveryUrl,
} from "@repo/adapters/discovery";

const brief: SearchDraft = {
  goal: "PRIVATE GOAL",
  category: "employment",
  target: "Product designer",
  name: "PRIVATE NAME",
  arrangement: "remote",
  arrangementRequired: true,
  residence: "PRIVATE RESIDENCE",
  workLocations: "PRIVATE LOCATION",
  background: "PRIVATE BACKGROUND",
  minimumPay: "60000",
  currency: "USD",
  payPeriod: "year",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
const now = new Date("2026-10-01T10:00:00Z");
const job = {
  "@type": "JobPosting",
  title: "Product designer",
  hiringOrganization: { name: "Example" },
  description: "<p>Design useful products. Remote work.</p>",
  datePosted: "2026-09-30",
  jobLocationType: "TELECOMMUTE",
};

/** Encodes a synthetic structured listing; no live source or paid provider is used. */
function html(value: unknown) {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script><p>Public description</p>`;
}

describe("public discovery boundaries", () => {
  it("exports only public target intent, preserves the confirmed brief, and covers open-web and indexed social paths", () => {
    const original = structuredClone(brief);
    const plan = planDiscovery(brief, 3, 4);
    expect(JSON.stringify(plan)).not.toContain("PRIVATE");
    expect(plan.queries).toHaveLength(4);
    expect(plan.queries.map((query) => query.query).join(" ")).toContain(
      "site:x.com",
    );
    expect(plan.queries.map((query) => query.query).join(" ")).toContain(
      "site:linkedin.com/posts",
    );
    expect(brief).toEqual(original);
    expect(plan.scoutVersion).toBe(3);
  });
  it.each([
    "person@example.com",
    "https://private.example/brief",
    "123456789",
    "designer\nprivate information",
  ])("rejects unsafe query intent %s", (target) => {
    expect(planDiscovery({ ...brief, target }, 1, 4).queries).toEqual([]);
  });
  it("looks for service demand without changing hard requirements", () => {
    expect(
      planDiscovery({ ...brief, category: "services" }, 1, 4).queries[1]!.query,
    ).toContain('"looking for"');
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.2.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])("blocks special-use address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it("admits ordinary public addresses and preserves meaningful URL variants", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(
      canonicalDiscoveryUrl(
        "https://example.com/jobs?id=1&utm_source=feed#top",
      ),
    ).toBe("https://example.com/jobs?id=1");
    expect(
      canonicalDiscoveryUrl("https://person:secret@example.com/jobs"),
    ).toBeNull();
    expect(canonicalDiscoveryUrl("https://example.internal/jobs")).toBeNull();
  });
  it("rejects mixed public/private DNS answers before opening a socket", async () => {
    const resolve = vi.fn().mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    const http = new PublicHttpRepository(resolve);
    await expect(
      http.read("https://example.com/job", 1000, AbortSignal.timeout(2000)),
    ).rejects.toThrow("source_address_blocked");
  });
  it("does not fetch pages denied by robots or follow redirected crawl policy", async () => {
    const read = vi.fn().mockResolvedValue({
      status: 200,
      contentType: "text/plain",
      body: "User-agent: ScoutAlert\nDisallow: /",
    });
    const repository = new PublicSourceDocumentRepository({
      read,
    } as unknown as PublicHttpRepository);
    expect((await repository.read("https://example.com/job")).reason).toBe(
      "crawl_policy_denied",
    );
    expect(read).toHaveBeenCalledTimes(1);
    read.mockResolvedValue({ status: 302, contentType: "text/html", body: "" });
    expect((await repository.read("https://example.com/job")).status).toBe(
      "access_limited",
    );
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("does not interpret a login or challenge HTML page as permissive robots", async () => {
    const read = vi.fn().mockResolvedValue({
      status: 200,
      contentType: "text/html",
      body: "<p>Log in</p>",
    });
    const repository = new PublicSourceDocumentRepository({
      read,
    } as unknown as PublicHttpRepository);
    expect((await repository.read("https://example.com/job")).reason).toBe(
      "crawl_policy_unavailable",
    );
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("keeps informal, incomplete, expired and multi-job pages as leads", () => {
    expect(
      parseFormalPosting(
        "<p>Looking for a designer. Message me.</p>",
        "https://example.com/post",
        now,
      ),
    ).toBeNull();
    expect(
      parseFormalPosting(
        html({ ...job, hiringOrganization: undefined }),
        "https://example.com/job",
        now,
      ),
    ).toBeNull();
    expect(
      parseFormalPosting(
        html({ ...job, validThrough: "2026-09-01" }),
        "https://example.com/job",
        now,
      ),
    ).toBeNull();
    expect(
      parseFormalPosting(html([job, job]), "https://example.com/jobs", now),
    ).toBeNull();
  });
  it("promotes only explicit formal facts and strips executable content", () => {
    expect(
      parseFormalPosting(html(job), "https://example.com/job", now),
    ).toMatchObject({
      company: "Example",
      title: "Product designer",
      location: "Remote",
      sourceUpdatedAt: "2026-09-30T00:00:00.000Z",
    });
    expect(documentText('<script>alert("secret")</script><p>Hiring</p>')).toBe(
      "Hiring",
    );
  });
  it("uses a fixed provider endpoint, validates its response and keeps credentials in the header", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          organic: [
            {
              title: "Public request",
              link: "https://example.com/post",
              snippet: "Looking for help",
            },
          ],
        }),
      ),
    );
    const provider = new SerperSearchProvider(
      "synthetic-key",
      { language: "en", country: "us", requestCostMicros: 10000 },
      request,
    );
    const result = await provider.search(
      planDiscovery(brief, 1, 4).queries[0]!,
    );
    expect(result.observations).toHaveLength(1);
    expect(result.completeness).toBe("window");
    expect(request.mock.calls[0]![0]).toBe("https://google.serper.dev/search");
    expect(request.mock.calls[0]![1].body).not.toContain("synthetic-key");
    request.mockResolvedValue(
      new Response(JSON.stringify({ message: "Quota exceeded" })),
    );
    await expect(
      provider.search(planDiscovery(brief, 1, 4).queries[0]!),
    ).rejects.toThrow();
  });
});
