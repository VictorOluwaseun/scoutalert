import { z } from "zod";
import {
  canonicalDiscoveryUrl,
  discoveryKey,
} from "../persistence/discovery-identities.js";
import type { SourceDocumentResult } from "@repo/core/discovery";

const jobSchema = z.object({
  title: z.string().trim().min(1).max(500),
  jobUrl: z.string().max(2048),
  applyUrl: z.string().max(2048).optional(),
  isListed: z.boolean(),
  descriptionPlain: z.string().max(500_000),
  location: z.string().max(1000).optional(),
  secondaryLocations: z
    .array(z.object({ location: z.string().max(1000).optional() }))
    .max(100)
    .optional(),
  department: z.string().max(500).optional(),
  team: z.string().max(500).optional(),
  employmentType: z.string().max(100).optional(),
  isRemote: z.boolean().optional(),
  workplaceType: z.string().max(100).optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
  compensation: z
    .object({
      compensationTierSummary: z.string().max(10_000).optional(),
      scrapeableCompensationSalarySummary: z.string().max(10_000).optional(),
    })
    .optional(),
});
export type AshbyPosting = z.infer<typeof jobSchema>;
export type AshbyTarget = {
  board: string;
  job: string | null;
  boardUrl: string;
};

/** Recognizes only Ashby's hosted board and explicit job-detail URLs; application forms and custom domains stay on separate paths. */
export function ashbyTarget(value: string): AshbyTarget | null {
  const canonical = canonicalDiscoveryUrl(value);
  if (!canonical) {
    return null;
  }
  const url = new URL(canonical);
  const match = /^\/([a-z0-9_-]{1,100})(?:\/([a-f0-9-]{36}))?\/?$/iu.exec(
    url.pathname,
  );
  if (url.hostname !== "jobs.ashbyhq.com" || !match) {
    return null;
  }
  return {
    board: match[1]!,
    job: match[2] ?? null,
    boardUrl: `${url.origin}/${match[1]}`,
  };
}

/** Validates the documented feed and removes unlisted/cross-board records before shared caching or public discovery. */
export function parseAshbyPostings(
  body: string,
  target: AshbyTarget,
): { jobs: AshbyPosting[]; incomplete: boolean } {
  const data = z
    .object({
      apiVersion: z.literal("1"),
      jobs: z.array(z.unknown()).max(5000),
      _captureIncomplete: z.boolean().optional(),
    })
    .parse(JSON.parse(body));
  const jobs = new Map<string, AshbyPosting>();
  const conflicted = new Set<string>();
  let incomplete = data._captureIncomplete ?? false;
  for (const value of data.jobs) {
    if (
      value &&
      typeof value === "object" &&
      "isListed" in value &&
      value.isListed === false
    ) {
      continue;
    }
    const parsed = jobSchema.safeParse(value);
    if (!parsed.success) {
      incomplete = true;
      continue;
    }
    const job = parsed.data;
    const destination = ashbyTarget(job.jobUrl);
    if (
      !job.isListed ||
      !destination?.job ||
      destination.board !== target.board
    ) {
      incomplete = true;
      continue;
    }
    job.jobUrl = `${destination.boardUrl}/${destination.job}`;
    const apply = job.applyUrl ? canonicalDiscoveryUrl(job.applyUrl) : null;
    job.applyUrl = apply === `${job.jobUrl}/application` ? apply : undefined;
    const prior = jobs.get(job.jobUrl);
    if (
      conflicted.has(job.jobUrl) ||
      (prior && JSON.stringify(prior) !== JSON.stringify(job))
    ) {
      incomplete = true;
      conflicted.add(job.jobUrl);
      jobs.delete(job.jobUrl);
      continue;
    }
    jobs.set(job.jobUrl, job);
  }
  return { jobs: [...jobs.values()], incomplete };
}

/** Converts one public API observation into bounded directory/detail evidence without inventing company, eligibility or compensation. */
export function ashbyDocument(
  url: string,
  target: AshbyTarget,
  jobs: AshbyPosting[],
  incomplete: boolean,
): Pick<
  SourceDocumentResult,
  "text" | "links" | "truncated" | "reason" | "fingerprint"
> {
  const selected = target.job
    ? jobs.find((job) => job.jobUrl === `${target.boardUrl}/${target.job}`)
    : null;
  if (target.job && !selected) {
    throw new Error("ashby_posting_not_listed");
  }
  const lines = selected
    ? postingLines(selected)
    : [
        "Published job directory",
        ...jobs.map(
          (job) => `${job.title} — ${job.location ?? "Location not stated"}`,
        ),
      ];
  const text = lines.join("\n");
  const truncated =
    text.length > 64_000 || (!selected && (incomplete || jobs.length > 500));
  const links = selected
    ? selected.applyUrl
      ? [{ url: selected.applyUrl, text: "Apply now" }]
      : []
    : jobs.slice(0, 500).map((job) => ({ url: job.jobUrl, text: job.title }));
  return {
    text: text.slice(0, 64_000),
    links,
    truncated,
    reason: truncated ? "ashby_capture_incomplete" : null,
    fingerprint: discoveryKey(["ashby-public-v1", url, text, links, truncated]),
  };
}

/** Labels only fields explicitly provided by the API; remote arrangement is not interpreted as worldwide eligibility. */
function postingLines(job: AshbyPosting): string[] {
  return [
    job.title,
    job.descriptionPlain,
    job.location && `Location: ${job.location}`,
    ...(job.secondaryLocations ?? []).flatMap((location) =>
      location.location ? [`Additional location: ${location.location}`] : [],
    ),
    job.workplaceType && `Workplace type: ${job.workplaceType}`,
    job.employmentType && `Employment type: ${job.employmentType}`,
    job.department && `Department: ${job.department}`,
    job.team && `Team: ${job.team}`,
    job.publishedAt && `Last published: ${job.publishedAt}`,
    job.compensation?.compensationTierSummary,
    job.compensation?.scrapeableCompensationSalarySummary,
    job.applyUrl && `Application URL: ${job.applyUrl}`,
  ].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}
