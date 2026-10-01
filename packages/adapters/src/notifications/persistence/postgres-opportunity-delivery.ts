import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  OpportunityDeliveryRepository,
  promptWindow,
  isPromptMatch,
  hasUnavailablePosting,
  hasOutdatedAssessment,
  digestWindow,
  type DigestCandidate,
  type PreparedDigest,
} from "@repo/core/notifications";
import type { ScoutAlerts, SearchDraft } from "@repo/core/onboarding";
import type { OpportunityView } from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Protects recipient-level email effects with version checks, consent checks and persistent item reservations. */
export class PostgresOpportunityDeliveryRepository extends OpportunityDeliveryRepository {
  /** Receives a native client at composition; transaction locks never span SMTP submission. */
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
  }

  /** Selects up to fifty unsent recipients, bounded to twenty postings each at prepare time. */
  async candidates(): Promise<DigestCandidate[]> {
    const ownerIds = await this.db.transaction().execute(async (tx) => {
      const cursor = await sql<{
        after_owner: string | null;
      }>`SELECT after_owner FROM delivery_scan_cursor WHERE id=1 FOR UPDATE`.execute(
        tx,
      );
      const after = cursor.rows[0]?.after_owner ?? null;
      const page = await sql<{ owner_id: string }>`
        SELECT DISTINCT r.owner_id FROM scout_recommendations r
        JOIN notification_preferences n ON n.scout_id=r.scout_id AND n.email_enabled AND n.preferences->>'frequency'<>'dashboard'
        WHERE (${after}::uuid IS NULL OR r.owner_id>${after}::uuid)
          AND NOT EXISTS(SELECT 1 FROM opportunity_feedback f WHERE f.owner_id=r.owner_id AND f.posting_id=r.posting_id AND f.value='hidden')
          AND NOT EXISTS(SELECT 1 FROM opportunity_delivery_items i WHERE i.owner_id=r.owner_id AND i.posting_id=r.posting_id)
        ORDER BY r.owner_id LIMIT 50
      `.execute(tx);
      await sql`UPDATE delivery_scan_cursor SET after_owner=${page.rows.at(-1)?.owner_id ?? null}::uuid WHERE id=1`.execute(
        tx,
      );
      return page.rows.map((row) => row.owner_id);
    });
    if (!ownerIds.length) return [];
    const result = await sql<DigestCandidate>`
      SELECT r.owner_id AS "ownerId",r.scout_id AS "scoutId",r.scout_version AS "scoutVersion",n.version AS "preferenceVersion",r.posting_version AS "postingVersion",n.preferences AS alerts,s.search,
        jsonb_build_object('id',p.id,'kind',p.kind,'title',p.title,'company',p.company,'location',p.location,'url',p.url,'checkedAt',p.checked_at,'scouts',jsonb_build_array(s.name),'reasons',r.assessment->'reasons','uncertainties',r.assessment->'uncertainties','detail',r.assessment->'detail','availability',a.evidence) AS opportunity
      FROM unnest(${ownerIds}::uuid[]) owners(id)
      CROSS JOIN LATERAL (
        SELECT r.* FROM scout_recommendations r WHERE r.owner_id=owners.id
          AND NOT EXISTS(SELECT 1 FROM opportunity_feedback f WHERE f.owner_id=r.owner_id AND f.posting_id=r.posting_id AND f.value='hidden')
          AND NOT EXISTS(SELECT 1 FROM opportunity_delivery_items i WHERE i.owner_id=r.owner_id AND i.posting_id=r.posting_id)
        ORDER BY r.rank DESC,r.created_at,r.posting_id,r.scout_id LIMIT 100
      ) r JOIN scouts s ON s.id=r.scout_id AND s.owner_id=r.owner_id AND s.version=r.scout_version AND s.status='active'
      JOIN notification_preferences n ON n.scout_id=s.id AND n.owner_id=r.owner_id AND n.email_enabled AND n.preferences->>'frequency'<>'dashboard'
      JOIN opportunity_postings p ON p.id=r.posting_id AND p.version=r.posting_version AND p.open AND p.checked_at>now()-interval '30 minutes'
      JOIN opportunity_sources src ON src.id=p.source_id AND src.checked_at>now()-interval '30 minutes'
      LEFT JOIN posting_availability a ON a.posting_id=p.id AND a.posting_version=p.version
      WHERE r.owner_id=ANY(${ownerIds}::uuid[]) AND NOT EXISTS(SELECT 1 FROM opportunity_delivery_items i WHERE i.owner_id=r.owner_id AND i.posting_id=p.id)
      ORDER BY r.owner_id,r.rank DESC,r.created_at
    `.execute(this.db);
    return result.rows;
  }

  /** Locks the recipient and current inputs, groups duplicate posting contributions, and reserves the external effect once. */
  async prepare(
    ownerId: string,
    window: string,
    candidates: DigestCandidate[],
  ): Promise<PreparedDigest | null> {
    return this.db.transaction().execute(async (tx) => {
      const user = await sql<{
        email: string;
      }>`SELECT email FROM users WHERE id=${ownerId}::uuid FOR UPDATE`.execute(
        tx,
      );
      const recipient = user.rows[0]?.email;
      if (!recipient) return null;
      await sql`SELECT id FROM opportunity_sources ORDER BY id FOR SHARE`.execute(
        tx,
      );
      await sql`SELECT id FROM scouts WHERE owner_id=${ownerId}::uuid ORDER BY id FOR SHARE`.execute(
        tx,
      );
      await sql`SELECT scout_id FROM notification_preferences WHERE owner_id=${ownerId}::uuid ORDER BY scout_id FOR SHARE`.execute(
        tx,
      );
      const prompt = window.startsWith("prompt:");
      const now = this.now();
      const recent = prompt
        ? await sql`SELECT id FROM opportunity_deliveries WHERE owner_id=${ownerId}::uuid AND window_key LIKE 'prompt:%' AND created_at>${new Date(now.getTime() - 86_400_000)} LIMIT 1`.execute(
            tx,
          )
        : null;
      if (recent?.rows.length) return null;
      await sql`SELECT a.posting_id FROM posting_availability a WHERE a.posting_id=ANY(${candidates.map((candidate) => candidate.opportunity.id)}::text[]) ORDER BY a.posting_id,a.posting_version FOR SHARE`.execute(
        tx,
      );
      const captured = candidates.map((candidate) => ({
        scoutId: candidate.scoutId,
        scoutVersion: candidate.scoutVersion,
        preferenceVersion: candidate.preferenceVersion,
        postingId: candidate.opportunity.id,
        postingVersion: candidate.postingVersion,
      }));
      const rows = await sql<{
        id: string;
        kind: "job" | "client_request";
        title: string;
        company: string;
        location: string;
        url: string;
        checkedAt: string;
        scout: string;
        assessment: Pick<
          OpportunityView,
          "reasons" | "uncertainties" | "detail"
        >;
        alerts: ScoutAlerts;
        search: SearchDraft;
        availability: OpportunityView["availability"];
      }>`
        SELECT p.id,p.kind,p.title,p.company,p.location,p.url,p.checked_at::text AS "checkedAt",s.name AS scout,r.assessment,n.preferences AS alerts,s.search,a.evidence AS availability
        FROM jsonb_to_recordset(${JSON.stringify(captured)}::jsonb) AS c("scoutId" uuid,"scoutVersion" integer,"preferenceVersion" integer,"postingId" text,"postingVersion" integer)
        JOIN scouts s ON s.id=c."scoutId" AND s.owner_id=${ownerId}::uuid AND s.version=c."scoutVersion" AND s.status='active'
        JOIN notification_preferences n ON n.scout_id=s.id AND n.owner_id=s.owner_id AND n.version=c."preferenceVersion" AND n.email_enabled AND (n.preferences->>'consent')::boolean AND n.preferences->>'frequency'<>'dashboard'
        JOIN scout_recommendations r ON r.scout_id=s.id AND r.owner_id=s.owner_id AND r.scout_version=s.version AND r.posting_id=c."postingId" AND r.posting_version=c."postingVersion"
        JOIN opportunity_postings p ON p.id=r.posting_id AND p.version=r.posting_version AND p.open AND p.checked_at>now()-interval '30 minutes'
        JOIN opportunity_sources src ON src.id=p.source_id AND src.checked_at>now()-interval '30 minutes'
        LEFT JOIN posting_availability a ON a.posting_id=p.id AND a.posting_version=p.version
        WHERE NOT EXISTS(SELECT 1 FROM opportunity_feedback f WHERE f.owner_id=${ownerId}::uuid AND f.posting_id=p.id AND f.value='hidden')
          AND NOT EXISTS (SELECT 1 FROM opportunity_delivery_items i WHERE i.owner_id=${ownerId}::uuid AND i.posting_id=p.id)
          AND COALESCE((SELECT ce.granted FROM consent_events ce WHERE ce.scout_id=s.id ORDER BY ce.created_at DESC,ce.id DESC LIMIT 1),false)
        ORDER BY r.rank DESC,p.id,s.id
      `.execute(tx);
      const grouped = new Map<string, OpportunityView>();
      for (const row of rows.rows) {
        const opportunity: OpportunityView = {
          id: row.id,
          kind: row.kind,
          title: row.title,
          company: row.company,
          location: row.location,
          url: row.url,
          checkedAt: row.checkedAt,
          scouts: [row.scout],
          ...row.assessment,
          availability: row.availability,
        };
        const eligible = prompt
          ? promptWindow(row.alerts, now) === window &&
            isPromptMatch(opportunity, row.search, now)
          : digestWindow(row.alerts, now) === window;
        if (!eligible || hasOutdatedAssessment(opportunity)) continue;
        if (hasUnavailablePosting(opportunity, now)) continue;
        const entry = grouped.get(row.id);
        if (entry) {
          entry.scouts.push(row.scout);
          continue;
        }
        if (grouped.size >= (prompt ? 1 : 20)) continue;
        grouped.set(row.id, opportunity);
      }
      const opportunities = [...grouped.values()];
      if (!opportunities.length) return null;
      const id = randomUUID();
      const claim =
        await sql`INSERT INTO opportunity_deliveries (id,owner_id,window_key,recipient,contents,status) VALUES (${id}::uuid,${ownerId}::uuid,${window},${recipient},${JSON.stringify({ opportunities, contributions: captured })}::jsonb,'submitting') ON CONFLICT (owner_id,window_key) DO NOTHING RETURNING id`.execute(
          tx,
        );
      if (!claim.rows.length) return null;
      for (const opportunity of opportunities)
        await sql`INSERT INTO opportunity_delivery_items (owner_id,posting_id,delivery_id) VALUES (${ownerId}::uuid,${opportunity.id},${id}::uuid)`.execute(
          tx,
        );
      return { id, recipient, opportunities };
    });
  }

  /** Acceptance is distinct from inbox delivery; known rejection releases items for a later scheduled window. */
  async finish(
    id: string,
    status: "accepted" | "rejected" | "unknown",
    messageId?: string,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const outcome =
        await sql`UPDATE opportunity_deliveries SET status=${status},provider_message_id=${messageId ?? null},finished_at=now() WHERE id=${id}::uuid AND status IN ('submitting','unknown') RETURNING id`.execute(
          tx,
        );
      if (status !== "rejected" || !outcome.rows.length) return;
      await sql`DELETE FROM opportunity_delivery_items WHERE delivery_id=${id}::uuid`.execute(
        tx,
      );
    });
  }

  /** A crashed SMTP attempt becomes explicitly unknown and retains its item reservations for manual reconciliation. */
  async recoverUncertain(): Promise<void> {
    await sql`UPDATE opportunity_deliveries SET status='unknown',finished_at=now() WHERE status='submitting' AND created_at<now()-interval '2 minutes'`.execute(
      this.db,
    );
  }
}
