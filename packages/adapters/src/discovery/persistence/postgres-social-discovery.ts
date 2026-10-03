import { sql, type Kysely } from "kysely";
import {
  SocialDiscoveryRepository,
  type SocialIntent,
  type SocialLimits,
  type SocialClaim,
  type SocialResult,
  type SocialProviderError,
} from "@repo/core/discovery";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import { discoveryKey } from "./discovery-identities.js";
import { lockWebSources } from "./web-source-locks.js";
import { PostgresSocialAdmissionRepository } from "./postgres-social-admission.js";
import { PostgresSocialReceiptRepository } from "./postgres-social-receipts.js";
import { PostgresSocialDispatchRepository } from "./postgres-social-dispatch.js";
import { PostgresSocialRetentionRepository } from "./postgres-social-retention.js";
import { PostgresSocialContextRepository } from "./postgres-social-context.js";

/** Native query coordinator shares public work while retaining owner/revision fences around every subscription and publication. */
export class PostgresSocialDiscoveryRepository extends SocialDiscoveryRepository {
  /** Uses the composition root's pool; transactions never span an external API call. */
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly reviewLimits: Pick<
      SocialLimits,
      "dailyRequests" | "dailyMicros"
    > | null = null,
  ) {
    super();
  }

  /** Prioritizes never-planned and changed scouts; successful and unsupported planning both leave a durable marker. */
  async intents(policy: string): Promise<SocialIntent[]> {
    const rows =
      await sql<SocialIntent>`SELECT s.id AS "scoutId",s.owner_id AS "ownerId",s.version,s.search FROM scouts s
      LEFT JOIN x_scout_plans p ON p.scout_id=s.id
      WHERE s.status='active' AND (p.scout_id IS NULL OR p.scout_version<>s.version OR p.policy<>${policy})
      ORDER BY s.activated_at,s.id LIMIT 100`.execute(this.db);
    return rows.rows;
  }

  /** Freezes public-only query membership after rechecking the exact brief; edits remove obsolete interests atomically. */
  async subscribe(
    intent: SocialIntent,
    policy: string,
    query: string | null,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      const current =
        await sql`SELECT id FROM scouts WHERE id=${intent.scoutId}::uuid AND owner_id=${intent.ownerId}::uuid AND version=${intent.version} AND status='active' AND search=${JSON.stringify(intent.search)}::jsonb FOR UPDATE`.execute(
          tx,
        );
      if (!current.rows.length) {
        return;
      }
      await sql`DELETE FROM x_search_interests WHERE scout_id=${intent.scoutId}::uuid`.execute(
        tx,
      );
      await sql`INSERT INTO x_scout_plans(scout_id,owner_id,scout_version,policy,reason) VALUES(${intent.scoutId}::uuid,${intent.ownerId}::uuid,${intent.version},${policy},${query ? null : "public_intent_required"}) ON CONFLICT(scout_id) DO UPDATE SET scout_version=excluded.scout_version,policy=excluded.policy,reason=excluded.reason`.execute(
        tx,
      );
      if (!query) {
        return;
      }
      const key = discoveryKey([policy, query]);
      await sql`INSERT INTO x_search_queries(id,query,policy) VALUES(${key},${query},${policy}) ON CONFLICT DO NOTHING`.execute(
        tx,
      );
      await sql`INSERT INTO x_search_interests(query_id,scout_id,owner_id,scout_version) VALUES(${key},${intent.scoutId}::uuid,${intent.ownerId}::uuid,${intent.version})`.execute(
        tx,
      );
      // New subscribers can reuse recent public captures without another paid search.
      await sql`INSERT INTO x_source_updates(lead_id,scout_id,owner_id,scout_version,observed_at)
        SELECT p.lead_id,${intent.scoutId}::uuid,${intent.ownerId}::uuid,${intent.version},l.checked_at
        FROM x_query_posts p JOIN x_posts x ON x.lead_id=p.lead_id JOIN web_discovery_leads l ON l.id=p.lead_id
        WHERE p.query_id=${key} AND NOT x.unavailable AND l.checked_at>now()-interval '15 minutes'
        ON CONFLICT DO NOTHING`.execute(tx);
    });
  }

  /** Serializes admission through the existing source lock and a separate native provider ledger. */
  async claim(limits: SocialLimits): Promise<SocialClaim> {
    return this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      return new PostgresSocialAdmissionRepository(tx).claim(limits);
    });
  }

  /** Commits only the exact unexpired lease; repeats cannot advance a cursor or dispatch twice. */
  async complete(
    claim: Extract<SocialClaim, { status: "claimed" }>,
    result: SocialResult,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      await new PostgresSocialReceiptRepository(tx).complete(claim, result);
    });
  }

  /** Keeps unknown and failed attempts charged, with native quota/access recovery isolated from other providers. */
  async fail(
    claim: Extract<SocialClaim, { status: "claimed" }>,
    error: SocialProviderError,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      await new PostgresSocialReceiptRepository(tx).fail(claim, error);
    });
  }

  /** Removes expired content, resumes admitted review work and coalesces current interests; source timestamps never advance without a provider receipt. */
  async maintain(): Promise<number> {
    return this.db.transaction().execute(async (tx) => {
      await lockWebSources(tx);
      await new PostgresSocialRetentionRepository(tx).expire();
      await new PostgresSocialContextRepository(tx).prepare();
      const dispatch = new PostgresSocialDispatchRepository(tx);
      await dispatch.resumeReviews(this.reviewLimits);
      return dispatch.dispatch();
    });
  }
}
