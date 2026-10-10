import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  LeadReviewRepository,
  collectionDirectoryReview,
  mayPublishLead,
  validLeadReview,
  type LeadReviewClaim,
  type LeadReviewInput,
  type LeadReviewResult,
  type LeadReview,
} from "@repo/core/discovery";
import {
  factNames,
  type Posting,
  type ScoutRunRequest,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import {
  estimateIntelligenceCost,
  intelligenceAttemptReserveMicrousd,
} from "../../scouting/intelligence/usage-cost.js";
import {
  reviewInput,
  type ReviewableLead,
} from "../intelligence/review-input.js";
import { discoveryKey } from "./discovery-identities.js";
import { PostgresWebPostingRepository } from "./postgres-web-postings.js";

import { lockWebSources } from "./web-source-locks.js";

type ReviewRow = {
  key: string;
  input: LeadReviewInput;
  state: string;
  lease_until: Date | null;
  result: LeadReview | null;
  attempts: number;
  retry_at: Date | null;
};

/** Shares immutable public reviews across scouts and admits them against the same global AI ledger as personal fit. */
export class PostgresLeadReviewRepository extends LeadReviewRepository {
  /** Uses explicit local ceilings; input and publication queries stay in this adapter. */
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly dailyRequests: number,
    private readonly dailyMicrousd: number,
  ) {
    super();
  }

  /** Refreshes each bounded review round; parser-confirmed collections receive a structural directory review before any AI reservation. */
  private async freeze(
    tx: Kysely<ScoutAlertDatabase>,
    request: ScoutRunRequest,
    configuration: string,
  ): Promise<void> {
    const state = await sql<{
      round: number;
      searching: boolean;
      guided: boolean;
    }>`SELECT (SELECT count(*)::int FROM web_discovery_decisions WHERE case_id=c.id) AS round,c.status='searching' AS searching,c.plan->>'policy'='public-intent-v3' AS guided FROM web_discovery_cases c WHERE c.id=${request.runId}::uuid`.execute(
      tx,
    );
    const current = state.rows[0]!;
    const sourceOnly = current.searching || current.guided;
    const known = await sql<{
      round: number;
      source_only: boolean;
    }>`SELECT round,source_only FROM web_lead_review_cases WHERE case_id=${request.runId}::uuid`.execute(
      tx,
    );
    if (
      known.rows[0] &&
      known.rows[0].round === current.round &&
      known.rows[0].source_only === sourceOnly
    ) {
      return;
    }
    const leads =
      await sql<ReviewableLead>`SELECT l.* FROM web_discovery_case_leads cl JOIN web_discovery_leads l ON l.id=cl.lead_id WHERE cl.case_id=${request.runId}::uuid AND (NOT ${sourceOnly} OR l.content_status='fetched') ORDER BY (l.content_status='fetched') DESC,l.id LIMIT 40`.execute(
        tx,
      );
    const records = leads.rows.map((lead) => {
      const input = reviewInput(lead);
      return {
        key: discoveryKey([configuration, input.id, input.fingerprint]),
        input,
      };
    });
    for (const record of [...records].sort((a, b) =>
      a.key.localeCompare(b.key),
    )) {
      await sql`INSERT INTO web_lead_reviews(key,lead_id,configuration,input) VALUES(${record.key},${record.input.id},${configuration},${JSON.stringify(record.input)}::jsonb)
        ON CONFLICT(key) DO UPDATE SET input=excluded.input,state='pending',failure=NULL,attempts=0,retry_at=NULL,posting_id=NULL,posting_version=NULL
        WHERE web_lead_reviews.failure='source_unavailable'`.execute(tx);
      const directory = collectionDirectoryReview(record.input);
      if (directory) {
        await this.accept(tx, record.key, record.input, directory);
      }
    }
    await sql`INSERT INTO web_lead_review_cases(case_id,configuration,keys,round,source_only,deadline) VALUES(${request.runId}::uuid,${configuration},${records.map((record) => record.key)}::text[],${current.round},${sourceOnly},CASE WHEN ${current.searching} THEN (SELECT deadline FROM web_discovery_cases WHERE id=${request.runId}::uuid) ELSE now()+interval '180 seconds' END) ON CONFLICT(case_id) DO UPDATE SET configuration=excluded.configuration,keys=excluded.keys,round=excluded.round,source_only=excluded.source_only,deadline=CASE WHEN web_lead_review_cases.source_only AND NOT excluded.source_only THEN excluded.deadline ELSE web_lead_review_cases.deadline END,status='pending',reason=NULL`.execute(
      tx,
    );
  }

  /** Locks source aggregates before private state and public tasks; network calls run outside these short transactions. */
  async claim(
    request: ScoutRunRequest,
    configuration: string,
  ): Promise<LeadReviewClaim> {
    return this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      const current =
        await sql`SELECT s.id FROM scouts s JOIN web_discovery_cases c ON c.scout_id=s.id AND c.owner_id=s.owner_id AND c.scout_version=s.version WHERE c.id=${request.runId}::uuid AND s.id=${request.scoutId}::uuid AND s.owner_id=${request.ownerId}::uuid AND s.version=${request.version} AND s.status='active' AND (c.status IN ('completed','partial','deferred') OR (c.status='searching' AND c.plan->>'policy'='public-intent-v3' AND c.deadline>now())) AND NOT EXISTS(SELECT 1 FROM web_discovery_cases newer WHERE newer.scout_id=c.scout_id AND newer.owner_id=c.owner_id AND newer.started_at>c.started_at) FOR UPDATE OF s`.execute(
          tx,
        );
      if (!current.rows.length) {
        return { status: "done" };
      }
      await this.freeze(tx, request, configuration);
      const batch = await sql<{
        keys: string[];
        source_only: boolean;
      }>`SELECT keys,source_only FROM web_lead_review_cases WHERE case_id=${request.runId}::uuid AND configuration=${configuration} AND deadline>now()`.execute(
        tx,
      );
      if (!batch.rows[0]) {
        await this.progress(
          tx,
          request.runId,
          "deferred",
          "review_window_ended",
        );
        return { status: "done" };
      }
      const tasks =
        await sql<ReviewRow>`SELECT key,input,state,lease_until,result,attempts,retry_at FROM web_lead_reviews WHERE key=ANY(${batch.rows[0].keys}::text[]) ORDER BY key FOR UPDATE`.execute(
          tx,
        );
      await this.refreshReady(tx, tasks.rows);
      const now = Date.now();
      const expired = tasks.rows.filter(
        (row) =>
          row.state === "running" &&
          (!row.lease_until || row.lease_until.getTime() <= now),
      );
      await sql`UPDATE web_lead_reviews SET state='failed',failure='attempt_outcome_unknown',retry_at=now()+interval '5 minutes' WHERE key=ANY(${expired.map((row) => row.key)}::text[])`.execute(
        tx,
      );
      const pending = tasks.rows
        .filter(
          (row) =>
            row.state === "pending" ||
            (row.state === "failed" &&
              row.attempts < 2 &&
              !!row.retry_at &&
              row.retry_at.getTime() <= now),
        )
        .sort(
          (a, b) =>
            Number(b.input.scope === "source") -
            Number(a.input.scope === "source"),
        );
      if (!pending.length) {
        const active = tasks.rows.some(
          (row) =>
            row.state === "running" &&
            row.lease_until &&
            row.lease_until.getTime() > now,
        );
        await this.progress(
          tx,
          request.runId,
          active ? "reviewing" : "complete",
          tasks.rows.some((row) => row.state === "failed") || expired.length > 0
            ? "some_reviews_unavailable"
            : batch.rows[0].source_only
              ? "source_reviews_complete"
              : null,
        );
        return { status: active ? "waiting" : "done" };
      }
      const first = pending[0]!;
      const selected =
        first.input.scope === "source"
          ? [first]
          : pending
              .filter((row) => row.input.scope === "search_excerpt")
              .slice(0, 4);
      const admission = await this.reserve(tx);
      if (admission !== "admitted") {
        await this.progress(
          tx,
          request.runId,
          admission === "done" ? "deferred" : "reviewing",
          admission === "done" ? "ai_budget_reached" : null,
        );
        return { status: admission };
      }
      await this.progress(tx, request.runId, "reviewing", null);
      const token = randomUUID();
      await sql`INSERT INTO web_lead_review_attempts(id,state,lease_until) VALUES(${token}::uuid,'running',now()+interval '55 seconds')`.execute(
        tx,
      );
      await sql`UPDATE web_lead_reviews SET state='running',attempts=attempts+1,retry_at=NULL,lease_token=${token}::uuid,lease_until=now()+interval '55 seconds' WHERE key=ANY(${selected.map((row) => row.key)}::text[])`.execute(
        tx,
      );
      return {
        status: "claimed",
        token,
        inputs: selected.map((row) => row.input),
      };
    });
  }

  /** Records a user-facing reason without leaking raw model errors or private usage details. */
  private async progress(
    tx: Kysely<ScoutAlertDatabase>,
    caseId: string,
    status: "reviewing" | "complete" | "deferred",
    reason: string | null,
  ): Promise<void> {
    await sql`UPDATE web_lead_review_cases SET status=${status},reason=${reason} WHERE case_id=${caseId}::uuid`.execute(
      tx,
    );
  }

  /** Renews unchanged captured evidence without another model call; stale, truncated or closed demand is withheld. */
  private async refreshReady(
    tx: Kysely<ScoutAlertDatabase>,
    tasks: ReviewRow[],
  ): Promise<void> {
    const ready = tasks.filter((task) => task.state === "ready" && task.result);
    const leads =
      await sql<ReviewableLead>`SELECT * FROM web_discovery_leads WHERE id=ANY(${ready.map((task) => task.input.id)}::text[]) ORDER BY id FOR UPDATE`.execute(
        tx,
      );
    const inputs = new Map(
      leads.rows.map((lead) => [lead.id, reviewInput(lead)]),
    );
    for (const task of ready.sort((a, b) =>
      a.result!.label.localeCompare(b.result!.label),
    )) {
      const input = inputs.get(task.input.id);
      if (!input || input.fingerprint !== task.input.fingerprint) {
        continue;
      }
      await this.accept(tx, task.key, input, task.result!);
    }
  }

  /** Publishes current evidence and clears obsolete retry failures atomically; failed attempts remain in their audit ledger. Negative reviews withdraw web candidates. */
  private async accept(
    tx: Kysely<ScoutAlertDatabase>,
    key: string,
    input: LeadReviewInput,
    review: LeadReview,
  ): Promise<void> {
    const posting = mayPublishLead(input, review, new Date())
      ? await new PostgresWebPostingRepository(tx).publish(
          this.posting(input, review),
          input.observedAt,
        )
      : null;
    if (!posting) {
      await sql`UPDATE opportunity_postings SET open=false WHERE id=(SELECT posting_id FROM web_discovery_leads WHERE id=${input.id}) AND source_id IN ('web-discovery','web-client-requests')`.execute(
        tx,
      );
    }
    await sql`UPDATE web_lead_reviews SET state='ready',failure=NULL,retry_at=NULL,result=${JSON.stringify(review)}::jsonb,reviewed_at=coalesce(reviewed_at,now()),lease_until=NULL,posting_id=${posting?.id ?? null},posting_version=${posting?.version ?? null} WHERE key=${key}`.execute(
      tx,
    );
    await sql`UPDATE web_discovery_leads SET review_key=${key},posting_id=${posting?.id ?? null} WHERE id=${input.id}`.execute(
      tx,
    );
  }

  /** Serializes both request and conservative monetary admission with existing extraction/research/fit work. */
  private async reserve(
    tx: Kysely<ScoutAlertDatabase>,
  ): Promise<"admitted" | "waiting" | "done"> {
    await sql`INSERT INTO intelligence_daily_budget(day,requests) VALUES((now() AT TIME ZONE 'UTC')::date,0) ON CONFLICT DO NOTHING`.execute(
      tx,
    );
    await sql`SELECT day FROM intelligence_daily_budget WHERE day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE`.execute(
      tx,
    );
    const active = await sql<{
      count: number;
    }>`SELECT ((SELECT count(*) FROM intelligence_tasks WHERE status='running' AND lease_until>now())+(SELECT count(*) FROM web_lead_review_attempts WHERE state='running' AND lease_until>now())+(SELECT count(*) FROM web_reasoning_tasks WHERE state='running' AND lease_until>now()))::int AS count`.execute(
      tx,
    );
    if (active.rows[0]!.count >= 2) {
      return "waiting";
    }
    const saved =
      await sql`UPDATE intelligence_daily_budget SET requests=requests+1,reserved_microusd=reserved_microusd+${intelligenceAttemptReserveMicrousd} WHERE day=(now() AT TIME ZONE 'UTC')::date AND requests<${this.dailyRequests} AND reserved_microusd+${intelligenceAttemptReserveMicrousd}<=${this.dailyMicrousd} RETURNING day`.execute(
        tx,
      );
    return saved.rows.length ? "admitted" : "done";
  }

  /** Commits only the exact still-current public content; late model replies retain telemetry but cannot publish stale evidence. */
  async complete(token: string, result: LeadReviewResult): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      const tasks =
        await sql<ReviewRow>`SELECT key,input,state,lease_until FROM web_lead_reviews WHERE lease_token=${token}::uuid AND state='running' AND lease_until>now() ORDER BY key FOR UPDATE`.execute(
          tx,
        );
      const outputs = new Map(
        result.reviews.map((item) => [item.id, item.review]),
      );
      if (
        tasks.rows.length !== result.reviews.length ||
        outputs.size !== tasks.rows.length ||
        tasks.rows.some(
          (row) =>
            !outputs.has(row.input.id) ||
            !validLeadReview(row.input, outputs.get(row.input.id)!),
        )
      ) {
        await this.finishAttempt(tx, token, "superseded", result);
        return;
      }
      // Source aggregates are already locked; public lead locks follow a stable order.
      const leads =
        await sql<ReviewableLead>`SELECT * FROM web_discovery_leads WHERE id=ANY(${tasks.rows.map((row) => row.input.id)}::text[]) ORDER BY id FOR UPDATE`.execute(
          tx,
        );
      const current = new Map(
        leads.rows.map((row) => [row.id, reviewInput(row)]),
      );
      for (const task of tasks.rows) {
        const input = current.get(task.input.id);
        if (!input || input.fingerprint !== task.input.fingerprint) {
          await sql`UPDATE web_lead_reviews SET state='failed',failure='source_changed',lease_until=NULL WHERE key=${task.key}`.execute(
            tx,
          );
          continue;
        }
        const review = outputs.get(input.id)!;
        await this.accept(tx, task.key, input, review);
      }
      await this.finishAttempt(tx, token, "ready", result);
    });
  }

  /** Creates a public candidate from complete source demand; observation time is not invented as a publication date. */
  private posting(input: LeadReviewInput, review: LeadReview): Posting {
    const kind = review.label === "client_request" ? "client_request" : "job";
    const company =
      review.company.status === "stated" &&
      !!review.company.value.trim() &&
      review.company.quotes.some((quote) =>
        quote.toLowerCase().includes(review.company.value.toLowerCase()),
      )
        ? review.company.value
        : null;
    return {
      id: `web:${input.id}`,
      source: kind === "job" ? "web-discovery" : "web-client-requests",
      externalId: input.url,
      familyId: `web:${input.id}`,
      kind,
      title: review.analysis.facts.role.value,
      company,
      location:
        review.analysis.facts.location.status === "stated"
          ? review.analysis.facts.location.value
          : null,
      sourceUpdatedAt: null,
      url: input.url,
      text: input.text,
      version: 1,
      fingerprint: discoveryKey([
        input.fingerprint,
        review.label,
        review.explanation,
        review.quotes,
        [
          review.company,
          review.deadline,
          review.application,
          ...factNames.map((name) => review.analysis.facts[name]),
        ].map((fact) => [fact.status, fact.value, fact.quotes]),
        [
          review.analysis.pay.minimum,
          review.analysis.pay.maximum,
          review.analysis.pay.currency,
          review.analysis.pay.period,
        ],
      ]),
    };
  }

  /** Records one batch's usage once, even when its public inputs were superseded during the provider call. */
  private async finishAttempt(
    tx: Kysely<ScoutAlertDatabase>,
    token: string,
    state: "ready" | "superseded",
    result: LeadReviewResult,
  ): Promise<void> {
    await sql`UPDATE web_lead_review_attempts SET state=${state},finished_at=now(),usage=${JSON.stringify(result.usage)}::jsonb,cost=${JSON.stringify(estimateIntelligenceCost(result.usage))}::jsonb WHERE id=${token}::uuid AND state='running'`.execute(
      tx,
    );
  }

  /** A later run may retry transient failures once after five minutes; invalid evidence is terminal for this input. */
  async fail(
    token: string,
    reason: "provider_unavailable" | "invalid_evidence",
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await sql`UPDATE web_lead_reviews SET state='failed',failure=${reason},lease_until=NULL,retry_at=CASE WHEN ${reason}='provider_unavailable' THEN now()+interval '5 minutes' ELSE NULL END WHERE lease_token=${token}::uuid AND state='running'`.execute(
        tx,
      );
      await sql`UPDATE web_lead_review_attempts SET state='failed',finished_at=now(),failure=${reason} WHERE id=${token}::uuid AND state='running'`.execute(
        tx,
      );
    });
  }
}
