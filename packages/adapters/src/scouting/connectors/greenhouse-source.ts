import { readSourceResponse } from "./source-http.js";
import { createHash } from "node:crypto";
import { compile } from "html-to-text";
import he from "he";
import {
  SourceConnector,
  type Posting,
  type SourceSnapshot,
} from "@repo/core/scouting";

const plainText = compile({
  wordwrap: false,
  selectors: [
    { selector: "a", options: { ignoreHref: true } },
    { selector: "img", format: "skip" },
  ],
  limits: { maxInputLength: 250_000, maxDepth: 50 },
});

/** Validates untrusted objects before any complete snapshot can be published. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_source_snapshot");
  return value as Record<string, unknown>;
}

/** Rejects missing or oversized source fields; truncation must not masquerade as complete evidence. */
function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length > maximum)
    throw new Error("invalid_source_snapshot");
  return value;
}

/** Reads only explicitly configured public Greenhouse boards; no user URL can trigger a fetch. */
export class GreenhouseSourceConnector extends SourceConnector {
  /** Receives a server-owned board/company allowlist at composition. */
  constructor(private readonly boards: Readonly<Record<string, string>>) {
    super();
  }

  /** Bounds response bytes, wait time, posting count and fields; prospect-only posts are excluded. */
  async read(source: string, now: Date): Promise<SourceSnapshot> {
    const company = this.boards[source];
    if (
      !Object.hasOwn(this.boards, source) ||
      !company ||
      !/^[a-z0-9_-]{1,80}$/.test(source)
    )
      throw new Error("unsupported_source");
    const response = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${source}/jobs?content=true`,
      {
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          accept: "application/json",
          "user-agent": "ScoutAlert/0.1 (public job-board sync)",
        },
      },
    );
    const body = await readSourceResponse(response, 8_000_000);
    const meta = record(body.meta);
    if (
      !Array.isArray(body.jobs) ||
      body.jobs.length > 5_000 ||
      meta.total !== body.jobs.length
    )
      throw new Error("incomplete_source_snapshot");
    const postings = body.jobs.flatMap((raw: unknown) => {
      const job = record(raw);
      if (job.internal_job_id === null) return [];
      return [normalizeGreenhousePosting(source, company, job)];
    });
    if (
      new Set(postings.map((posting) => posting.externalId)).size !==
      postings.length
    )
      throw new Error("duplicate_source_id");
    return { source, checkedAt: now.toISOString(), postings };
  }
}

/** Normalizes one meaningful posting variant; location variants retain separate source identities. */
export function normalizeGreenhousePosting(
  source: string,
  company: string,
  job: Record<string, unknown>,
): Posting {
  if (
    !Number.isSafeInteger(job.id) ||
    !Number.isSafeInteger(job.internal_job_id)
  )
    throw new Error("invalid_source_id");
  const sourceUpdatedAt = text(job.updated_at, 80);
  if (!Number.isFinite(Date.parse(sourceUpdatedAt)))
    throw new Error("invalid_source_date");
  const url = text(job.absolute_url, 2_000);
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    throw new Error("invalid_source_url");
  const title = he.decode(text(job.title, 1_000));
  const location = he.decode(text(record(job.location).name, 2_000));
  const content = text(job.content, 250_000);
  const normalized = plainText(he.decode(content)).trim();
  const externalId = String(job.id);
  const familyId = `${source}:${String(job.internal_job_id)}`;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        company,
        title,
        location,
        url,
        text: normalized,
        familyId,
      }),
    )
    .digest("hex");
  return {
    id: `${source}:${externalId}`,
    source,
    externalId,
    familyId,
    company,
    title,
    location,
    url,
    text: normalized,
    sourceUpdatedAt,
    fingerprint,
    version: 1,
  };
}
