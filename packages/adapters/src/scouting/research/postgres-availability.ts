import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  AvailabilityRepository,
  type AvailabilityEvidence,
  type Posting,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Shares public observations across scouts and fences retries; the fifteen-minute cache is never personal. */
export class PostgresAvailabilityRepository extends AvailabilityRepository {
  /** Receives the native PostgreSQL connection at composition. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Seeds only current AI recommendations, then locks one due revision without blocking another researcher. */
  async claim(): Promise<{ token: string; posting: Posting } | null> {
    return this.db.transaction().execute(async (tx) => {
      await sql`
        INSERT INTO posting_availability(posting_id,posting_version)
        SELECT p.id,p.version FROM opportunity_postings p WHERE p.open
          AND NOT EXISTS(SELECT 1 FROM posting_availability a WHERE a.posting_id=p.id AND a.posting_version=p.version)
          AND EXISTS(SELECT 1 FROM scout_recommendations r JOIN scouts s ON s.id=r.scout_id AND s.owner_id=r.owner_id AND s.version=r.scout_version AND s.status='active'
            WHERE r.posting_id=p.id AND r.posting_version=p.version AND (r.assessment->>'policy'='personal-fit-v1' OR p.kind='client_request'))
        ORDER BY p.id LIMIT 100
        ON CONFLICT DO NOTHING
      `.execute(tx);
      const row = await sql<Posting>`
        SELECT p.id,p.kind,p.source_id AS source,p.external_id AS "externalId",p.family_id AS "familyId",p.company,p.title,p.location,p.url,p.content AS text,p.source_updated_at::text AS "sourceUpdatedAt",p.fingerprint,p.version
        FROM posting_availability a JOIN opportunity_postings p ON p.id=a.posting_id AND p.version=a.posting_version AND p.open
        JOIN opportunity_sources src ON src.id=p.source_id AND src.checked_at>now()-interval '30 minutes'
        WHERE a.next_check_at<=now() AND (a.lease_until IS NULL OR a.lease_until<=now())
          AND EXISTS(SELECT 1 FROM scout_recommendations r JOIN scouts s ON s.id=r.scout_id AND s.owner_id=r.owner_id AND s.version=r.scout_version AND s.status='active'
            WHERE r.posting_id=p.id AND r.posting_version=p.version AND (r.assessment->>'policy'='personal-fit-v1' OR p.kind='client_request'))
        ORDER BY a.next_check_at,p.id LIMIT 1 FOR UPDATE OF a SKIP LOCKED
      `.execute(tx);
      const posting = row.rows[0];

      if (!posting) {
        return null;
      }

      const token = randomUUID();
      await sql`UPDATE posting_availability SET lease_token=${token}::uuid,lease_until=now()+interval '30 seconds' WHERE posting_id=${posting.id} AND posting_version=${posting.version}`.execute(
        tx,
      );

      return { token, posting };
    });
  }

  /** Observations are historical facts; superseded or expired attempts cannot overwrite current evidence. */
  async complete(token: string, evidence: AvailabilityEvidence): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const result = await sql<{ posting_id: string; posting_version: number }>`
        UPDATE posting_availability a SET evidence=${JSON.stringify(evidence)}::jsonb,lease_until=NULL,next_check_at=now()+interval '15 minutes'
        WHERE a.lease_token=${token}::uuid AND a.lease_until>now()
          AND EXISTS(SELECT 1 FROM opportunity_postings p WHERE p.id=a.posting_id AND p.version=a.posting_version AND p.open AND (${evidence.status}<>'available' OR p.fingerprint=${evidence.fingerprint}))
        RETURNING posting_id,posting_version
      `.execute(tx);
      const saved = result.rows[0];

      if (!saved) {
        return;
      }

      // Only a current, equal-content observation can renew freshness outside a rolling feed window.
      if (evidence.status === "available") {
        await sql`UPDATE opportunity_postings SET checked_at=now() WHERE id=${saved.posting_id} AND version=${saved.posting_version} AND fingerprint=${evidence.fingerprint} AND open`.execute(
          tx,
        );
      }

      await sql`INSERT INTO posting_availability_observations(id,posting_id,posting_version,evidence) VALUES(${token}::uuid,${saved.posting_id},${saved.posting_version},${JSON.stringify(evidence)}::jsonb) ON CONFLICT DO NOTHING`.execute(
        tx,
      );
    });
  }
}
