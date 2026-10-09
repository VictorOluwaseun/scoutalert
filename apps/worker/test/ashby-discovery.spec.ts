import { describe, expect, it, vi } from "vitest";
import {
  AshbySourceDocumentRepository,
  SourceDocumentRouter,
  PublicHttpRepository,
  ashbyTarget,
  parseAshbyPostings,
} from "@repo/adapters/discovery";
import type { SourceDocumentRepository } from "@repo/core/discovery";

const board = "https://jobs.ashbyhq.com/example";
const url = `${board}/12345678-1234-1234-1234-123456789012`;
const job = {
  title: "Product designer",
  jobUrl: url,
  applyUrl: `${url}/application`,
  isListed: true,
  location: "Remote — EU",
  workplaceType: "Remote",
  descriptionPlain:
    "We need a product designer. Applicants must reside in the EU.",
  publishedAt: "2026-10-01T12:00:00Z",
  employmentType: "Contract",
};

/** Uses authored provider JSON without paid services, source access or account data. */
function fixture(jobs: unknown[] = [job]) {
  const read = vi
    .fn()
    .mockResolvedValue({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ apiVersion: "1", jobs }),
    });
  return {
    read,
    repository: new AshbySourceDocumentRepository({
      read,
    } as unknown as PublicHttpRepository),
  };
}

describe("public Ashby source capability", () => {
  it("captures a live-board shape with exact API provenance and preserves location restrictions", async () => {
    const { read, repository } = fixture();
    const directory = await repository.read(board);
    expect(directory).toMatchObject({
      status: "fetched",
      truncated: false,
      posting: null,
      capture: { method: "public_api", requests: 1 },
    });
    expect(directory.links).toEqual([{ url, text: job.title }]);
    const detail = await repository.read(url);
    expect(detail.text).toContain("Applicants must reside in the EU");
    expect(detail.text).toContain("Last published: 2026-10-01T12:00:00Z");
    expect(detail.text).not.toContain("worldwide");
    expect(detail.publicApi?.url).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/example?includeCompensation=true",
    );
    expect(read.mock.calls[0]![0]).toBe(detail.publicApi?.url);
    expect(detail.links).toEqual([
      { url: `${url}/application`, text: "Apply now" },
    ]);
  });
  it("excludes unlisted jobs even from direct detail lookup and never treats absence as confirmed closure", async () => {
    const { repository } = fixture([{ ...job, isListed: false }]);
    expect((await repository.read(board)).links).toEqual([]);
    expect(await repository.read(url)).toMatchObject({
      status: "unavailable",
      reason: "ashby_posting_not_listed",
      posting: null,
    });
  });
  it("rejects malformed, conflicting and cross-board facts without discarding a valid independent job", () => {
    const parsed = parseAshbyPostings(
      JSON.stringify({
        apiVersion: "1",
        jobs: [
          job,
          { ...job, title: "Conflicting title" },
          { ...job, jobUrl: url.replace("12345678", "87654321") },
          { ...job, jobUrl: url.replace("/example/", "/another/") },
          {},
        ],
      }),
      ashbyTarget(board)!,
    );
    expect(parsed.incomplete).toBe(true);
    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.jobs[0]!.jobUrl).toContain("87654321");
  });
  it("withholds oversized detail text and reports API failure instead of falling through to authenticated requests", async () => {
    const { read, repository } = fixture([
      { ...job, descriptionPlain: "x".repeat(65_000) },
    ]);
    expect(await repository.read(url)).toMatchObject({
      truncated: true,
      posting: null,
      capture: { complete: false },
    });
    read.mockResolvedValue({
      status: 429,
      contentType: "application/json",
      body: "{}",
    });
    expect(await repository.read(board)).toMatchObject({
      status: "unavailable",
      reason: "ashby_api_unavailable",
    });
  });
  it.each([
    "https://jobs.ashbyhq.com.attacker.example/example",
    `${url}/application`,
    "https://api.ashbyhq.com/jobPosting.list",
    "https://jobs.ashbyhq.com/example/not-a-job-id",
    "https://person:password@jobs.ashbyhq.com/example",
  ])("does not grant the API capability to %s", (value) => {
    expect(ashbyTarget(value)).toBeNull();
  });
  it("routes only recognized public portal identities, leaving normal crawl policy intact elsewhere", async () => {
    const pages = { read: vi.fn() } as unknown as SourceDocumentRepository;
    const ashby = { read: vi.fn() } as unknown as SourceDocumentRepository;
    const router = new SourceDocumentRouter(pages, ashby);
    await router.read(board);
    await router.read(`${url}/application`);
    expect(ashby.read).toHaveBeenCalledWith(board);
    expect(pages.read).toHaveBeenCalledWith(`${url}/application`);
  });
});
