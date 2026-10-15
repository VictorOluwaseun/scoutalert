import { sql, type Kysely } from "kysely";
import {
  planExploration,
  explorationChoices,
  type DiscoveryDecision,
  type DiscoveryExploration,
  type DiscoveryPlan,
  type SearchCapability,
} from "@repo/core/discovery";
import type { ScoutAlertDatabase } from "../../database/types/database.js";
import {
  canonicalDiscoveryUrl,
  discoveryKey,
  PUBLIC_DOCUMENT_VERSION,
} from "./discovery-identities.js";

/** Persists bounded planning snapshots and decisions within the coordinator's current-scout transaction. */
export class PostgresDiscoveryExplorationRepository {
  /** Uses the caller's transaction; no network calls or independently committed writes are made. */
  constructor(private readonly tx: Kysely<ScoutAlertDatabase>) {}

  /** Reads completed history in admission order, preserving parent URLs and source evidence for the core policy. */
  async snapshot(
    caseId: string,
    plan: DiscoveryPlan,
  ): Promise<DiscoveryExploration> {
    const operations = await sql<
      DiscoveryExploration["operations"][number]
    >`SELECT o.key,s.depth,o.input,o.result FROM web_discovery_steps s JOIN web_discovery_operations o ON o.key=s.operation_key WHERE s.case_id=${caseId}::uuid ORDER BY s.position`.execute(
      this.tx,
    );
    const rounds = await sql<{
      count: number;
    }>`SELECT count(*)::integer AS count FROM web_discovery_decisions WHERE case_id=${caseId}::uuid`.execute(
      this.tx,
    );
    const reviews =
      plan.policy === "public-intent-v3"
        ? await sql<
            NonNullable<DiscoveryExploration["reviews"]>[number]
          >`SELECT l.url,r.input->>'scope' AS scope,r.result AS review FROM web_discovery_case_leads cl JOIN web_discovery_leads l ON l.id=cl.lead_id JOIN web_lead_reviews r ON r.key=l.review_key AND r.state='ready' WHERE cl.case_id=${caseId}::uuid ORDER BY l.url LIMIT 40`.execute(
            this.tx,
          )
        : { rows: [] };
    return {
      plan,
      ...(plan.policy === "public-intent-v3" ? { reviews: reviews.rows } : {}),
      round: rounds.rows[0]!.count,
      operations: operations.rows.map((operation) => ({
        ...operation,
        result:
          operation.result?.kind === "search"
            ? {
                ...operation.result,
                observations: operation.result.observations.flatMap((item) => {
                  const url = canonicalDiscoveryUrl(item.url);
                  return url ? [{ ...item, url }] : [];
                }),
              }
            : operation.result,
      })),
    };
  }

  /** Revalidates the pure policy against durable history; replayed or forged decisions cannot expand the case. */
  async append(
    caseId: string,
    plan: DiscoveryPlan,
    capability: SearchCapability,
    epoch: number,
    expected: DiscoveryExploration,
    decision: DiscoveryDecision,
  ): Promise<void> {
    const pending =
      await sql`SELECT 1 FROM web_discovery_steps WHERE case_id=${caseId}::uuid AND NOT applied LIMIT 1`.execute(
        this.tx,
      );
    const actual = await this.snapshot(caseId, plan);
    if (
      pending.rows.length ||
      actual.round !== expected.round ||
      actual.operations.length !== expected.operations.length ||
      actual.round > (plan.exploration?.maximumRounds ?? -1) ||
      !(
        plan.policy === "public-intent-v3"
          ? explorationChoices(actual)
          : [planExploration(actual)]
      ).some((choice) => JSON.stringify(choice) === JSON.stringify(decision))
    ) {
      return;
    }
    await sql`INSERT INTO web_discovery_decisions(case_id,round,reason,action,parent_key,depth) VALUES(${caseId}::uuid,${actual.round},${decision.reason},${decision.action ? JSON.stringify(decision.action) : null}::jsonb,${decision.parentKey},${decision.depth})`.execute(
      this.tx,
    );
    if (!decision.action) {
      await this.finish(caseId);
      return;
    }
    const action = decision.action;
    const key =
      action.kind === "document"
        ? discoveryKey([PUBLIC_DOCUMENT_VERSION, action.url, epoch])
        : discoveryKey([
            capability.id,
            capability.configuration,
            capability.access,
            {
              kind: "search",
              query: {
                query: action.query.query,
                language: action.query.language,
                country: action.query.country,
                freshness: action.query.freshness,
                page: action.query.page,
                limit: action.query.limit,
              },
            },
            epoch,
          ]);
    if (action.kind === "document") {
      await this.associateLink(caseId, action.url, decision, actual);
    }
    await sql`INSERT INTO web_discovery_operations(key,provider,kind,input) VALUES(${key},${action.kind === "search" ? capability.id : "public-documents"},${action.kind},${JSON.stringify(action)}::jsonb) ON CONFLICT DO NOTHING`.execute(
      this.tx,
    );
    await sql`INSERT INTO web_discovery_steps(case_id,position,operation_key,depth) SELECT ${caseId}::uuid,coalesce(max(position),-1)+1,${key},${decision.depth} FROM web_discovery_steps WHERE case_id=${caseId}::uuid ON CONFLICT(case_id,operation_key) DO NOTHING`.execute(
      this.tx,
    );
  }

  /** Gives an observed linked page public identity and a private case association before capture; parent evidence stays in the decision ledger. */
  private async associateLink(
    caseId: string,
    url: string,
    decision: DiscoveryDecision,
    snapshot: DiscoveryExploration,
  ): Promise<void> {
    if (canonicalDiscoveryUrl(url) !== url) {
      throw new Error("discovery_link_not_canonical");
    }
    const parent = snapshot.operations.find(
      (operation) => operation.key === decision.parentKey,
    );
    const observedAt = parent?.result?.checkedAt;
    if (!observedAt) {
      throw new Error("discovery_link_missing_observation");
    }
    const id = discoveryKey(url);
    const hostname = new URL(url).hostname;
    await sql`INSERT INTO web_discovery_leads(id,url,source,title,first_seen_at,last_seen_at) VALUES(${id},${url},${hostname},${decision.title},${observedAt}::timestamptz,${observedAt}::timestamptz) ON CONFLICT(id) DO UPDATE SET last_seen_at=greatest(web_discovery_leads.last_seen_at,excluded.last_seen_at)`.execute(
      this.tx,
    );
    await sql`INSERT INTO web_discovery_case_leads(case_id,lead_id) VALUES(${caseId}::uuid,${id}) ON CONFLICT DO NOTHING`.execute(
      this.tx,
    );
    await sql`INSERT INTO web_source_candidates(hostname,example_url,first_seen_at,last_seen_at) VALUES(${hostname},${url},${observedAt}::timestamptz,${observedAt}::timestamptz) ON CONFLICT(hostname) DO UPDATE SET last_seen_at=greatest(web_source_candidates.last_seen_at,excluded.last_seen_at)`.execute(
      this.tx,
    );
  }

  /** Retains partial access/failure status while recording the adaptive stop separately from completeness. */
  private async finish(caseId: string): Promise<void> {
    const failures =
      await sql`SELECT 1 FROM web_discovery_steps s JOIN web_discovery_operations o ON o.key=s.operation_key WHERE s.case_id=${caseId}::uuid AND (o.state='failed' OR (o.kind='document' AND (o.result->>'status'<>'fetched' OR coalesce((o.result->>'truncated')::boolean,false)))) LIMIT 1`.execute(
        this.tx,
      );
    await sql`UPDATE web_discovery_cases SET status=${failures.rows.length ? "partial" : "completed"},reason=${failures.rows.length ? "some_sources_unavailable" : "bounded_search_window"},finished_at=now() WHERE id=${caseId}::uuid AND status='searching'`.execute(
      this.tx,
    );
  }
}
