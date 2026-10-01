import { sql, type Kysely } from "kysely";
import {
  OpportunityCatalogRepository,
  type DiscoverySummary,
  type OpportunityView,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Groups overlapping private scout recommendations while retaining each current contribution. */
export class PostgresOpportunityCatalogRepository extends OpportunityCatalogRepository {
  /** Receives the native typed client at composition. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Owner, scout version, posting version, open status and evidence freshness are all enforced in SQL. */
  async list(ownerId: string, hidden = false): Promise<OpportunityView[]> {
    if (hidden) {
      return this.hidden(ownerId);
    }

    const result = await sql<OpportunityView>`
      SELECT p.id,p.kind,p.title,p.company,p.location,p.url,p.checked_at::text AS "checkedAt",
        array_agg(DISTINCT scout.name) AS scouts,
        jsonb_build_object('value',coalesce(f.value,'none'),'version',coalesce(f.version,0)) AS feedback,
        (array_agg(r.assessment ORDER BY r.rank DESC,scout.id))[1]->'reasons' AS reasons,
        (array_agg(r.assessment ORDER BY r.rank DESC,scout.id))[1]->'uncertainties' AS uncertainties,
        (array_agg(r.assessment ORDER BY r.rank DESC,scout.id))[1]->'detail' AS detail,
        (array_agg(scout.name ORDER BY r.rank DESC,scout.id))[1] AS "assessmentScout",
        (SELECT a.evidence FROM posting_availability a WHERE a.posting_id=p.id AND a.posting_version=p.version) AS availability
      FROM scout_recommendations r JOIN scouts scout ON scout.id=r.scout_id AND scout.owner_id=r.owner_id AND scout.version=r.scout_version AND scout.status='active'
      JOIN opportunity_postings p ON p.id=r.posting_id AND p.version=r.posting_version AND p.open AND p.checked_at>now()-interval '30 minutes'
      JOIN opportunity_sources source ON source.id=p.source_id AND source.checked_at>now()-interval '30 minutes'
      LEFT JOIN opportunity_feedback f ON f.owner_id=r.owner_id AND f.posting_id=p.id
      WHERE r.owner_id=${ownerId}::uuid AND coalesce(f.value,'none')<>'hidden'
      GROUP BY p.id,f.value,f.version ORDER BY max(r.rank) DESC,max(r.created_at) DESC,p.id LIMIT 20
    `.execute(this.db);

    return result.rows;
  }

  /** Retains up to twenty historical hidden snapshots so undo still works after a refreshed search drops them. */
  private async hidden(ownerId: string): Promise<OpportunityView[]> {
    const rows = await this.db
      .selectFrom("opportunity_feedback")
      .select(["snapshot", "value", "version"])
      .where("owner_id", "=", ownerId)
      .where("value", "=", "hidden")
      .orderBy("updated_at", "desc")
      .orderBy("posting_id")
      .limit(20)
      .execute();

    return rows.map((row) => ({
      ...row.snapshot,
      feedback: { value: row.value, version: row.version },
    }));
  }

  /** Uses bounded independent queries; each private projection explicitly binds the verified owner. */
  async summary(
    ownerId: string,
    scoutIds: string[],
  ): Promise<DiscoverySummary> {
    const [sources, runs, email] = await Promise.all([
      sql<
        DiscoverySummary["sources"][number]
      >`SELECT id,checked_at::text AS "checkedAt",last_error_at::text AS "failedAt",posting_count AS "postingCount" FROM opportunity_sources ORDER BY id LIMIT 10`.execute(
        this.db,
      ),
      sql<
        DiscoverySummary["runs"][number]
      >`SELECT DISTINCT ON (r.scout_id) r.scout_id AS "scoutId",r.status,r.finished_at::text AS "finishedAt",r.match_count AS "matchCount" FROM discovery_runs r WHERE r.owner_id=${ownerId}::uuid AND r.scout_id=ANY(${scoutIds}::uuid[]) ORDER BY r.scout_id,r.started_at DESC,r.id DESC`.execute(
        this.db,
      ),
      sql<
        DiscoverySummary["email"]
      >`SELECT max(finished_at) FILTER (WHERE status='accepted')::text AS "acceptedAt",count(*) FILTER (WHERE status IN ('unknown','submitting'))::integer AS "uncertainCount",count(*) FILTER (WHERE status='rejected')::integer AS "rejectedCount" FROM opportunity_deliveries WHERE owner_id=${ownerId}::uuid`.execute(
        this.db,
      ),
    ]);

    return {
      sources: sources.rows,
      runs: runs.rows,
      email: email.rows[0] ?? {
        acceptedAt: null,
        uncertainCount: 0,
        rejectedCount: 0,
      },
    };
  }
}
