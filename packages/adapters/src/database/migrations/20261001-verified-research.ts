import { sql, type Kysely } from "kysely";

/** Adds shared employer evidence and monetary attempt accounting without changing historic assessment receipts. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE intelligence_tasks DROP CONSTRAINT intelligence_tasks_kind_check;
    ALTER TABLE intelligence_tasks ADD CONSTRAINT intelligence_tasks_kind_check CHECK(kind IN ('extraction','research','fit'));
    ALTER TABLE intelligence_tasks DROP CONSTRAINT intelligence_tasks_check;
    ALTER TABLE intelligence_tasks ADD CONSTRAINT intelligence_tasks_check CHECK(
      (kind IN ('extraction','research') AND owner_id IS NULL AND scout_id IS NULL AND scout_version IS NULL)
      OR (kind='fit' AND owner_id IS NOT NULL AND scout_id IS NOT NULL AND scout_version IS NOT NULL));
    ALTER TABLE intelligence_tasks ADD COLUMN analysis_task_id text REFERENCES intelligence_tasks(id);
    CREATE INDEX intelligence_research_idx ON intelligence_tasks(posting_id,posting_version,configuration) WHERE kind='research' AND status='ready';
    CREATE TABLE employer_evidence_documents (
      url text PRIMARY KEY, source_id text NOT NULL,
      document jsonb, checked_at timestamptz, next_check_at timestamptz NOT NULL DEFAULT now(),
      lease_token uuid, lease_until timestamptz
    );
    ALTER TABLE intelligence_daily_budget ADD COLUMN reserved_microusd bigint NOT NULL DEFAULT 0 CHECK(reserved_microusd>=0);
    UPDATE intelligence_daily_budget SET reserved_microusd=requests::bigint*75000;
    ALTER TABLE intelligence_attempts ADD COLUMN cost jsonb;
    CREATE VIEW intelligence_usage_daily AS
      SELECT (a.started_at AT TIME ZONE 'UTC')::date AS day, t.kind,
        count(*) AS attempts, count(a.usage) AS measured_attempts,
        count(*) FILTER(WHERE a.outcome IS DISTINCT FROM 'ready') AS unsuccessful_attempts,
        sum((a.usage->>'inputTokens')::bigint) AS input_tokens,
        sum((a.usage->>'outputTokens')::bigint) AS output_tokens,
        sum((a.cost->>'estimatedMicrousd')::bigint) AS estimated_microusd,
        count(*) FILTER(WHERE a.cost IS NULL) AS unpriced_attempts,
        percentile_cont(0.5) WITHIN GROUP(ORDER BY (a.usage->>'durationMs')::double precision) AS p50_provider_ms,
        percentile_cont(0.95) WITHIN GROUP(ORDER BY (a.usage->>'durationMs')::double precision) AS p95_provider_ms
      FROM intelligence_attempts a JOIN intelligence_tasks t ON t.id=a.task_id
      GROUP BY day,t.kind;
  `.execute(db);
}
