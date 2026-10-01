import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  ScoutingRepository,
  roleTerms,
  type Assessment,
  type Posting,
  type RunContext,
  type ScoutRunRequest,
} from "@repo/core/scouting";
import type { SearchDraft } from "@repo/core/onboarding";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Owns discovery state transitions and checks current versions again at publication. */
export class PostgresScoutingRepository extends ScoutingRepository {
  /** Receives a native PostgreSQL client, keeping transaction participation explicit. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Locks the scout, recognizes replay and rejects stale inputs before returning the authoritative brief. */
  async begin(request: ScoutRunRequest): Promise<RunContext | null> {
    return this.db.transaction().execute(async (tx) => {
      const found = await sql<{
        search: SearchDraft;
        version: number;
      }>`SELECT search,version FROM scouts WHERE id=${request.scoutId}::uuid AND owner_id=${request.ownerId}::uuid AND status='active' FOR UPDATE`.execute(
        tx,
      );
      const scout = found.rows[0];
      if (!scout || scout.version !== request.version) return null;
      const existing = await sql<{
        status: string;
        superseded: boolean;
      }>`SELECT status,EXISTS(SELECT 1 FROM discovery_runs newer WHERE newer.scout_id=r.scout_id AND newer.started_at>r.started_at) AS superseded FROM discovery_runs r WHERE id=${request.runId}::uuid`.execute(
        tx,
      );
      const run = existing.rows[0];
      if (run && (run.status !== "searching" || run.superseded)) return null;
      await sql`INSERT INTO discovery_runs (id,scout_id,owner_id,scout_version,status) VALUES (${request.runId}::uuid,${request.scoutId}::uuid,${request.ownerId}::uuid,${request.version},'searching') ON CONFLICT (id) DO NOTHING`.execute(
        tx,
      );
      await sql`UPDATE scouts SET discovery_status='searching' WHERE id=${request.scoutId}::uuid`.execute(
        tx,
      );
      return { request, search: scout.search };
    });
  }

  /** Uses the shared GIN-indexed search document before private title matching; stale evidence is excluded. */
  async candidates(context: RunContext): Promise<Posting[] | null> {
    const ready =
      await sql`SELECT id FROM opportunity_sources WHERE kind=${context.search.category === "services" ? "client_request" : "job"} AND checked_at>now()-interval '30 minutes' LIMIT 1`.execute(
        this.db,
      );
    if (!ready.rows.length) return null;
    const query = roleTerms(context.search.target).join(" ");
    const found = await sql<Posting>`
      SELECT p.id,p.kind,p.source_id AS source,p.external_id AS "externalId",p.family_id AS "familyId",p.company,p.title,p.location,p.url,p.content AS text,p.source_updated_at::text AS "sourceUpdatedAt",p.fingerprint,p.version
      FROM opportunity_postings p JOIN opportunity_sources s ON s.id=p.source_id
      WHERE NOT EXISTS(SELECT 1 FROM opportunity_feedback f WHERE f.owner_id=${context.request.ownerId}::uuid AND f.posting_id=p.id AND f.value='hidden') AND p.kind=${context.search.category === "services" ? "client_request" : "job"} AND p.open AND p.checked_at>now()-interval '30 minutes' AND s.checked_at>now()-interval '30 minutes' AND p.search_document @@ plainto_tsquery('english',${query})
      ORDER BY ts_rank_cd(p.search_document,plainto_tsquery('english',${query})) DESC,p.id LIMIT 200
    `.execute(this.db);
    return found.rows;
  }

  /** Publishes a bounded result set atomically; changed scout/posting inputs force a fresh assessment. */
  async complete(
    context: RunContext,
    matches: { posting: Posting; assessment: Assessment }[],
    outcome: "completed" | "coverage_unavailable" = "completed",
  ): Promise<void> {
    const { request } = context;
    await this.db.transaction().execute(async (tx) => {
      // Shared source locks precede scout locks, matching the delivery gate's lock order.
      await sql`SELECT id FROM opportunity_sources ORDER BY id FOR SHARE`.execute(
        tx,
      );
      const scout =
        await sql`SELECT id FROM scouts WHERE id=${request.scoutId}::uuid AND owner_id=${request.ownerId}::uuid AND version=${request.version} AND status='active' FOR UPDATE`.execute(
          tx,
        );
      if (!scout.rows.length) return;
      const run =
        await sql`SELECT id FROM discovery_runs r WHERE id=${request.runId}::uuid AND scout_id=${request.scoutId}::uuid AND owner_id=${request.ownerId}::uuid AND scout_version=${request.version} AND status='searching' AND NOT EXISTS(SELECT 1 FROM discovery_runs newer WHERE newer.scout_id=r.scout_id AND newer.started_at>r.started_at)`.execute(
          tx,
        );
      if (!run.rows.length) return;
      const records = matches.map(({ posting, assessment }) => ({
        postingId: posting.id,
        version: posting.version,
        assessment,
        rank: assessment.rank,
      }));
      const valid = await sql<{ count: number }>`
        SELECT count(*)::integer AS count FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS m("postingId" text,version integer)
        JOIN opportunity_postings p ON p.id=m."postingId" AND p.version=m.version AND p.open AND p.checked_at>now()-interval '30 minutes'
        JOIN opportunity_sources s ON s.id=p.source_id AND s.checked_at>now()-interval '30 minutes'
      `.execute(tx);
      if (valid.rows[0]?.count !== matches.length)
        throw new Error("evidence_changed");
      await sql`DELETE FROM scout_recommendations WHERE scout_id=${request.scoutId}::uuid`.execute(
        tx,
      );
      await sql`
        INSERT INTO scout_recommendations (scout_id,owner_id,scout_version,posting_id,posting_version,assessment,rank)
        SELECT ${request.scoutId}::uuid,${request.ownerId}::uuid,${request.version},m."postingId",m.version,m.assessment,m.rank
        FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS m("postingId" text,version integer,assessment jsonb,rank integer)
      `.execute(tx);
      await sql`UPDATE discovery_runs SET status=${outcome},finished_at=now(),match_count=${matches.length} WHERE id=${request.runId}::uuid`.execute(
        tx,
      );
      await sql`UPDATE scouts SET discovery_status=${outcome} WHERE id=${request.scoutId}::uuid`.execute(
        tx,
      );
    });
  }

  /** A terminal attempt becomes visible only if no newer run or revision superseded it. */
  async fail(request: ScoutRunRequest): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await sql`SELECT id FROM scouts WHERE id=${request.scoutId}::uuid FOR UPDATE`.execute(
        tx,
      );
      const result =
        await sql`UPDATE discovery_runs r SET status='failed',finished_at=now() WHERE id=${request.runId}::uuid AND scout_id=${request.scoutId}::uuid AND owner_id=${request.ownerId}::uuid AND scout_version=${request.version} AND status='searching' AND NOT EXISTS(SELECT 1 FROM discovery_runs newer WHERE newer.scout_id=r.scout_id AND newer.started_at>r.started_at) RETURNING id`.execute(
          tx,
        );
      if (!result.rows.length) return;
      await sql`UPDATE scouts SET discovery_status='failed' WHERE id=${request.scoutId}::uuid AND version=${request.version}`.execute(
        tx,
      );
    });
  }

  /** One batch favors the least recently requested scouts; repeated ticks sweep beyond a single fixed page. */
  async reconcile(epoch: string, now: Date): Promise<number> {
    return this.db.transaction().execute(async (tx) => {
      // Lock scout rows before closing orphaned runs, using the same order as normal run completion.
      const expired = await sql<{
        id: string;
      }>`SELECT s.id FROM scouts s WHERE EXISTS(SELECT 1 FROM discovery_runs r WHERE r.scout_id=s.id AND r.status='searching' AND r.started_at<${now}::timestamptz-interval '20 minutes') ORDER BY s.id FOR UPDATE SKIP LOCKED LIMIT 500`.execute(
        tx,
      );
      const expiredIds = expired.rows.map((row) => row.id);
      await sql`UPDATE discovery_runs SET status='failed',finished_at=${now} WHERE scout_id=ANY(${expiredIds}::uuid[]) AND status='searching' AND started_at<${now}::timestamptz-interval '20 minutes'`.execute(
        tx,
      );
      await sql`UPDATE scouts s SET discovery_status='failed' WHERE id=ANY(${expiredIds}::uuid[]) AND discovery_status='searching' AND EXISTS(SELECT 1 FROM discovery_runs r WHERE r.scout_id=s.id AND r.scout_version=s.version AND r.status='failed' AND NOT EXISTS(SELECT 1 FROM discovery_runs newer WHERE newer.scout_id=r.scout_id AND newer.started_at>r.started_at))`.execute(
        tx,
      );
      const scouts = await sql<{
        id: string;
        owner_id: string;
        version: number;
      }>`SELECT id,owner_id,version FROM scouts WHERE status='active' AND NOT EXISTS(SELECT 1 FROM discovery_runs running WHERE running.scout_id=scouts.id AND running.scout_version=scouts.version AND running.status='searching') AND discovery_requested_at<${now}::timestamptz-interval '10 minutes' ORDER BY discovery_requested_at,id FOR UPDATE SKIP LOCKED LIMIT 500`.execute(
        tx,
      );
      const intents = scouts.rows.map((scout) => ({
        id: randomUUID(),
        ownerId: scout.owner_id,
        scoutId: scout.id,
        version: scout.version,
        key: `scout.refresh:${scout.id}:${scout.version}:${epoch}`,
      }));
      await sql`INSERT INTO outbox_events (id,owner_id,aggregate_id,aggregate_version,event_type,deduplication_key,payload,created_at)
        SELECT i.id::uuid,i."ownerId"::uuid,i."scoutId"::uuid,i.version,'scout.refresh_requested',i.key,jsonb_build_object('scoutId',i."scoutId",'ownerId',i."ownerId",'version',i.version),${now}
        FROM jsonb_to_recordset(${JSON.stringify(intents)}::jsonb) AS i(id text,"ownerId" text,"scoutId" text,version integer,key text)
        ON CONFLICT (deduplication_key) DO NOTHING`.execute(tx);
      if (scouts.rows.length)
        await sql`UPDATE scouts SET discovery_requested_at=${now} WHERE id=ANY(${scouts.rows.map((scout) => scout.id)}::uuid[])`.execute(
          tx,
        );
      return scouts.rows.length;
    });
  }
}
