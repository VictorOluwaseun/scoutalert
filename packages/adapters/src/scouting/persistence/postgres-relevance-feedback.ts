import { sql, type Kysely } from "kysely";
import {
  RelevanceFeedbackRepository,
  type RelevantExample,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Reads only the current owner's explicit positives; previous events and hidden items never train ranking. */
export class PostgresRelevanceFeedbackRepository extends RelevanceFeedbackRepository {
  /** Receives the native client at composition; query details remain in this repository. */
  constructor(private readonly db: Kysely<ScoutAlertDatabase>) {
    super();
  }

  /** Bounds history by age and count, preserving the title the person actually marked relevant. */
  async examples(ownerId: string): Promise<RelevantExample[]> {
    const result = await sql<RelevantExample>`
      SELECT f.snapshot->>'title' AS title,coalesce(f.snapshot->>'kind',p.kind,'job') AS kind
      FROM opportunity_feedback f JOIN opportunity_postings p ON p.id=f.posting_id
      WHERE f.owner_id=${ownerId}::uuid AND f.value='relevant' AND f.updated_at>now()-interval '90 days'
      ORDER BY f.updated_at DESC,f.posting_id LIMIT 100
    `.execute(this.db);
    return result.rows;
  }
}
