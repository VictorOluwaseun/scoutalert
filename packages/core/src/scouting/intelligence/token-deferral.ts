/** Signals a denied, never-sent generation; callers may safely defer without consuming a provider retry. */
export class ModelTokenBudgetDeferred extends Error {
  /** Carries the next bounded admission check time, not a guarantee that capacity will then be free. */
  constructor(readonly retryAt: string) {
    super("model_token_budget_deferred");
    this.name = "ModelTokenBudgetDeferred";
  }
}

/** Finds admission deferrals through native SDK error causes without treating timeouts or provider failures as safe refunds. */
export function modelTokenRetryAt(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 6; depth++) {
    if (
      current instanceof ModelTokenBudgetDeferred &&
      Number.isFinite(Date.parse(current.retryAt))
    ) {
      return current.retryAt;
    }
    if (!(current instanceof Error)) {
      return undefined;
    }
    current = current.cause;
  }
  return undefined;
}
