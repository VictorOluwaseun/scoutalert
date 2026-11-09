import { sql, type Kysely } from "kysely";

/** Adds scheduling metadata without rewriting token counters, reservations, caps or completed evidence. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE intelligence_token_reservations ADD COLUMN work_class text NOT NULL DEFAULT 'maintenance' CHECK(work_class IN ('discovery','maintenance'));
    CREATE INDEX intelligence_token_window ON intelligence_token_reservations(model,created_at);
    ALTER TABLE intelligence_attempts DROP CONSTRAINT intelligence_attempts_outcome_check;
    ALTER TABLE intelligence_attempts ADD CONSTRAINT intelligence_attempts_outcome_check CHECK(outcome IN ('ready','provider_unavailable','invalid_evidence','superseded','budget_deferred'));
    ALTER TABLE web_lead_review_attempts DROP CONSTRAINT web_lead_review_attempts_state_check;
    ALTER TABLE web_lead_review_attempts ADD CONSTRAINT web_lead_review_attempts_state_check CHECK(state IN ('running','ready','failed','superseded','deferred'));
    ALTER TABLE web_reasoning_tasks ADD COLUMN retry_at timestamptz;
    ALTER TABLE web_reasoning_tasks ADD COLUMN admitted_at timestamptz;
  `.execute(db);
}
