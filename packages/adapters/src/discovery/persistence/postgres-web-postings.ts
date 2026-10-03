import { sql, type Kysely } from "kysely";
import type { Posting } from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Publishes validated web demand and immutable evidence inside the caller's transaction. */
export class PostgresWebPostingRepository {
  /** Receives the review transaction so publication and evidence acceptance commit together. */
  constructor(private readonly tx: Kysely<ScoutAlertDatabase>) {}

  /** Reuses native exact-URL listings and separates jobs from client requests without filling unknown fields. */
  async publish(
    posting: Posting,
    checkedAt: string,
  ): Promise<{ id: string; version: number }> {
    const existing = await sql<{
      id: string;
      version: number;
    }>`SELECT id,version FROM opportunity_postings WHERE url=${posting.url} AND source_id NOT IN ('web-discovery','web-client-requests') ORDER BY id LIMIT 1`.execute(
      this.tx,
    );
    if (existing.rows[0]) {
      return existing.rows[0];
    }
    const kind = posting.kind ?? "job";
    await sql`INSERT INTO opportunity_sources(id,kind,scope,checked_at) VALUES(${posting.source},${kind},'window',${checkedAt}::timestamptz) ON CONFLICT(id) DO UPDATE SET checked_at=greatest(opportunity_sources.checked_at,excluded.checked_at)`.execute(
      this.tx,
    );
    const known =
      await sql<{ source_id: string }>`SELECT source_id FROM opportunity_postings WHERE id=${posting.id}`.execute(
        this.tx,
      );
    const saved = await sql<{
      id: string;
      version: number;
    }>`INSERT INTO opportunity_postings(id,source_id,external_id,family_id,company,title,location,url,content,fingerprint,version,source_updated_at,checked_at,open,kind)
      VALUES(${posting.id},${posting.source},${posting.externalId},${posting.familyId},${posting.company},${posting.title},${posting.location},${posting.url},${posting.text},${posting.fingerprint},1,${posting.sourceUpdatedAt}::timestamptz,${checkedAt}::timestamptz,true,${kind})
      ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,kind=excluded.kind,company=excluded.company,title=excluded.title,location=excluded.location,content=excluded.content,fingerprint=excluded.fingerprint,version=opportunity_postings.version+CASE WHEN opportunity_postings.fingerprint<>excluded.fingerprint OR NOT opportunity_postings.open THEN 1 ELSE 0 END,source_updated_at=excluded.source_updated_at,checked_at=excluded.checked_at,open=true RETURNING id,version`.execute(
      this.tx,
    );
    await sql`INSERT INTO opportunity_evidence(posting_id,version,snapshot,recorded_at) SELECT id,version,jsonb_set(${JSON.stringify(posting)}::jsonb,'{version}',to_jsonb(version)),${checkedAt}::timestamptz FROM opportunity_postings WHERE id=${posting.id} ON CONFLICT DO NOTHING`.execute(
      this.tx,
    );
    const previousSource = known.rows[0]?.source_id;
    if (previousSource && previousSource !== posting.source) {
      await sql`UPDATE opportunity_sources SET posting_count=greatest(0,posting_count-1) WHERE id=${previousSource}`.execute(
        this.tx,
      );
    }
    if (previousSource !== posting.source) {
      await sql`UPDATE opportunity_sources SET posting_count=posting_count+1 WHERE id=${posting.source}`.execute(
        this.tx,
      );
    }
    return saved.rows[0]!;
  }
}
