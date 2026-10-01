import { readSourceResponse } from "../connectors/source-http.js";
import {
  AvailabilitySource,
  type AvailabilityEvidence,
  type Posting,
} from "@repo/core/scouting";
import { normalizeGreenhousePosting } from "../connectors/greenhouse-source.js";

/** Checks the employer's public ATS endpoint without following arbitrary URLs or executing source instructions. */
export class GreenhouseAvailabilitySource extends AvailabilitySource {
  /** Only composition-owned board tokens may select a network destination. */
  constructor(private readonly boards: Readonly<Record<string, string>>) {
    super();
  }

  /** A 404 or elapsed explicit deadline means closed; other failures are unresolved. Content changes invalidate the assessed revision. */
  async check(posting: Posting): Promise<AvailabilityEvidence> {
    const approved =
      Object.hasOwn(this.boards, posting.source) &&
      /^[a-z0-9_-]{1,80}$/.test(posting.source) &&
      /^\d{1,20}$/.test(posting.externalId);
    const sourceUrl = approved
      ? `https://boards-api.greenhouse.io/v1/boards/${posting.source}/jobs/${posting.externalId}`
      : "https://boards-api.greenhouse.io/";
    const result = (
      status: AvailabilityEvidence["status"],
      fingerprint: string | null = null,
    ): AvailabilityEvidence => ({
      status,
      checkedAt: new Date().toISOString(),
      sourceUrl,
      fingerprint,
    });
    if (!approved) return result("unresolved");
    try {
      const response = await fetch(sourceUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
        headers: {
          accept: "application/json",
          "user-agent": "ScoutAlert/0.1 (posting availability check)",
        },
      });
      if (response.status === 404) return result("closed");
      const job = await readSourceResponse(response, 1_000_000);
      const current = normalizeGreenhousePosting(
        posting.source,
        this.boards[posting.source]!,
        job,
      );
      if (current.id !== posting.id) return result("unresolved");
      const deadline = job.application_deadline;
      if (
        deadline != null &&
        (typeof deadline !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(deadline) ||
          !Number.isFinite(Date.parse(deadline)))
      )
        return result("unresolved");
      if (typeof deadline === "string" && Date.parse(deadline) <= Date.now())
        return result("closed");
      return {
        ...result(
          current.fingerprint === posting.fingerprint ? "available" : "changed",
          current.fingerprint,
        ),
        ...(typeof deadline === "string" ? { validUntil: deadline } : {}),
      };
    } catch {
      return result("unresolved");
    }
  }
}
