import { sql, type Kysely } from "kysely";
import {
  buildNativeContext,
  nativeReferences,
  nativeTextIsTruncated,
  type NativeDocument,
} from "@repo/core/discovery";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { discoveryKey } from "./discovery-identities.js";
import { PostgresDiscoveryLeadRepository } from "./postgres-discovery-leads.js";

type Captured = { lead_id: string; document: NativeDocument };

/** Shares bounded parent/quote evidence, queues missing public IDs and maintains durable dependency invalidation. */
export class PostgresSocialContextRepository {
  /** Joins the native source transaction; this repository never performs network requests. */
  constructor(private readonly tx: Kysely<ScoutAlertDatabase>) {}

  /** Resolves at most 100 searched roots; context-only discoveries cannot recursively expand their own frontier. */
  async prepare(): Promise<void> {
    const roots =
      await sql<Captured>`SELECT p.lead_id,l.document FROM x_posts p JOIN web_discovery_leads l ON l.id=p.lead_id
      WHERE NOT p.unavailable AND p.expires_at>now() AND p.context_due_at<=now() AND l.content_status='fetched'
      AND EXISTS(SELECT 1 FROM x_query_posts q JOIN x_search_interests i ON i.query_id=q.query_id JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active' WHERE q.lead_id=p.lead_id AND NOT q.is_context)
      ORDER BY p.context_due_at,p.lead_id FOR UPDATE OF p LIMIT 100`.execute(
        this.tx,
      );
    const sources = await this.sources(roots.rows);
    for (const root of roots.rows) {
      await this.prepareRoot(root, sources);
    }
    await sql`DELETE FROM x_query_posts q USING x_posts p WHERE q.lead_id=p.lead_id AND q.is_context
      AND NOT EXISTS(SELECT 1 FROM x_context_dependencies d JOIN x_query_posts root ON root.lead_id=d.lead_id AND root.query_id=q.query_id AND NOT root.is_context WHERE d.post_id=ANY(p.edit_ids))`.execute(
      this.tx,
    );
  }

  /** Loads two local reference levels with bounded ID batches; HTTP lookups remain separately admitted operations. */
  private async sources(
    roots: Captured[],
  ): Promise<Map<string, NativeDocument>> {
    const sources = new Map<string, NativeDocument>();
    let frontier = roots;
    for (let depth = 0; depth < 3; depth++) {
      for (const source of frontier) {
        for (const id of source.document.nativePost.editIds) {
          sources.set(id, source.document);
        }
      }
      if (depth === 2) {
        break;
      }
      const ids = [
        ...new Set(
          frontier.flatMap((source) =>
            nativeReferences(source.document.nativePost).map((ref) => ref.id),
          ),
        ),
      ]
        .filter((id) => !sources.has(id))
        .slice(0, 600);
      if (!ids.length) {
        break;
      }
      const related =
        await sql<Captured>`SELECT p.lead_id,l.document FROM x_posts p JOIN web_discovery_leads l ON l.id=p.lead_id WHERE NOT p.unavailable AND p.expires_at>now() AND p.edit_ids && ${ids}::text[] AND l.content_status='fetched' ORDER BY p.lead_id LIMIT 600`.execute(
          this.tx,
        );
      frontier = related.rows;
    }
    return sources;
  }

  /** Context changes invalidate review reuse; observation time remains the oldest included source rather than the assembly time. */
  private async prepareRoot(
    root: Captured,
    sources: Map<string, NativeDocument>,
  ): Promise<void> {
    const { nativeContext: previous, ...document } = root.document;
    const context = buildNativeContext(document, sources, new Date());
    const dependencies = context?.dependencies ?? [];
    for (const id of dependencies) {
      const known = sources.get(id);
      await sql`INSERT INTO x_context_requests(post_id,state,next_check_at) VALUES(${id},${known ? "available" : "pending"},${known ? new Date(Date.parse(known.checkedAt) + 10 * 60_000) : new Date()}) ON CONFLICT DO NOTHING`.execute(
        this.tx,
      );
      await sql`INSERT INTO x_context_dependencies(lead_id,post_id) VALUES(${root.lead_id},${id}) ON CONFLICT DO NOTHING`.execute(
        this.tx,
      );
      if (known) {
        await this.associateRelated(root.lead_id, known);
      }
    }
    await sql`DELETE FROM x_context_dependencies WHERE lead_id=${root.lead_id} AND NOT(post_id=ANY(${dependencies}::text[]))`.execute(
      this.tx,
    );
    const ownTruncated = nativeTextIsTruncated(document);
    const next: NativeDocument = {
      ...document,
      nativeContext: context,
      truncated: ownTruncated || Boolean(context && !context.complete),
      fingerprint: context
        ? discoveryKey([
            document.nativePost,
            document.text,
            {
              ...context,
              posts: context.posts.map(
                ({ checkedAt: _checkedAt, ...post }) => post,
              ),
            },
          ])
        : discoveryKey([document.nativePost, document.text]),
    };
    // Refreshing unchanged context updates its timestamps without spending another model call.
    const changed = next.fingerprint !== root.document.fingerprint;
    const refreshed = JSON.stringify(context) !== JSON.stringify(previous);
    if (changed || refreshed) {
      await new PostgresDiscoveryLeadRepository(this.tx).acceptDocument(next);
      await sql`INSERT INTO x_source_updates(lead_id,scout_id,owner_id,scout_version,observed_at)
        SELECT DISTINCT ${root.lead_id},s.id,s.owner_id,s.version,${next.checkedAt}::timestamptz FROM x_query_posts q JOIN x_search_interests i ON i.query_id=q.query_id JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active' WHERE q.lead_id=${root.lead_id}
        ON CONFLICT(lead_id,scout_id,scout_version) DO UPDATE SET case_id=NULL,observed_at=excluded.observed_at`.execute(
        this.tx,
      );
    }
    await sql`UPDATE x_posts SET context_due_at=now()+interval '5 minutes' WHERE lead_id=${root.lead_id}`.execute(
      this.tx,
    );
  }

  /** Reuses an already captured referenced request across current interests without another paid read or private data transfer. */
  private async associateRelated(
    root: string,
    document: NativeDocument,
  ): Promise<void> {
    const leadId = discoveryKey(document.url);
    await sql`INSERT INTO x_query_posts(query_id,lead_id,is_context) SELECT query_id,${leadId},true FROM x_query_posts WHERE lead_id=${root} AND NOT is_context ON CONFLICT DO NOTHING`.execute(
      this.tx,
    );
    await sql`INSERT INTO x_source_updates(lead_id,scout_id,owner_id,scout_version,observed_at)
      SELECT DISTINCT ${leadId},s.id,s.owner_id,s.version,${document.checkedAt}::timestamptz FROM x_query_posts q JOIN x_search_interests i ON i.query_id=q.query_id JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active' WHERE q.lead_id=${root}
      ON CONFLICT DO NOTHING`.execute(this.tx);
  }

  /** A native refresh or edit wakes affected packets; aliases share one lookup and never copy private search input. */
  async observed(document: NativeDocument): Promise<void> {
    await sql`UPDATE x_context_requests SET state='available',next_check_at=now()+interval '10 minutes' WHERE post_id=ANY(${document.nativePost.editIds}::text[])`.execute(
      this.tx,
    );
    await sql`UPDATE x_posts SET context_due_at=now() WHERE lead_id IN(SELECT lead_id FROM x_context_dependencies WHERE post_id=ANY(${document.nativePost.editIds}::text[]))`.execute(
      this.tx,
    );
  }

  /** Explicitly missing/protected posts remain unresolved and use a long backoff rather than repeated paid lookups. */
  async unavailable(ids: string[]): Promise<void> {
    await sql`UPDATE x_context_requests SET state='unavailable',next_check_at=now()+interval '24 hours' WHERE post_id=ANY(${ids}::text[])`.execute(
      this.tx,
    );
    await sql`UPDATE x_posts SET context_due_at=now() WHERE lead_id IN(SELECT lead_id FROM x_context_dependencies WHERE post_id=ANY(${ids}::text[]))`.execute(
      this.tx,
    );
  }
}
