import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  OpportunityFeedbackRepository,
  FeedbackError,
  type OpportunityFeedback,
} from "@repo/core/scouts";
import type { OpportunityView } from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../database/types/database.js";
import { commandFingerprint } from "./postgres-scout-management.js";

/** Records private feedback under the same recipient lock used to prepare emails. */
export class PostgresOpportunityFeedbackRepository extends OpportunityFeedbackRepository {
  /** Receives the native transaction-capable client from composition. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Fences stale tabs, makes retries idempotent and preserves the assessed evidence for future quality evaluation. */
  async record(
    ownerId: string,
    postingId: string,
    input: OpportunityFeedback & { key: string },
  ): Promise<OpportunityFeedback> {
    return this.db.transaction().execute(async (tx) => {
      await tx
        .selectFrom("users")
        .select("id")
        .where("id", "=", ownerId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const fingerprint = commandFingerprint({ postingId, input });
      const receipt = await tx
        .selectFrom("opportunity_feedback_events")
        .select(["fingerprint", "receipt"])
        .where("owner_id", "=", ownerId)
        .where("request_key", "=", input.key)
        .executeTakeFirst();

      if (receipt && receipt.fingerprint !== fingerprint) {
        throw new FeedbackError("request_conflict");
      }

      if (receipt) {
        return receipt.receipt;
      }

      const current = await tx
        .selectFrom("opportunity_feedback")
        .selectAll()
        .where("owner_id", "=", ownerId)
        .where("posting_id", "=", postingId)
        .executeTakeFirst();
      const recommendations = await sql<{
        snapshot: OpportunityView;
        context: unknown;
      }>`
        SELECT jsonb_build_object('id',p.id,'kind',p.kind,'title',p.title,'company',p.company,'location',p.location,'url',p.url,'checkedAt',p.checked_at,
          'scouts',(SELECT jsonb_agg(s2.name ORDER BY s2.id) FROM scout_recommendations r2 JOIN scouts s2 ON s2.id=r2.scout_id AND s2.owner_id=r2.owner_id AND s2.version=r2.scout_version WHERE r2.owner_id=${ownerId}::uuid AND r2.posting_id=p.id),
          'reasons',r.assessment->'reasons','uncertainties',r.assessment->'uncertainties','detail',r.assessment->'detail','assessmentScout',s.name) AS snapshot,
          jsonb_build_object('scoutId',s.id,'scoutVersion',s.version,'postingVersion',p.version,'assessment',r.assessment) AS context
        FROM scout_recommendations r JOIN scouts s ON s.id=r.scout_id AND s.owner_id=r.owner_id AND s.version=r.scout_version
        JOIN opportunity_postings p ON p.id=r.posting_id AND p.version=r.posting_version
        WHERE r.owner_id=${ownerId}::uuid AND p.id=${postingId} ORDER BY r.rank DESC,s.id LIMIT 1
      `.execute(tx);
      const snapshot = recommendations.rows[0]?.snapshot ?? current?.snapshot;

      if (!snapshot) {
        throw new FeedbackError("opportunity_not_found");
      }

      if ((current?.version ?? 0) !== input.version) {
        throw new FeedbackError("feedback_changed");
      }

      const feedback = { value: input.value, version: input.version + 1 };
      await tx
        .insertInto("opportunity_feedback")
        .values({
          owner_id: ownerId,
          posting_id: postingId,
          ...feedback,
          snapshot,
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc
            .columns(["owner_id", "posting_id"])
            .doUpdateSet({ ...feedback, snapshot, updated_at: new Date() }),
        )
        .execute();
      await tx
        .insertInto("opportunity_feedback_events")
        .values({
          owner_id: ownerId,
          request_key: input.key,
          posting_id: postingId,
          fingerprint,
          receipt: feedback,
          context: recommendations.rows[0]?.context ?? {
            previousFeedbackVersion: current?.version,
            snapshot,
          },
        })
        .execute();
      // Feedback affects candidate ordering and ranking, so request fresh runs without changing confirmed briefs.
      const scouts = await tx
        .selectFrom("scouts")
        .select(["id", "version"])
        .where("owner_id", "=", ownerId)
        .where("status", "=", "active")
        .orderBy("id")
        .limit(500)
        .execute();

      if (scouts.length) {
        await tx
          .insertInto("outbox_events")
          .values(
            scouts.map((scout) => ({
              id: randomUUID(),
              owner_id: ownerId,
              aggregate_id: scout.id,
              aggregate_version: scout.version,
              event_type: "scout.refresh_requested" as const,
              deduplication_key: `feedback:${ownerId}:${input.key}:${scout.id}`,
              payload: { scoutId: scout.id, ownerId, version: scout.version },
              created_at: new Date(),
              published_at: null,
            })),
          )
          .onConflict((conflict) =>
            conflict.column("deduplication_key").doNothing(),
          )
          .execute();
      }

      return feedback;
    });
  }
}
