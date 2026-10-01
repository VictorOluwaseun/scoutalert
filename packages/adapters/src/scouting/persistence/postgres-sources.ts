import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { SourceRepository, type SourceSnapshot } from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Publishes shared source snapshots transactionally; failed fetches cannot close legitimate postings. */
export class PostgresSourceRepository extends SourceRepository {
  /** Receives the native typed pool; only repository methods execute queries. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Uses a short lease and five-minute freshness interval to collapse concurrent collection. */
  async claim(source: string, now: Date): Promise<string | null> {
    const lease = randomUUID();
    const result = await sql<{ lease_token: string }>`
      INSERT INTO opportunity_sources (id, lease_token, lease_until) VALUES (${source}, ${lease}::uuid, ${now}::timestamptz + interval '1 minute')
      ON CONFLICT (id) DO UPDATE SET lease_token=excluded.lease_token, lease_until=excluded.lease_until
      WHERE (opportunity_sources.lease_until IS NULL OR opportunity_sources.lease_until < ${now})
        AND (opportunity_sources.checked_at IS NULL OR opportunity_sources.checked_at < ${now}::timestamptz - interval '5 minutes')
      RETURNING lease_token
    `.execute(this.db);

    return result.rows[0]?.lease_token ?? null;
  }

  /** Bulk upserts evidence once per meaningful version; source locking prevents late lease holders from publishing. */
  async publish(snapshot: SourceSnapshot, lease: string): Promise<void> {
    const kind = snapshot.kind ?? "job";

    if (
      snapshot.postings.some(
        (posting) =>
          posting.source !== snapshot.source ||
          (posting.kind ?? "job") !== kind,
      )
    ) {
      throw new Error("invalid_source_snapshot");
    }

    await this.db.transaction().execute(async (tx) => {
      const owner =
        await sql`SELECT id FROM opportunity_sources WHERE id=${snapshot.source} AND lease_token=${lease}::uuid AND lease_until>now() FOR UPDATE`.execute(
          tx,
        );

      if (!owner.rows.length) {
        throw new Error("source_lease_expired");
      }

      await sql`
        INSERT INTO opportunity_postings (id,source_id,external_id,family_id,company,title,location,url,content,fingerprint,version,source_updated_at,checked_at,open,kind)
        SELECT p.id,${snapshot.source},p."externalId",p."familyId",p.company,p.title,p.location,p.url,p.text,p.fingerprint,1,p."sourceUpdatedAt"::timestamptz,${snapshot.checkedAt}::timestamptz,true,${kind}
        FROM jsonb_to_recordset(${JSON.stringify(snapshot.postings)}::jsonb) AS p(id text,"externalId" text,"familyId" text,company text,title text,location text,url text,text text,fingerprint text,"sourceUpdatedAt" text)
        ON CONFLICT (id) DO UPDATE SET kind=excluded.kind,family_id=excluded.family_id,company=excluded.company,title=excluded.title,location=excluded.location,url=excluded.url,content=excluded.content,
          fingerprint=excluded.fingerprint,version=opportunity_postings.version + CASE WHEN opportunity_postings.fingerprint<>excluded.fingerprint OR NOT opportunity_postings.open THEN 1 ELSE 0 END,
          source_updated_at=excluded.source_updated_at,checked_at=excluded.checked_at,open=true;
      `.execute(tx);
      await sql`UPDATE opportunity_postings SET open=false,version=version+1,checked_at=${snapshot.checkedAt}::timestamptz WHERE ${snapshot.scope ?? "complete"}='complete' AND source_id=${snapshot.source} AND open AND checked_at<>${snapshot.checkedAt}::timestamptz`.execute(
        tx,
      );
      await sql`
        INSERT INTO opportunity_evidence (posting_id,version,snapshot,recorded_at)
        SELECT id,version,jsonb_build_object('kind',kind,'title',title,'company',company,'location',location,'url',url,'text',content,'open',open,'sourceUpdatedAt',source_updated_at,'fingerprint',fingerprint,'familyId',family_id),${snapshot.checkedAt}::timestamptz
        FROM opportunity_postings WHERE source_id=${snapshot.source} AND checked_at=${snapshot.checkedAt}::timestamptz ON CONFLICT DO NOTHING
      `.execute(tx);
      await sql`UPDATE opportunity_sources SET kind=${kind},scope=${snapshot.scope ?? "complete"},checked_at=${snapshot.checkedAt}::timestamptz,posting_count=${snapshot.postings.length},last_error_at=NULL,lease_token=NULL,lease_until=NULL WHERE id=${snapshot.source}`.execute(
        tx,
      );
    });
  }

  /** Records health independently of successful freshness, then releases this attempt's lease. */
  async fail(source: string, lease: string): Promise<void> {
    await sql`UPDATE opportunity_sources SET last_error_at=now(),lease_token=NULL,lease_until=NULL WHERE id=${source} AND lease_token=${lease}::uuid`.execute(
      this.db,
    );
  }
}
