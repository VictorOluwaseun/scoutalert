/** Provider-reported totals; cached input is a subset of input and reasoning is included in output. */
export interface ModelTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

/** Current UTC admission day, including capacity retained for in-flight or unknown outcomes. */
export interface ModelTokenBudgetSnapshot extends ModelTokenUsage {
  /** Additional paid capacity is independently cost-limited; it never replenishes base counters. */
  paid?: import("./paid-budget.js").ModelPaidBudgetSnapshot;
  /** Owner-wide ceiling counts all scouts, revisions and funding sources, including unresolved calls. */
  account?: {
    dailyLimit: number;
    committedTokens: number;
    remainingTokens: number;
  };
  day: string;
  dailyLimit: number;
  reservedTokens: number;
  usedTokens: number;
  remainingTokens: number;
  unknownReservations: number;
  /** Refilled credit and demand-aware sharing remain subordinate to every daily ceiling. */
  pacing?: {
    windowMinutes: number;
    limit: number;
    maintenanceLimit: number;
    committedTokens: number;
    maintenanceCommittedTokens: number;
    availableTokens: number;
    maintenanceAvailableTokens: number;
    retryAt: string;
    refillTokensPerHour?: number;
    maintenanceBorrowing?: boolean;
    waitingScouts?: number;
    fairTurn?: boolean;
    allocations?: {
      purpose: ModelTokenBudgetPurpose;
      capacity: number;
      availableTokens: number;
      refillTokensPerHour: number;
    }[];
  };
  /** Family totals include every approved alias/snapshot; remaining capacity also respects the deployment ceiling. */
  models?: (ModelTokenBudgetSnapshot & { model: string })[];
  /** Optional protected audit allocation within a model family; not extra capacity. */
  allocations?: {
    purpose: ModelTokenBudgetPurpose;
    dailyLimit: number;
    usedTokens: number;
    reservedTokens: number;
    remainingTokens: number;
  }[];
}

/** Internal attribution for admission only; it must not enter public evidence, cache identities or provider payloads. */
export interface ModelTokenScope {
  scoutId: string;
  version: number;
}

/** Fresh or changed evidence receives preferred capacity; policy-only reassessment is maintenance. */
export type ModelTokenWork = "discovery" | "maintenance";

export type ModelTokenBudgetPurpose = "standard" | "audit";

/** One independent daily allowance shared by the explicitly approved model aliases and snapshots. */
export interface ModelTokenBudgetPolicy {
  accountDailyLimit?: number;
  sharedDailyLimit?: number;
  paid?: import("./paid-budget.js").ModelPaidBudgetPolicy;
  family: string;
  models: readonly string[];
  dailyLimit: number;
  auditTokens?: number;
  pacing?: {
    windowMinutes: number;
    maintenancePercent: number;
    carryoverMinutes?: number;
    minimumBurstTokens?: number;
    demandMinutes?: number;
  };
}

/** Durable, deployment-wide token admission, shared by every model stage and worker process. */
export abstract class ModelTokenBudgetRepository {
  /** Atomically reserves exact counted input plus maximum output; null denies a call without generating tokens. */
  abstract reserve(
    model: string,
    inputTokens: number,
    maximumOutputTokens: number,
    purpose?: ModelTokenBudgetPurpose,
    work?: ModelTokenWork,
    scope?: ModelTokenScope,
  ): Promise<string | null>;

  /** Registers live demand before counting; simple repositories may delegate to their read-only snapshot. */
  prepare(
    model: string,
    minimumTokens: number,
    purpose: ModelTokenBudgetPurpose = "standard",
    work: ModelTokenWork = "maintenance",
    scope?: ModelTokenScope,
  ): Promise<ModelTokenBudgetSnapshot> {
    return this.snapshot(model, purpose, work, scope);
  }

  /** Reconciles a reservation once on its original UTC day; unknown usage retains the full allowance, including after a crash. */
  abstract settle(id: string, usage: ModelTokenUsage | null): Promise<void>;

  /** Reads deployment or selected-model capacity without resetting usage; unconfigured models must fail closed when family limits apply. */
  abstract snapshot(
    model?: string,
    purpose?: ModelTokenBudgetPurpose,
    work?: ModelTokenWork,
    scope?: ModelTokenScope,
  ): Promise<ModelTokenBudgetSnapshot>;
}
