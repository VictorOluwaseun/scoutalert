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
}

/** Durable, deployment-wide token admission, shared by every model stage and worker process. */
export abstract class ModelTokenBudgetRepository {
  /** Atomically reserves exact counted input plus maximum output; null denies a call without generating tokens. */
  abstract reserve(
    model: string,
    inputTokens: number,
    maximumOutputTokens: number,
  ): Promise<string | null>;
  /** Reconciles a reservation once on its original UTC day; unknown usage retains the full allowance, including after a crash. */
  abstract settle(id: string, usage: ModelTokenUsage | null): Promise<void>;
  /** Reads actual usage and retained capacity without changing or resetting the budget. */
  abstract snapshot(): Promise<ModelTokenBudgetSnapshot>;
}
