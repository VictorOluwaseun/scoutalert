import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { DiscoveryPlan, SocialLimits } from "@repo/core/discovery";
import type { SearchDraft } from "@repo/core/onboarding";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { intelligenceAttemptReserveMicrousd } from "../../scouting/intelligence/usage-cost.js";

/** Feeds recent native public observations into the existing cited-review, private-fit and delivery workflow. */
export class PostgresSocialDispatchRepository {
  /** Joins receipt/retention transactions under the shared source lock. */
  constructor(private readonly tx: Kysely<ScoutAlertDatabase>) {}

  /** Recovers interrupted or retryable reviews within the shared AI budget; source timestamps, attempt ceilings and original cases remain intact. */
  async resumeReviews(
    limits: Pick<SocialLimits, "dailyRequests" | "dailyMicros"> | null,
  ): Promise<void> {
    if (!limits) {
      return;
    }

    const budget = await sql<{ available: boolean }>`SELECT
      coalesce((SELECT requests FROM intelligence_daily_budget WHERE day=(now() AT TIME ZONE 'UTC')::date),0)<${limits.dailyRequests}
      AND coalesce((SELECT reserved_microusd FROM intelligence_daily_budget WHERE day=(now() AT TIME ZONE 'UTC')::date),0)+${intelligenceAttemptReserveMicrousd}<=${limits.dailyMicros} AS available`.execute(
      this.tx,
    );
    if (!budget.rows[0]?.available) {
      return;
    }

    await sql`WITH eligible AS (
      SELECT u.lead_id,u.scout_id,u.scout_version FROM x_source_updates u
      JOIN scouts s ON s.id=u.scout_id AND s.owner_id=u.owner_id AND s.version=u.scout_version AND s.status='active'
      JOIN web_discovery_cases original ON original.id=u.case_id
      JOIN outbox_events event ON event.id=original.id AND event.published_at IS NOT NULL
      LEFT JOIN web_lead_review_cases c ON c.case_id=u.case_id
      JOIN x_posts p ON p.lead_id=u.lead_id AND NOT p.unavailable AND p.expires_at>now()
      JOIN web_discovery_leads l ON l.id=u.lead_id AND l.content_status='fetched'
      LEFT JOIN LATERAL (
        SELECT r.state,r.failure,r.retry_at,r.lease_until,r.attempts FROM web_lead_reviews r
        WHERE r.lead_id=u.lead_id AND r.input->>'documentFingerprint'=l.document->>'fingerprint'
        AND (c.configuration IS NULL OR r.configuration=c.configuration)
        ORDER BY r.created_at DESC,r.key LIMIT 1
      ) review ON true
      WHERE (
        (c.case_id IS NULL AND (
          original.deadline<=now()
          OR EXISTS(SELECT 1 FROM web_discovery_cases newer WHERE newer.scout_id=s.id AND newer.owner_id=s.owner_id AND newer.started_at>original.started_at)
          OR EXISTS(SELECT 1 FROM discovery_runs run WHERE run.id=original.id AND run.status IN ('completed','failed'))
        ))
        OR (c.status='deferred' AND c.reason IN ('ai_budget_reached','review_window_ended'))
        OR (c.status IN ('pending','reviewing') AND c.deadline<=now())
        OR (c.status='complete' AND c.reason='some_reviews_unavailable')
      )
      AND (
        review.state IS NULL OR review.state='pending'
        OR (review.state='ready' AND c.case_id IS NULL)
        OR (review.state='running' AND review.lease_until<=now() AND review.attempts<2)
        OR (review.state='failed' AND review.failure IN ('provider_unavailable','attempt_outcome_unknown') AND review.attempts<2 AND review.retry_at<=now())
      )
      ORDER BY u.observed_at,u.lead_id,u.scout_id LIMIT 500 FOR UPDATE OF u
    ) UPDATE x_source_updates u SET case_id=NULL FROM eligible e
      WHERE u.lead_id=e.lead_id AND u.scout_id=e.scout_id AND u.scout_version=e.scout_version`.execute(
      this.tx,
    );
  }

  /** Coalesces ten posts per scout with idempotent update acknowledgements and a transactional outbox. */
  async dispatch(): Promise<number> {
    const scouts = await sql<{
      id: string;
      owner_id: string;
      version: number;
      search: SearchDraft;
    }>`SELECT s.id,s.owner_id,s.version,s.search FROM scouts s
      WHERE s.status='active'
      AND EXISTS(SELECT 1 FROM x_source_updates u JOIN x_posts p ON p.lead_id=u.lead_id WHERE u.scout_id=s.id AND u.owner_id=s.owner_id AND u.scout_version=s.version AND u.case_id IS NULL AND NOT p.unavailable AND p.expires_at>now())
      AND NOT EXISTS(SELECT 1 FROM outbox_events e WHERE e.aggregate_id=s.id AND e.published_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM discovery_runs r WHERE r.scout_id=s.id AND r.status='searching' AND r.started_at>now()-interval '20 minutes')
      AND NOT EXISTS(SELECT 1 FROM web_discovery_cases c WHERE c.scout_id=s.id AND ((c.status='searching' AND c.deadline>now()) OR c.started_at>now()-interval '1 minute'))
      AND NOT EXISTS(SELECT 1 FROM web_lead_review_cases r JOIN web_discovery_cases c ON c.id=r.case_id WHERE c.scout_id=s.id AND c.scout_version=s.version AND r.status='reviewing' AND r.deadline>now())
      ORDER BY (SELECT min(observed_at) FROM x_source_updates u WHERE u.scout_id=s.id AND u.scout_version=s.version AND u.case_id IS NULL),s.id FOR UPDATE OF s SKIP LOCKED LIMIT 50`.execute(
      this.tx,
    );
    let total = 0;
    for (const scout of scouts.rows) {
      const posts = await sql<{
        lead_id: string;
      }>`SELECT u.lead_id FROM x_source_updates u JOIN web_discovery_leads l ON l.id=u.lead_id JOIN x_posts p ON p.lead_id=u.lead_id
        WHERE u.scout_id=${scout.id}::uuid AND u.owner_id=${scout.owner_id}::uuid AND u.scout_version=${scout.version} AND u.case_id IS NULL AND l.content_status='fetched' AND NOT p.unavailable AND p.expires_at>now()
        ORDER BY u.observed_at,u.lead_id LIMIT 10`.execute(this.tx);
      if (!posts.rows.length) {
        continue;
      }
      const id = randomUUID();
      const plan: DiscoveryPlan = {
        policy: "public-intent-v3",
        origin: "native_social",
        scoutVersion: scout.version,
        category: scout.search.category,
        queries: [],
        maximumDocuments: 0,
        deadlineSeconds: 240,
        continuation: "explore_on_next_run",
        blockedReason: null,
      };
      await sql`INSERT INTO web_discovery_cases(id,scout_id,owner_id,scout_version,plan,provider,status,reason,deadline,finished_at) VALUES(${id}::uuid,${scout.id}::uuid,${scout.owner_id}::uuid,${scout.version},${JSON.stringify(plan)}::jsonb,'x-api','completed','native_posts_checked',now()+interval '4 minutes',now())`.execute(
        this.tx,
      );
      for (const post of posts.rows) {
        await sql`INSERT INTO web_discovery_case_leads(case_id,lead_id) VALUES(${id}::uuid,${post.lead_id})`.execute(
          this.tx,
        );
        await sql`UPDATE x_source_updates SET case_id=${id}::uuid WHERE lead_id=${post.lead_id} AND scout_id=${scout.id}::uuid AND scout_version=${scout.version} AND case_id IS NULL`.execute(
          this.tx,
        );
      }
      await sql`INSERT INTO outbox_events(id,owner_id,aggregate_id,aggregate_version,event_type,deduplication_key,payload,created_at) VALUES(${id}::uuid,${scout.owner_id}::uuid,${scout.id}::uuid,${scout.version},'scout.refresh_requested',${`native-x:${id}`},${JSON.stringify({ scoutId: scout.id, ownerId: scout.owner_id, version: scout.version })}::jsonb,now())`.execute(
        this.tx,
      );
      total++;
    }
    return total;
  }
}
