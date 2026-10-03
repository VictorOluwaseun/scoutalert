import { sql, type Kysely } from "kysely";
import {
  AvailabilitySource,
  validResearch,
  type EmployerResearch,
  type AvailabilityEvidence,
  type Posting,
} from "@repo/core/scouting";
import { mayPublishLead, type LeadReview } from "@repo/core/discovery";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import {
  reviewInput,
  type ReviewableLead,
} from "../intelligence/review-input.js";

/** Reuses recent crawl-policy-admitted source captures; never refreshes a timestamp without another source observation. */
export class PostgresWebAvailabilitySource extends AvailabilitySource {
  /** Uses public evidence only; the discovery coordinator owns network budgets and host pacing. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Requires a current complete demand review, a stated application path and a source observation younger than fifteen minutes. */
  async check(posting: Posting): Promise<AvailabilityEvidence> {
    const unresolved: AvailabilityEvidence = {
      status: "unresolved",
      checkedAt: new Date().toISOString(),
      sourceUrl: posting.url,
      fingerprint: null,
    };
    const result = await sql<
      ReviewableLead & { review: LeadReview; fingerprint: string }
    >`SELECT l.*,r.result AS review,p.fingerprint FROM web_discovery_leads l JOIN web_lead_reviews r ON r.key=l.review_key AND r.state='ready' JOIN opportunity_postings p ON p.id=r.posting_id AND p.version=r.posting_version AND p.open WHERE p.id=${posting.id} AND p.version=${posting.version} AND p.fingerprint=${posting.fingerprint} AND l.url=${posting.url} AND l.content_status='fetched'`.execute(
      this.db,
    );
    const row = result.rows[0];
    if (!row) {
      return unresolved;
    }
    const input = reviewInput(row);
    const observedAt = Date.parse(input.observedAt);
    const age = Date.now() - observedAt;
    const linked = await this.linkedDeadline(posting);
    if (linked === "conflicting") {
      return unresolved;
    }
    const expired =
      (linked !== null && linked <= Date.now()) ||
      (row.review.deadline.status === "stated" &&
        Date.parse(row.review.deadline.value) <= Date.now());
    if (expired) {
      return {
        ...unresolved,
        status: "closed",
        validUntil: new Date(
          linked !== null && linked <= Date.now()
            ? linked
            : Date.parse(row.review.deadline.value),
        ).toISOString(),
      };
    }
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      age >= 15 * 60_000 ||
      !mayPublishLead(input, row.review, new Date()) ||
      row.review.application.status !== "stated"
    ) {
      return unresolved;
    }
    const deadline =
      row.review.deadline.status === "stated"
        ? Date.parse(row.review.deadline.value)
        : Infinity;
    return {
      status: "available",
      checkedAt: input.observedAt,
      sourceUrl: posting.url,
      fingerprint: row.fingerprint,
      validUntil: new Date(
        Math.min(deadline, linked ?? Infinity, observedAt + 15 * 60_000),
      ).toISOString(),
    };
  }
  /** A cited deadline on an observed application page can close the opportunity or shorten freshness; ambiguity never extends it. */
  private async linkedDeadline(
    posting: Posting,
  ): Promise<number | "conflicting" | null> {
    const result = await sql<{
      research: EmployerResearch;
    }>`SELECT result->'analysis'->'research' AS research FROM intelligence_tasks WHERE kind='research' AND status='ready' AND posting_id=${posting.id} AND posting_version=${posting.version} ORDER BY updated_at DESC LIMIT 1`.execute(
      this.db,
    );
    const research = result.rows[0]?.research;
    if (!research || !validResearch(research, new Date(research.checkedAt))) {
      return null;
    }
    const finding = research.findings.find((item) => item.fact === "deadline");
    if (
      finding?.status === "resolved" &&
      Date.parse(finding.value) <= Date.now()
    ) {
      return Date.parse(finding.value);
    }
    if (!validResearch(research)) {
      return null;
    }
    if (finding?.status === "conflicting") {
      return "conflicting";
    }
    return finding?.status === "resolved" ? Date.parse(finding.value) : null;
  }
}
