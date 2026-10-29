import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  ModelTokenBudgetRepository,
  type ModelTokenBudgetSnapshot,
  type ModelTokenBudgetPolicy,
  type ModelTokenBudgetPurpose,
  type ModelTokenUsage,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Serializes token admission in PostgreSQL; neither process restarts nor expired task leases release uncertain spending. */
export class PostgresModelTokenBudgetRepository extends ModelTokenBudgetRepository {
  /** Binds deployment and optional independent family limits; existing reservation history remains authoritative across configuration changes. */
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly dailyLimit: number,
    private readonly policies: readonly ModelTokenBudgetPolicy[] = [],
  ) {
    super();
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 0) {
      throw new Error("invalid_daily_token_limit");
    }
    const aliases = policies.flatMap((policy) => [...policy.models]);
    if (
      policies.some(
        (policy) =>
          !policy.family ||
          !policy.models.length ||
          !Number.isSafeInteger(policy.dailyLimit) ||
          policy.dailyLimit < 0 ||
          !Number.isSafeInteger(policy.auditTokens ?? 0) ||
          (policy.auditTokens ?? 0) < 0 ||
          (policy.auditTokens ?? 0) > policy.dailyLimit,
      ) ||
      new Set(policies.map((policy) => policy.family)).size !==
        policies.length ||
      new Set(aliases).size !== aliases.length
    ) {
      throw new Error("invalid_model_token_policy");
    }
  }

  /** Reserves under one atomic counter update; simultaneous workers cannot reuse the same remaining capacity. */
  async reserve(
    model: string,
    inputTokens: number,
    maximumOutputTokens: number,
    purpose: ModelTokenBudgetPurpose = "standard",
  ): Promise<string | null> {
    const tokens = inputTokens + maximumOutputTokens;
    if (
      !Number.isSafeInteger(inputTokens) ||
      inputTokens < 0 ||
      !Number.isSafeInteger(maximumOutputTokens) ||
      maximumOutputTokens < 1 ||
      !Number.isSafeInteger(tokens) ||
      !["standard", "audit"].includes(purpose)
    ) {
      throw new Error("invalid_token_reservation");
    }
    const policy = this.policyFor(model);
    return this.db.transaction().execute(async (tx) => {
      await sql`INSERT INTO intelligence_token_days(day) VALUES((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`.execute(
        tx,
      );
      // Lock before reading family aggregates: all model admissions serialize on the same UTC day.
      // A denied family never increments the global counter; settlement retains its existing usage accounting.
      const locked = await sql<{
        day: string;
      }>`SELECT day::text FROM intelligence_token_days
        WHERE day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE`.execute(tx);
      const modelBudget = policy
        ? await this.modelSnapshot(
            tx,
            policy,
            locked.rows[0]!.day,
            this.dailyLimit,
            purpose,
          )
        : null;
      if (modelBudget && modelBudget.remainingTokens < tokens) {
        return null;
      }
      const admitted = await sql<{ day: string }>`
        UPDATE intelligence_token_days SET reserved_tokens=reserved_tokens+${tokens}
        WHERE day=(now() AT TIME ZONE 'UTC')::date
          AND input_tokens+output_tokens+reserved_tokens+${tokens}<=${this.dailyLimit}
        RETURNING day::text
      `.execute(tx);
      if (!admitted.rows[0]) {
        return null;
      }
      const id = randomUUID();
      await sql`INSERT INTO intelligence_token_reservations(id,day,model,reserved_tokens,purpose)
        VALUES(${id}::uuid,${admitted.rows[0].day}::date,${model},${tokens},${purpose})`.execute(
        tx,
      );
      return id;
    });
  }

  /** Settles exactly once even on duplicate completion; actual usage is recorded before downstream evidence/schema acceptance. */
  async settle(id: string, usage: ModelTokenUsage | null): Promise<void> {
    if (
      usage &&
      (!Object.values(usage).every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ) ||
        usage.cachedInputTokens > usage.inputTokens ||
        !Number.isSafeInteger(usage.inputTokens + usage.outputTokens))
    ) {
      throw new Error("invalid_reported_token_usage");
    }
    await this.db.transaction().execute(async (tx) => {
      const reserved = await sql<{ day: string; reserved_tokens: string }>`
        UPDATE intelligence_token_reservations
        SET state=${usage ? "completed" : "unknown"},finished_at=now(),
          input_tokens=${usage?.inputTokens ?? null},output_tokens=${usage?.outputTokens ?? null},cached_input_tokens=${usage?.cachedInputTokens ?? null}
        WHERE id=${id}::uuid AND state='reserved'
        RETURNING day::text,reserved_tokens::text
      `.execute(tx);
      const row = reserved.rows[0];
      if (!row || !usage) {
        return;
      }
      await sql`UPDATE intelligence_token_days SET
        reserved_tokens=reserved_tokens-${row.reserved_tokens}::bigint,
        input_tokens=input_tokens+${usage.inputTokens},output_tokens=output_tokens+${usage.outputTokens},
        cached_input_tokens=cached_input_tokens+${usage.cachedInputTokens}
        WHERE day=${row.day}::date`.execute(tx);
    });
  }

  /** Reads the UTC day and existing model history; aliases cannot reset usage and cached input is counted once. */
  async snapshot(
    model?: string,
    purpose: ModelTokenBudgetPurpose = "standard",
  ): Promise<ModelTokenBudgetSnapshot> {
    const policy = model === undefined ? undefined : this.policyFor(model);
    const result = await sql<{
      day: string;
      input_tokens: string;
      output_tokens: string;
      cached_input_tokens: string;
      reserved_tokens: string;
      unknown_reservations: number;
    }>`
      SELECT current_day.day::text,
        COALESCE(b.input_tokens,0)::text AS input_tokens,COALESCE(b.output_tokens,0)::text AS output_tokens,
        COALESCE(b.cached_input_tokens,0)::text AS cached_input_tokens,COALESCE(b.reserved_tokens,0)::text AS reserved_tokens,
        (SELECT count(*)::integer FROM intelligence_token_reservations r WHERE r.day=current_day.day AND r.state='unknown') AS unknown_reservations
      FROM (SELECT (now() AT TIME ZONE 'UTC')::date AS day) current_day
      LEFT JOIN intelligence_token_days b ON b.day=current_day.day
    `.execute(this.db);
    const row = result.rows[0]!;
    const inputTokens = Number(row.input_tokens);
    const outputTokens = Number(row.output_tokens);
    const reservedTokens = Number(row.reserved_tokens);
    const total: ModelTokenBudgetSnapshot = {
      day: row.day,
      inputTokens,
      outputTokens,
      cachedInputTokens: Number(row.cached_input_tokens),
      reservedTokens,
      usedTokens: inputTokens + outputTokens,
      dailyLimit: this.dailyLimit,
      remainingTokens: Math.max(
        0,
        this.dailyLimit - inputTokens - outputTokens - reservedTokens,
      ),
      unknownReservations: row.unknown_reservations,
    };
    if (policy) {
      return this.modelSnapshot(
        this.db,
        policy,
        row.day,
        total.remainingTokens,
        purpose,
      );
    }
    if (!this.policies.length) {
      return total;
    }
    return {
      ...total,
      models: await Promise.all(
        this.policies.map((item) =>
          this.modelSnapshot(this.db, item, row.day, total.remainingTokens),
        ),
      ),
    };
  }

  /** Rejects unreviewed models before counting or generation when independent family allowances are enabled. */
  private policyFor(model: string): ModelTokenBudgetPolicy | undefined {
    const policy = this.policies.find((item) => item.models.includes(model));
    if (this.policies.length && !policy) {
      throw new Error("unconfigured_model_token_budget");
    }
    return policy;
  }

  /** Aggregates the existing indexed admission-day ledger, including unknown and unfinished calls, without a reset or a second counter to reconcile. */
  private async modelSnapshot(
    db: Kysely<ScoutAlertDatabase>,
    policy: ModelTokenBudgetPolicy,
    day: string,
    globalRemaining: number,
    purpose?: ModelTokenBudgetPurpose,
  ): Promise<ModelTokenBudgetSnapshot & { model: string }> {
    const result = await sql<{
      input_tokens: string;
      output_tokens: string;
      cached_input_tokens: string;
      reserved_tokens: string;
      unknown_reservations: number;
      purpose: ModelTokenBudgetPurpose;
    }>`SELECT
      COALESCE(sum(input_tokens) FILTER (WHERE state='completed'),0)::text AS input_tokens,
      COALESCE(sum(output_tokens) FILTER (WHERE state='completed'),0)::text AS output_tokens,
      COALESCE(sum(cached_input_tokens) FILTER (WHERE state='completed'),0)::text AS cached_input_tokens,
      COALESCE(sum(reserved_tokens) FILTER (WHERE state<>'completed'),0)::text AS reserved_tokens,
      count(*) FILTER (WHERE state='unknown')::integer AS unknown_reservations, purpose
      FROM intelligence_token_reservations WHERE day=${day}::date AND model IN (${sql.join(policy.models)}) GROUP BY purpose`.execute(
      db,
    );
    const inputTokens = result.rows.reduce(
      (sum, row) => sum + Number(row.input_tokens),
      0,
    );
    const outputTokens = result.rows.reduce(
      (sum, row) => sum + Number(row.output_tokens),
      0,
    );
    const reservedTokens = result.rows.reduce(
      (sum, row) => sum + Number(row.reserved_tokens),
      0,
    );
    const usedTokens = inputTokens + outputTokens;
    const familyRemaining = Math.max(
      0,
      Math.min(
        globalRemaining,
        policy.dailyLimit - usedTokens - reservedTokens,
      ),
    );
    const allocations = (["standard", "audit"] as const).map((group) => {
      const row = result.rows.find((item) => item.purpose === group);
      const dailyLimit =
        group === "audit"
          ? (policy.auditTokens ?? 0)
          : policy.dailyLimit - (policy.auditTokens ?? 0);
      const usedTokens =
        Number(row?.input_tokens ?? 0) + Number(row?.output_tokens ?? 0);
      const reservedTokens = Number(row?.reserved_tokens ?? 0);
      return {
        purpose: group,
        dailyLimit,
        usedTokens,
        reservedTokens,
        remainingTokens: Math.max(
          0,
          Math.min(familyRemaining, dailyLimit - usedTokens - reservedTokens),
        ),
      };
    });
    return {
      day,
      model: policy.family,
      dailyLimit: policy.dailyLimit,
      inputTokens,
      outputTokens,
      cachedInputTokens: result.rows.reduce(
        (sum, row) => sum + Number(row.cached_input_tokens),
        0,
      ),
      usedTokens,
      reservedTokens,
      remainingTokens: purpose
        ? allocations.find((item) => item.purpose === purpose)!.remainingTokens
        : familyRemaining,
      unknownReservations: result.rows.reduce(
        (sum, row) => sum + row.unknown_reservations,
        0,
      ),
      allocations,
    };
  }
}
