import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  ModelTokenBudgetRepository,
  type ModelTokenBudgetSnapshot,
  type ModelTokenUsage,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Serializes token admission in PostgreSQL; neither process restarts nor expired task leases release uncertain spending. */
export class PostgresModelTokenBudgetRepository extends ModelTokenBudgetRepository {
  /** Binds the deployment database and operator limit; changing the limit never resets prior reservations. */
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly dailyLimit: number,
  ) {
    super();
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 0) {
      throw new Error("invalid_daily_token_limit");
    }
  }

  /** Reserves under one atomic counter update; simultaneous workers cannot reuse the same remaining capacity. */
  async reserve(
    model: string,
    inputTokens: number,
    maximumOutputTokens: number,
  ): Promise<string | null> {
    const tokens = inputTokens + maximumOutputTokens;
    if (
      !Number.isSafeInteger(inputTokens) ||
      inputTokens < 0 ||
      !Number.isSafeInteger(maximumOutputTokens) ||
      maximumOutputTokens < 1 ||
      !Number.isSafeInteger(tokens)
    ) {
      throw new Error("invalid_token_reservation");
    }
    return this.db.transaction().execute(async (tx) => {
      await sql`INSERT INTO intelligence_token_days(day) VALUES((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`.execute(
        tx,
      );
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
      await sql`INSERT INTO intelligence_token_reservations(id,day,model,reserved_tokens)
        VALUES(${id}::uuid,${admitted.rows[0].day}::date,${model},${tokens})`.execute(
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

  /** Reads the UTC day using the database clock; cached input is counted once, without a pricing discount. */
  async snapshot(): Promise<ModelTokenBudgetSnapshot> {
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
    return {
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
  }
}
