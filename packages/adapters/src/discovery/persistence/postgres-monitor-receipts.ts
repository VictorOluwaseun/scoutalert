import { sql, type Kysely } from "kysely";
import {
  monitorFingerprint,
  monitorLinks,
  nextMonitorCheck,
  type MonitorClaim,
  type MonitorOutcome,
  type SourceDocumentResult,
  type SourceMonitor,
} from "@repo/core/discovery";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { canonicalDiscoveryUrl, discoveryKey } from "./discovery-identities.js";

/** Commits shared check evidence, adaptive scheduling and durable subscriber updates in the caller's transaction. */
export class PostgresMonitorReceiptRepository {
  /** Shares the coordinator's locks and configured per-scout source ceiling. */
  constructor(
    private readonly tx: Kysely<ScoutAlertDatabase>,
    private readonly maximumSources: number,
  ) {}

  /** Validates the exact completed operation and current monitor state before applying its receipt once. */
  async accept(
    claim: Extract<MonitorClaim, { status: "observed" }>,
    outcome: MonitorOutcome,
  ): Promise<void> {
    const found =
      await sql<SourceMonitor>`SELECT m.id,m.url,m.kind,m.depth,m.fingerprint,m.unchanged,m.failures FROM web_source_monitors m JOIN web_discovery_operations o ON o.key=m.pending_key
      WHERE m.id=${claim.monitor.id} AND m.pending_key=${claim.key} AND o.state IN ('succeeded','failed') AND o.result IS NOT DISTINCT FROM ${claim.result ? JSON.stringify(claim.result) : null}::jsonb FOR UPDATE OF m`.execute(
        this.tx,
      );
    const monitor = found.rows[0];
    if (
      !monitor ||
      JSON.stringify(nextMonitorCheck(monitor, claim.result)) !==
        JSON.stringify(outcome)
    ) {
      return;
    }
    const saved =
      await sql`INSERT INTO web_source_checks(operation_key,monitor_id,status,reason,changed,checked_at) VALUES(${claim.key},${monitor.id},${claim.result?.status ?? "unavailable"},${outcome.reason},${outcome.changed},${claim.result?.checkedAt ?? new Date().toISOString()}::timestamptz) ON CONFLICT DO NOTHING RETURNING operation_key`.execute(
        this.tx,
      );
    if (!saved.rows.length) {
      await sql`UPDATE web_source_monitors SET pending_key=NULL,next_check_at=now()+interval '30 minutes' WHERE id=${monitor.id}`.execute(
        this.tx,
      );
      return;
    }
    await sql`UPDATE web_source_monitors SET status=${outcome.status},reason=${outcome.reason},next_check_at=now()+make_interval(mins=>${outcome.intervalMinutes}),checked_at=${claim.result?.checkedAt ?? new Date().toISOString()}::timestamptz,checks=checks+1,changes=changes+${outcome.changed ? 1 : 0},unchanged=${outcome.unchanged},failures=${outcome.failures},fingerprint=${claim.result?.status === "fetched" ? monitorFingerprint(claim.result) : monitor.fingerprint},pending_key=NULL,updated_at=now() WHERE id=${monitor.id}`.execute(
      this.tx,
    );
    if (claim.result?.status !== "fetched") {
      return;
    }
    // Unchanged captures also renew public freshness through cached review, without paying for extraction again.
    await sql`INSERT INTO web_source_updates(operation_key,monitor_id,scout_id,owner_id,scout_version)
      SELECT ${claim.key},i.monitor_id,i.scout_id,i.owner_id,i.scout_version FROM web_source_interests i JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active'
      WHERE i.monitor_id=${monitor.id} ON CONFLICT DO NOTHING`.execute(this.tx);
  }

  /** Enqueues only observed demand links after a current directory review; URLs never inherit the parent's evidence or approval. */
  async links(
    parentId: string,
    document: SourceDocumentResult,
  ): Promise<number> {
    const parent = await sql<{
      depth: number;
      expansion_checked_at: Date | null;
      expansion_count: number;
    }>`SELECT depth,expansion_checked_at,expansion_count FROM web_source_monitors WHERE id=${parentId} AND kind='directory' AND status='active' AND depth<2 FOR UPDATE`.execute(
      this.tx,
    );
    if (!parent.rows[0]) {
      return 0;
    }
    const previous = parent.rows[0].expansion_checked_at?.getTime() ?? 0;
    const observed = Date.parse(document.checkedAt);
    const used = observed > previous ? 0 : parent.rows[0].expansion_count;
    const allowance = observed < previous ? 0 : Math.max(0, 4 - used);
    for (const link of monitorLinks(document)) {
      const url = canonicalDiscoveryUrl(link.url);
      if (!url || url === document.url) {
        continue;
      }
      await sql`INSERT INTO web_source_monitor_links(parent_id,url,title,first_seen_at,last_seen_at) VALUES(${parentId},${url},${link.text},${document.checkedAt}::timestamptz,${document.checkedAt}::timestamptz) ON CONFLICT(parent_id,url) DO UPDATE SET title=excluded.title,last_seen_at=excluded.last_seen_at`.execute(
        this.tx,
      );
    }
    const links = await sql<{
      url: string;
      title: string;
    }>`SELECT url,title FROM web_source_monitor_links WHERE parent_id=${parentId} AND child_id IS NULL AND last_seen_at=${document.checkedAt}::timestamptz ORDER BY first_seen_at DESC,url LIMIT ${allowance}`.execute(
      this.tx,
    );
    let added = 0;
    for (const link of links.rows) {
      const capacity =
        await sql`SELECT 1 FROM web_source_interests i JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active' WHERE i.monitor_id=${parentId} AND (SELECT count(*) FROM web_source_interests existing JOIN web_source_monitors m ON m.id=existing.monitor_id WHERE existing.scout_id=s.id AND existing.scout_version=s.version AND m.status<>'retired')<${this.maximumSources} LIMIT 1`.execute(
          this.tx,
        );
      if (!capacity.rows.length) {
        break;
      }
      const id = discoveryKey(link.url);
      await sql`INSERT INTO web_discovery_leads(id,url,source,title,first_seen_at,last_seen_at) VALUES(${id},${link.url},${new URL(link.url).hostname},${link.title},${document.checkedAt}::timestamptz,${document.checkedAt}::timestamptz) ON CONFLICT DO NOTHING`.execute(
        this.tx,
      );
      await sql`INSERT INTO web_source_monitors(id,url,kind,depth,parent_id,reason,next_check_at) VALUES(${id},${link.url},'probe',${parent.rows[0].depth + 1},${parentId},'observed_link',now()) ON CONFLICT DO NOTHING`.execute(
        this.tx,
      );
      await sql`UPDATE web_source_monitor_links SET child_id=${id} WHERE parent_id=${parentId} AND url=${link.url}`.execute(
        this.tx,
      );
      await this.inherit(parentId, id);
      added++;
    }
    // Existing children can gain a newly interested scout, but each scout's own ceiling and revision still apply.
    const children = await sql<{
      child_id: string;
    }>`SELECT child_id FROM web_source_monitor_links WHERE parent_id=${parentId} AND child_id IS NOT NULL ORDER BY first_seen_at DESC,url LIMIT 32`.execute(
      this.tx,
    );
    for (const child of children.rows) {
      await this.inherit(parentId, child.child_id);
    }
    await sql`UPDATE web_source_monitors SET discovered_links=discovered_links+${added},expansion_checked_at=greatest(expansion_checked_at,${document.checkedAt}::timestamptz),expansion_count=${used + added} WHERE id=${parentId}`.execute(
      this.tx,
    );
    await sql`UPDATE web_source_checks SET new_links=new_links+${added} WHERE operation_key=(SELECT operation_key FROM web_source_checks WHERE monitor_id=${parentId} AND checked_at=${document.checkedAt}::timestamptz ORDER BY recorded_at DESC LIMIT 1)`.execute(
      this.tx,
    );
    return added;
  }

  /** Shares only URL interest, enforcing each current scout's ceiling independently before subscribing it. */
  private async inherit(parentId: string, childId: string): Promise<void> {
    await sql`INSERT INTO web_source_interests(monitor_id,scout_id,owner_id,scout_version)
        SELECT ${childId},i.scout_id,i.owner_id,i.scout_version FROM web_source_interests i JOIN scouts s ON s.id=i.scout_id AND s.owner_id=i.owner_id AND s.version=i.scout_version AND s.status='active'
        WHERE i.monitor_id=${parentId} AND (SELECT count(*) FROM web_source_interests existing JOIN web_source_monitors m ON m.id=existing.monitor_id WHERE existing.scout_id=s.id AND existing.scout_version=s.version AND m.status<>'retired')<${this.maximumSources}
        ON CONFLICT(monitor_id,scout_id) DO UPDATE SET scout_version=excluded.scout_version`.execute(
      this.tx,
    );
  }
}
