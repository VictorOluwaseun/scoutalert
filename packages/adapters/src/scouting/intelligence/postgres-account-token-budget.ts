import { sql, type Kysely } from "kysely";
import type {
  ModelTokenBudgetPolicy,
  ModelTokenBudgetSnapshot,
  ModelTokenScope,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Resolves trusted ownership and accounts for all revisions and funding sources in the token ledger. */
export class PostgresAccountTokenBudgetRepository {
  /** Returns persisted ownership only for a current active scout; callers cannot supply an account ID. */
  async owner(
    db: Kysely<ScoutAlertDatabase>,
    scope?: ModelTokenScope,
  ): Promise<string | null> {
    if (!scope) {
      return null;
    }
    const result = await sql<{
      owner_id: string;
    }>`SELECT owner_id FROM scouts WHERE id=${scope.scoutId}::uuid AND version=${scope.version} AND status='active'`.execute(
      db,
    );
    if (!result.rows[0]) {
      throw new Error("inactive_token_scout");
    }
    return result.rows[0].owner_id;
  }

  /** Unknown outcomes and old scout revisions keep consuming the owner's allowance; unattributed work has one bounded shared lane. */
  async snapshot(
    db: Kysely<ScoutAlertDatabase>,
    policy: ModelTokenBudgetPolicy,
    owner: string | null,
  ): Promise<ModelTokenBudgetSnapshot["account"]> {
    const limit = owner ? policy.accountDailyLimit : policy.sharedDailyLimit;
    if (limit === undefined) {
      return undefined;
    }
    const result = await sql<{
      committed: string;
    }>`SELECT coalesce(sum(CASE WHEN state='completed' THEN input_tokens+output_tokens ELSE reserved_tokens END),0)::text AS committed
      FROM intelligence_token_reservations WHERE day=(now() AT TIME ZONE 'UTC')::date AND model IN (${sql.join(policy.models)}) AND owner_id IS NOT DISTINCT FROM ${owner}::uuid`.execute(
      db,
    );
    const committedTokens = Number(result.rows[0]!.committed);
    return {
      dailyLimit: limit,
      committedTokens,
      remainingTokens: Math.max(0, limit - committedTokens),
    };
  }
}
