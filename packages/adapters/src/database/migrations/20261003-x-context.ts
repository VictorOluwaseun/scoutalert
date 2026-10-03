import { sql, type Kysely } from "kysely";

/** Persists deduplicated context admission and dependency invalidation without changing historical native cursors. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE x_posts ADD COLUMN context_due_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE x_query_posts ADD COLUMN is_context boolean NOT NULL DEFAULT false;
    CREATE INDEX x_context_due_idx ON x_posts(context_due_at) WHERE NOT unavailable;
    CREATE TABLE x_context_requests (
      post_id text PRIMARY KEY, next_check_at timestamptz NOT NULL DEFAULT now(),
      state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','available','unavailable')),
      attempts integer NOT NULL DEFAULT 0
    );
    CREATE INDEX x_context_request_due_idx ON x_context_requests(next_check_at,post_id);
    CREATE TABLE x_context_dependencies (
      lead_id text NOT NULL REFERENCES x_posts(lead_id) ON DELETE CASCADE,
      post_id text NOT NULL REFERENCES x_context_requests(post_id),
      PRIMARY KEY(lead_id,post_id)
    );
    CREATE INDEX x_context_dependents_idx ON x_context_dependencies(post_id,lead_id);
    CREATE INDEX x_review_context_idx ON web_lead_reviews USING gin ((input->'nativeContext'->'dependencies'));
  `.execute(db);
}
