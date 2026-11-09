import { sql, type Kysely } from "kysely";
import {
  paidBudgetPeriod,
  paidTokenCost,
  type ModelPaidBudgetPolicy,
  type ModelPaidBudgetSnapshot,
  type ModelTokenUsage,
} from "@repo/core/scouting";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

type Db = Kysely<ScoutAlertDatabase>;

/** Owns the separate paid ledger under the calling token repository's family lock. */
export class PostgresPaidBudgetRepository {
  /** Creates durable pacing once; configuration changes cannot move the billing anchor or erase consumption. */
  async initialize(
    db: Db,
    family: string,
    policy: ModelPaidBudgetPolicy,
  ): Promise<void> {
    await sql`INSERT INTO intelligence_paid_budgets(family,period_anchor,period_days,credit)
      VALUES(${family},${policy.periodAnchor}::date,${policy.periodDays},${policy.burstMicrousd}) ON CONFLICT DO NOTHING`.execute(
      db,
    );
    await this.state(db, family, policy);
  }

  /** Projects bounded money credit without changing the daily or 30-day ledger. */
  async snapshot(
    db: Db,
    family: string,
    policy: ModelPaidBudgetPolicy,
  ): Promise<ModelPaidBudgetSnapshot> {
    const state = await this.state(db, family, policy);
    const period = paidBudgetPeriod(policy, state.now);
    const result = await sql<{
      period: string;
      day: string;
      used_tokens: string;
      reserved_tokens: string;
      unknown: number;
    }>`SELECT
      coalesce(sum(coalesce(actual_microusd,reserved_microusd)),0)::text AS period,
      coalesce(sum(coalesce(actual_microusd,reserved_microusd)) FILTER(WHERE p.day=(now() AT TIME ZONE 'UTC')::date),0)::text AS day,
      coalesce(sum(r.input_tokens+r.output_tokens) FILTER(WHERE r.state='completed' AND p.day=(now() AT TIME ZONE 'UTC')::date),0)::text AS used_tokens,
      coalesce(sum(r.reserved_tokens) FILTER(WHERE r.state<>'completed' AND p.day=(now() AT TIME ZONE 'UTC')::date),0)::text AS reserved_tokens,
      count(*) FILTER(WHERE r.state='unknown' AND p.day=(now() AT TIME ZONE 'UTC')::date)::integer AS unknown
      FROM intelligence_paid_reservations p JOIN intelligence_token_reservations r ON r.id=p.id WHERE p.family=${family} AND p.period_start=${period.start}::date`.execute(
      db,
    );
    const committed = result.rows[0]!;
    const periodRemaining = policy.periodMicrousd - Number(committed.period);
    const dayRemaining = period.dailyMicrousd - Number(committed.day);
    const available = period.started
      ? Math.max(
          0,
          Math.floor(Math.min(state.credit, dayRemaining, periodRemaining)),
        )
      : 0;
    const nextDay =
      new Date(`${state.now.toISOString().slice(0, 10)}T00:00:00Z`).getTime() +
      86_400_000;
    const retryAt = !period.started
      ? `${policy.periodAnchor}T00:00:00.000Z`
      : periodRemaining <= 0
        ? period.endsAt
        : dayRemaining <= 0
          ? new Date(nextDay).toISOString()
          : new Date(state.now.getTime() + 60_000).toISOString();
    return {
      periodStart: period.start,
      periodEndsAt: period.endsAt,
      periodLimitMicrousd: policy.periodMicrousd,
      periodCommittedMicrousd: Number(committed.period),
      dailyLimitMicrousd: period.dailyMicrousd,
      dailyCommittedMicrousd: Number(committed.day),
      availableMicrousd: available,
      burstMicrousd: policy.burstMicrousd,
      retryAt,
      usedTokens: Number(committed.used_tokens),
      reservedTokens: Number(committed.reserved_tokens),
      unknownReservations: committed.unknown,
      inputRate: policy.inputRate,
      cachedRate: policy.cachedRate,
      outputRate: policy.outputRate,
    };
  }

  /** Stores an already-admitted worst-case charge atomically with its token reservation. */
  async reserve(
    db: Db,
    id: string,
    family: string,
    policy: ModelPaidBudgetPolicy,
    cost: number,
  ): Promise<void> {
    const state = await this.state(db, family, policy);
    const period = paidBudgetPeriod(policy, state.now);
    await sql`INSERT INTO intelligence_paid_reservations(id,family,period_start,day,reserved_microusd,input_rate,cached_rate,output_rate)
      VALUES(${id}::uuid,${family},${period.start}::date,(now() AT TIME ZONE 'UTC')::date,${cost},${policy.inputRate},${policy.cachedRate},${policy.outputRate})`.execute(
      db,
    );
    await sql`UPDATE intelligence_paid_budgets SET credit=${state.credit - cost},updated_at=clock_timestamp() WHERE family=${family}`.execute(
      db,
    );
  }

  /** Reconciles once using rates captured at admission. Unknown usage keeps the full charge indefinitely. */
  async settle(
    db: Db,
    id: string,
    usage: ModelTokenUsage,
    policy?: ModelPaidBudgetPolicy,
  ): Promise<void> {
    const result = await sql<{
      family: string;
      reserved: string;
      inputRate: string;
      cachedRate: string;
      outputRate: string;
    }>`SELECT family,reserved_microusd::text AS reserved,input_rate::text AS "inputRate",cached_rate::text AS "cachedRate",output_rate::text AS "outputRate"
      FROM intelligence_paid_reservations WHERE id=${id}::uuid AND actual_microusd IS NULL FOR UPDATE`.execute(
      db,
    );
    const row = result.rows[0];
    if (!row) {
      return;
    }
    const cost = paidTokenCost(
      {
        inputRate: Number(row.inputRate),
        cachedRate: Number(row.cachedRate),
        outputRate: Number(row.outputRate),
      },
      usage.inputTokens,
      usage.outputTokens,
      usage.cachedInputTokens,
    );
    await sql`UPDATE intelligence_paid_reservations SET actual_microusd=${cost} WHERE id=${id}::uuid`.execute(
      db,
    );
    if (!policy) {
      return;
    }
    const state = await this.state(db, row.family, policy);
    await sql`UPDATE intelligence_paid_budgets SET credit=${Math.min(policy.burstMicrousd, state.credit + Number(row.reserved) - cost)},updated_at=clock_timestamp() WHERE family=${row.family}`.execute(
      db,
    );
  }

  /** Uses database time and a persisted anchor; reset, reconfiguration and restart cannot silently start a fresh billing cycle. */
  private async state(db: Db, family: string, policy: ModelPaidBudgetPolicy) {
    const result = await sql<{
      now: Date;
      anchor: string | null;
      days: number | null;
      credit: string | null;
      elapsed: number;
    }>`SELECT now() AS now,b.period_anchor::text AS anchor,b.period_days AS days,b.credit::text,
      coalesce(extract(epoch FROM clock_timestamp()-b.updated_at)::double precision,0) AS elapsed
      FROM (SELECT 1) seed LEFT JOIN intelligence_paid_budgets b ON b.family=${family}`.execute(
      db,
    );
    const row = result.rows[0]!;
    if (
      row.anchor &&
      (row.anchor !== policy.periodAnchor || row.days !== policy.periodDays)
    ) {
      throw new Error("paid_budget_anchor_changed");
    }
    return {
      now: row.now,
      credit: Math.min(
        policy.burstMicrousd,
        Number(row.credit ?? policy.burstMicrousd) +
          (Math.max(0, row.elapsed) * policy.periodMicrousd) /
            policy.periodDays /
            86400,
      ),
    };
  }
}
