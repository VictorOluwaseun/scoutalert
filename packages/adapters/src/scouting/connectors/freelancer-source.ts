import { createHash } from "node:crypto";
import { z } from "zod";
import {
  SourceConnector,
  AvailabilitySource,
  type Posting,
  type SourceSnapshot,
  type AvailabilityEvidence,
} from "@repo/core/scouting";
import { readSourceResponse } from "./source-http.js";

const source = "freelancer";
const origin = "https://www.freelancer.com";
const projectSchema = z.object({
  id: z.number().int().positive().safe(),
  title: z.string().min(1).max(1000),
  description: z.string().min(1).max(100_000),
  seo_url: z
    .string()
    .max(1500)
    .regex(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/),
  type: z.enum(["fixed", "hourly"]),
  status: z.string().max(40),
  frontend_project_status: z.string().max(40),
  deleted: z.boolean(),
  nonpublic: z.boolean(),
  local: z.boolean(),
  hireme: z.boolean(),
  time_updated: z.number().int().positive().max(253402300799).nullish(),
  time_submitted: z.number().int().positive().max(253402300799).nullish(),
  submitdate: z.number().int().positive().max(253402300799).nullish(),
  currency: z.object({ code: z.string().regex(/^[A-Z]{3}$/) }),
  budget: z.object({
    minimum: z.number().finite().nonnegative().nullable(),
    maximum: z.number().finite().nonnegative().nullable(),
  }),
  jobs: z.array(z.object({ name: z.string().min(1).max(200) })).max(100),
});
type Project = z.infer<typeof projectSchema>;
const selectionSchema = projectSchema.pick({
  id: true,
  type: true,
  status: true,
  frontend_project_status: true,
  deleted: true,
  nonpublic: true,
  local: true,
  hireme: true,
});
type ProjectSelection = z.infer<typeof selectionSchema>;

/** Public, open buyer requests only; local, direct-hire and private projects are outside this feed's coverage. */
function isOpen(project: ProjectSelection): boolean {
  return (
    project.status === "active" &&
    project.frontend_project_status === "open" &&
    !project.deleted &&
    !project.nonpublic &&
    !project.local &&
    !project.hireme
  );
}

/** Normalizes buyer demand with source-stated budget units; never mistakes buyer residence for applicant eligibility. */
export function normalizeFreelancerProject(value: unknown): Posting {
  const project = projectSchema.parse(value);
  if (!isOpen(project)) throw new Error("project_not_open");
  if (
    project.budget.minimum !== null &&
    project.budget.maximum !== null &&
    project.budget.minimum > project.budget.maximum
  )
    throw new Error("invalid_project_budget");
  const timestamp =
    project.time_updated ?? project.time_submitted ?? project.submitdate;
  if (!timestamp) throw new Error("missing_project_date");
  const period = project.type === "hourly" ? "per hour" : "per project";
  const budget = `Listed budget: ${project.budget.minimum ?? "unstated minimum"}–${project.budget.maximum ?? "unstated maximum"} ${project.currency.code} ${period}. This is the buyer's listed budget, not guaranteed earnings.`;
  const normalized = {
    kind: "client_request" as const,
    company: "Freelancer client (identity not verified)",
    title: project.title,
    location: "Applicant location eligibility not confirmed",
    url: `${origin}/projects/${project.seo_url}`,
    text: `Source category: buyer-posted client project / service request (${project.type}).\n${budget}\nRequested skills: ${project.jobs.map((job) => job.name).join(", ")}\n\n${project.description}`,
  };
  const externalId = String(project.id);
  return {
    ...normalized,
    id: `${source}:${externalId}`,
    source,
    externalId,
    familyId: `${source}:${externalId}`,
    sourceUpdatedAt: new Date(timestamp * 1000).toISOString(),
    version: 1,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex"),
  };
}

/** Reads only the fixed public API origin; redirects and oversized/error responses cannot become evidence. */
async function readProjectApi(
  url: URL,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    redirect: "error",
    signal,
    headers: {
      accept: "application/json",
      "user-agent": "ScoutAlert/0.1 (public opportunity discovery)",
    },
  });
  const body = await readSourceResponse(response, 8_000_000);
  if (
    body.status !== "success" ||
    !body.result ||
    typeof body.result !== "object" ||
    Array.isArray(body.result)
  )
    throw new Error("invalid_project_response");
  return body.result as Record<string, unknown>;
}

/** Shares bounded fixed-price and hourly buyer-request feeds across all client-project scouts. */
export class FreelancerSourceConnector extends SourceConnector {
  /** Fetches up to 200 entries per payment type, never claiming complete marketplace coverage. */
  async read(id: string, now: Date): Promise<SourceSnapshot> {
    if (id !== source) throw new Error("unsupported_source");
    const signal = AbortSignal.timeout(40_000);
    const projects = new Map<string, Posting>();
    for (const offset of [0, 100]) {
      const pages = await Promise.all(
        ["fixed", "hourly"].map((type) => this.page(type, offset, signal)),
      );
      for (const page of pages)
        for (const posting of page) {
          const previous = projects.get(posting.id);
          if (
            !previous ||
            Date.parse(posting.sourceUpdatedAt) >
              Date.parse(previous.sourceUpdatedAt)
          )
            projects.set(posting.id, posting);
        }
    }
    return {
      source,
      kind: "client_request",
      scope: "window",
      checkedAt: now.toISOString(),
      postings: [...projects.values()],
    };
  }

  /** Rejects malformed pages atomically; overlapping offsets are deduplicated because the public feed can change during collection. */
  private async page(
    type: string,
    offset: number,
    signal: AbortSignal,
  ): Promise<Posting[]> {
    const url = new URL("/api/projects/0.1/projects/active/", origin);
    url.search = new URLSearchParams({
      limit: "100",
      offset: String(offset),
      full_description: "true",
      job_details: "true",
      "project_types[]": type,
      sort_field: "time_updated",
    }).toString();
    const result = await readProjectApi(url, signal);
    if (
      !Array.isArray(result.projects) ||
      result.projects.length > 100 ||
      !Number.isSafeInteger(result.total_count) ||
      Number(result.total_count) < 0
    )
      throw new Error("invalid_project_page");
    const parsed = result.projects.map((item) => ({
      selection: selectionSchema.parse(item),
      raw: item,
    }));
    if (
      parsed.some((item) => item.selection.type !== type) ||
      new Set(parsed.map((item) => item.selection.id)).size !== parsed.length
    )
      throw new Error("invalid_project_page");
    return parsed
      .filter((item) => isOpen(item.selection))
      .map((item) => normalizeFreelancerProject(item.raw));
  }
}

/** Checks one public request by immutable numeric ID before a recommendation can support an alert. */
export class FreelancerAvailabilitySource extends AvailabilitySource {
  /** Re-reads current content; API failures, access restrictions and ambiguous status remain unresolved. */
  async check(posting: Posting): Promise<AvailabilityEvidence> {
    const approved =
      posting.source === source &&
      /^\d{1,20}$/.test(posting.externalId) &&
      posting.id === `${source}:${posting.externalId}`;
    const url = new URL(
      approved
        ? `/api/projects/0.1/projects/${posting.externalId}/?full_description=true&job_details=true`
        : "/",
      origin,
    );
    const result = (
      status: AvailabilityEvidence["status"],
      fingerprint: string | null = null,
    ): AvailabilityEvidence => ({
      status,
      fingerprint,
      checkedAt: new Date().toISOString(),
      sourceUrl: url.toString(),
    });
    if (!approved) return result("unresolved");
    try {
      const raw = await readProjectApi(url, AbortSignal.timeout(12_000));
      const project = selectionSchema.parse(raw);
      if (String(project.id) !== posting.externalId)
        return result("unresolved");
      if (
        project.deleted ||
        ["closed", "complete", "cancelled"].includes(project.status) ||
        ["closed", "complete", "awarded"].includes(
          project.frontend_project_status,
        )
      )
        return result("closed");
      if (!isOpen(project)) return result("unresolved");
      const current = normalizeFreelancerProject(raw);
      return result(
        current.fingerprint === posting.fingerprint ? "available" : "changed",
        current.fingerprint,
      );
    } catch {
      return result("unresolved");
    }
  }
}
