import { PostgresPaidBudgetRepository } from "./postgres-paid-budget.js";
import { PostgresAccountTokenBudgetRepository } from "./postgres-account-token-budget.js";
import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  ModelTokenBudgetRepository,
  paidTokenCost,
  type ModelTokenBudgetSnapshot,
  type ModelTokenBudgetPolicy,
  type ModelTokenBudgetPurpose,
  type ModelTokenUsage,
  type ModelTokenWork,
  type ModelTokenScope,
} from "@repo/core/scouting";
import { PostgresTokenPacingRepository } from "./postgres-token-pacing.js";
import type { ScoutAlertDatabase } from "../../database/types/database.js";

/** Serializes token admission in PostgreSQL; neither process restarts nor expired task leases release uncertain spending. */
export class PostgresModelTokenBudgetRepository extends ModelTokenBudgetRepository {
  private readonly pacing: PostgresTokenPacingRepository;
  private readonly paid = new PostgresPaidBudgetRepository();
  private readonly accounts = new PostgresAccountTokenBudgetRepository();
  /** Binds deployment and optional independent family limits; existing reservation history remains authoritative across configuration changes. */
  constructor(
    private readonly db: Kysely<ScoutAlertDatabase>,
    private readonly dailyLimit: number,
    private readonly policies: readonly ModelTokenBudgetPolicy[] = [],
  ) {
    super();
    this.pacing = new PostgresTokenPacingRepository(dailyLimit);
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 0) {
      throw new Error("invalid_daily_token_limit");
    }
    for (const policy of policies) {
      this.validateAdditions(policy);
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
          (policy.auditTokens ?? 0) > policy.dailyLimit ||
          (policy.pacing !== undefined &&
            (!Number.isInteger(policy.pacing.windowMinutes) ||
              policy.pacing.windowMinutes < 1 ||
              policy.pacing.windowMinutes > 1440 ||
              !Number.isInteger(policy.pacing.maintenancePercent) ||
              policy.pacing.maintenancePercent < 1 ||
              policy.pacing.maintenancePercent > 100 ||
              !Number.isInteger(policy.pacing.carryoverMinutes ?? 0) ||
              (policy.pacing.carryoverMinutes ?? 0) < 0 ||
              (policy.pacing.carryoverMinutes ?? 0) > 1440 ||
              !Number.isSafeInteger(policy.pacing.minimumBurstTokens ?? 0) ||
              (policy.pacing.minimumBurstTokens ?? 0) < 0 ||
              !Number.isInteger(policy.pacing.demandMinutes ?? 5) ||
              (policy.pacing.demandMinutes ?? 5) < 1 ||
              (policy.pacing.demandMinutes ?? 5) > 30)),
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
    work: ModelTokenWork = "maintenance",
    scope?: ModelTokenScope,
  ): Promise<string | null> {
    const tokens = inputTokens + maximumOutputTokens;
    if (
      !Number.isSafeInteger(inputTokens) ||
      inputTokens < 0 ||
      !Number.isSafeInteger(maximumOutputTokens) ||
      maximumOutputTokens < 1 ||
      !Number.isSafeInteger(tokens) ||
      !["standard", "audit"].includes(purpose) ||
      !["discovery", "maintenance"].includes(work)
    ) {
      throw new Error("invalid_token_reservation");
    }
    const policy = this.policyFor(model);
    return this.db.transaction().execute(async (tx) => {
      const owner = await this.accounts.owner(tx, scope);
      if (policy) {
        await this.pacing.lock(tx, policy);
      }
      if (policy?.paid) {
        await this.paid.initialize(tx, policy.family, policy.paid);
      }
      if (policy?.pacing) {
        await this.pacing.prepare(tx, policy, purpose, tokens, work, scope);
      }
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
            policy.accountDailyLimit !== undefined
              ? (owner ?? "shared")
              : (scope?.scoutId ?? "shared"),
            owner,
          )
        : null;
      const paced =
        work === "discovery"
          ? modelBudget?.pacing?.availableTokens
          : modelBudget?.pacing?.maintenanceAvailableTokens;
      if (
        modelBudget?.account &&
        modelBudget.account.remainingTokens < tokens
      ) {
        return null;
      }
      const baseAvailable =
        !modelBudget ||
        (modelBudget.remainingTokens >= tokens &&
          (paced === undefined || paced >= tokens));
      const admitted = baseAvailable
        ? await sql<{ day: string }>`
        UPDATE intelligence_token_days SET reserved_tokens=reserved_tokens+${tokens}
        WHERE day=(now() AT TIME ZONE 'UTC')::date
          AND input_tokens+output_tokens+reserved_tokens+${tokens}<=${this.dailyLimit}
        RETURNING day::text
      `.execute(tx)
        : null;
      const base = Boolean(admitted?.rows[0]);
      const cost = policy?.paid
        ? paidTokenCost(policy.paid, inputTokens, maximumOutputTokens)
        : Infinity;
      const paidAvailable =
        this.dailyLimit > 0 &&
        (policy?.dailyLimit ?? 0) > 0 &&
        purpose === "standard" &&
        cost <= (modelBudget?.paid?.availableMicrousd ?? 0) &&
        modelBudget?.pacing?.fairTurn !== false &&
        (work === "discovery" ||
          !modelBudget?.pacing ||
          modelBudget.pacing.maintenanceBorrowing);
      if (!base && !paidAvailable) {
        return null;
      }
      const id = randomUUID();
      await sql`INSERT INTO intelligence_token_reservations(id,day,model,reserved_tokens,purpose,work_class,scout_id,owner_id,funding,pacing_debited)
        VALUES(${id}::uuid,${locked.rows[0]!.day}::date,${model},${tokens},${purpose},${work},${scope?.scoutId ?? null}::uuid,${owner}::uuid,${base ? "base" : "paid"},${base && Boolean(policy?.pacing)})`.execute(
        tx,
      );
      if (!base && policy?.paid) {
        await this.paid.reserve(tx, id, policy.family, policy.paid, cost);
      }
      if (base && policy?.pacing) {
        await this.pacing.spend(tx, policy, purpose, tokens, scope);
      }
      if (!base && policy?.pacing) {
        await this.pacing.clearDemand(tx, policy, purpose, scope);
      }
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
      const original = await sql<{
        model: string;
      }>`SELECT model FROM intelligence_token_reservations WHERE id=${id}::uuid`.execute(
        tx,
      );
      const policy = original.rows[0]
        ? this.policyFor(original.rows[0].model)
        : undefined;
      if (policy) {
        await this.pacing.lock(tx, policy);
      }
      if (policy?.pacing) {
        await this.pacing.initialize(tx, policy);
      }
      const reserved = await sql<{
        day: string;
        reserved_tokens: string;
        purpose: ModelTokenBudgetPurpose;
        pacing_debited: boolean;
        funding: "base" | "paid";
      }>`
        UPDATE intelligence_token_reservations
        SET state=${usage ? "completed" : "unknown"},finished_at=now(),
          input_tokens=${usage?.inputTokens ?? null},output_tokens=${usage?.outputTokens ?? null},cached_input_tokens=${usage?.cachedInputTokens ?? null}
        WHERE id=${id}::uuid AND state='reserved'
        RETURNING day::text,reserved_tokens::text,purpose,pacing_debited,funding
      `.execute(tx);
      const row = reserved.rows[0];
      if (!row || !usage) {
        return;
      }
      if (row.funding === "paid") {
        await this.paid.settle(tx, id, usage, policy?.paid);
        return;
      }
      if (policy?.pacing && row.pacing_debited) {
        await this.pacing.adjust(
          tx,
          policy,
          row.purpose,
          Number(row.reserved_tokens) - usage.inputTokens - usage.outputTokens,
        );
      }
      await sql`UPDATE intelligence_token_days SET
        reserved_tokens=reserved_tokens-${row.reserved_tokens}::bigint,
        input_tokens=input_tokens+${usage.inputTokens},output_tokens=output_tokens+${usage.outputTokens},
        cached_input_tokens=cached_input_tokens+${usage.cachedInputTokens}
        WHERE day=${row.day}::date`.execute(tx);
    });
  }

  /** Registers a pending participant and initializes pacing under the same family lock used by final admission. */
  async prepare(
    model: string,
    minimumTokens: number,
    purpose: ModelTokenBudgetPurpose = "standard",
    work: ModelTokenWork = "maintenance",
    scope?: ModelTokenScope,
  ): Promise<ModelTokenBudgetSnapshot> {
    const policy = this.policyFor(model);
    if (!policy) {
      return this.snapshot(model, purpose, work, scope);
    }
    return this.db.transaction().execute(async (tx) => {
      await this.pacing.lock(tx, policy);
      if (policy.paid) {
        await this.paid.initialize(tx, policy.family, policy.paid);
      }
      if (policy.pacing) {
        await this.pacing.prepare(
          tx,
          policy,
          purpose,
          minimumTokens,
          work,
          scope,
        );
      }
      return this.readSnapshot(tx, model, purpose, work, scope);
    });
  }

  /** Reports current daily and pacing allowances without registering demand or changing credit. */
  async snapshot(
    model?: string,
    purpose: ModelTokenBudgetPurpose = "standard",
    work: ModelTokenWork = "maintenance",
    scope?: ModelTokenScope,
  ): Promise<ModelTokenBudgetSnapshot> {
    return this.readSnapshot(this.db, model, purpose, work, scope);
  }

  /** Reads the UTC day and existing model history; aliases cannot reset usage and cached input is counted once. */
  private async readSnapshot(
    db: Kysely<ScoutAlertDatabase>,
    model?: string,
    purpose: ModelTokenBudgetPurpose = "standard",
    work: ModelTokenWork = "maintenance",
    scope?: ModelTokenScope,
  ): Promise<ModelTokenBudgetSnapshot> {
    if (!["discovery", "maintenance"].includes(work)) {
      throw new Error("invalid_model_token_work");
    }
    const policy = model === undefined ? undefined : this.policyFor(model);
    const owner = await this.accounts.owner(db, scope);
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
        (SELECT count(*)::integer FROM intelligence_token_reservations r WHERE r.day=current_day.day AND r.state='unknown' AND r.funding='base') AS unknown_reservations
      FROM (SELECT (now() AT TIME ZONE 'UTC')::date AS day) current_day
      LEFT JOIN intelligence_token_days b ON b.day=current_day.day
    `.execute(db);
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
        db,
        policy,
        row.day,
        total.remainingTokens,
        purpose,
        policy.accountDailyLimit !== undefined
          ? (owner ?? "shared")
          : (scope?.scoutId ?? "shared"),
        owner,
      );
    }
    if (!this.policies.length) {
      return total;
    }
    return {
      ...total,
      models: await Promise.all(
        this.policies.map((item) =>
          this.modelSnapshot(db, item, row.day, total.remainingTokens),
        ),
      ),
    };
  }

  /** Rejects malformed account or money policies before admitting any model call. */
  private validateAdditions(policy: ModelTokenBudgetPolicy): void {
    if (
      [policy.accountDailyLimit, policy.sharedDailyLimit].some(
        (limit) =>
          limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0),
      )
    ) {
      throw new Error("invalid_account_token_policy");
    }
    const paid = policy.paid;
    if (!paid) {
      return;
    }
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(paid.periodAnchor) &&
      Number.isFinite(Date.parse(`${paid.periodAnchor}T00:00:00Z`)) &&
      new Date(`${paid.periodAnchor}T00:00:00Z`).toISOString().slice(0, 10) ===
        paid.periodAnchor;
    if (
      !validDate ||
      !Number.isInteger(paid.periodDays) ||
      paid.periodDays < 1 ||
      paid.periodDays > 366 ||
      !Number.isSafeInteger(paid.periodMicrousd) ||
      paid.periodMicrousd <= 0 ||
      !Number.isSafeInteger(paid.burstMicrousd) ||
      paid.burstMicrousd <= 0 ||
      ![paid.inputRate, paid.cachedRate, paid.outputRate].every(
        (rate) => Number.isFinite(rate) && rate >= 0,
      ) ||
      paid.inputRate <= 0 ||
      paid.outputRate <= 0 ||
      paid.cachedRate > paid.inputRate
    ) {
      throw new Error("invalid_paid_budget_policy");
    }
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
    participant: string | null = null,
    owner: string | null = null,
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
      FROM intelligence_token_reservations WHERE day=${day}::date AND funding='base' AND model IN (${sql.join(policy.models)}) GROUP BY purpose`.execute(
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
    const remainingTokens = purpose
      ? allocations.find((item) => item.purpose === purpose)!.remainingTokens
      : familyRemaining;
    const paid =
      policy.paid &&
      purpose !== "audit" &&
      this.dailyLimit > 0 &&
      policy.dailyLimit > 0
        ? await this.paid.snapshot(db, policy.family, policy.paid)
        : undefined;
    const account =
      participant !== null
        ? await this.accounts.snapshot(db, policy, owner)
        : undefined;
    return {
      paid,
      account,
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
      remainingTokens,
      unknownReservations: result.rows.reduce(
        (sum, row) => sum + row.unknown_reservations,
        0,
      ),
      allocations,
      ...(policy.pacing
        ? await this.pacing.snapshot(
            db,
            policy,
            remainingTokens,
            purpose,
            participant,
            allocations,
            paid ? Math.floor(paid.availableMicrousd / paid.inputRate) : 0,
          )
        : {}),
    };
  }
}
