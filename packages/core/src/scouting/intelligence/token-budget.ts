/** Provider-reported totals; cached input is a subset of input and reasoning is included in output. */
export interface ModelTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

/** Current UTC admission day, including capacity retained for in-flight or unknown outcomes. */
export interface ModelTokenBudgetSnapshot extends ModelTokenUsage {
  day: string;
  dailyLimit: number;
  reservedTokens: number;
  usedTokens: number;
  remainingTokens: number;
  unknownReservations: number;
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

export type ModelTokenBudgetPurpose = "standard" | "audit";

/** One independent daily allowance shared by the explicitly approved model aliases and snapshots. */
export interface ModelTokenBudgetPolicy {
  family: string;
  models: readonly string[];
  dailyLimit: number;
  auditTokens?: number;
}

/** Durable, deployment-wide token admission, shared by every model stage and worker process. */
export abstract class ModelTokenBudgetRepository {
  /** Atomically reserves exact counted input plus maximum output; null denies a call without generating tokens. */
  abstract reserve(
    model: string,
    inputTokens: number,
    maximumOutputTokens: number,
    purpose?: ModelTokenBudgetPurpose,
  ): Promise<string | null>;
  /** Reconciles a reservation once on its original UTC day; unknown usage retains the full allowance, including after a crash. */
  abstract settle(id: string, usage: ModelTokenUsage | null): Promise<void>;
  /** Reads deployment or selected-model capacity without resetting usage; unconfigured models must fail closed when family limits apply. */
  abstract snapshot(
    model?: string,
    purpose?: ModelTokenBudgetPurpose,
  ): Promise<ModelTokenBudgetSnapshot>;
}
