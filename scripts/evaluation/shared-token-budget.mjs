import { configuredTokenPolicies } from "../../apps/worker/dist/composition/token-budget-policy.js";
import { createPostgresClient } from "../../packages/adapters/dist/database/public.js";
import { PostgresModelTokenBudgetRepository } from "../../packages/adapters/dist/scouting/public.js";
import { ModelTokenBudgetRepository } from "../../packages/core/dist/scouting/public.js";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";

/** Attributes this evaluation's reservations while delegating every admission and settlement to the worker's durable ledger. */
class EvaluationTokenBudget extends ModelTokenBudgetRepository {
  attempts = new Map();
  accountedTokens = 0;

  /** Receives the shared repository, never a fresh per-evaluation allowance. */
  constructor(shared, maximumTokens = Infinity) {
    super();
    this.shared = shared;
    this.maximumTokens = maximumTokens;
  }

  /** Counts a test attempt only after the shared atomic reservation succeeds. */
  async reserve(
    model,
    inputTokens,
    maximumOutputTokens,
    purpose = "standard",
    work = "maintenance",
  ) {
    const reservedTokens = inputTokens + maximumOutputTokens;
    if (this.accountedTokens + reservedTokens > this.maximumTokens) {
      return null;
    }
    // Reserve locally before awaiting the shared ledger so concurrent calls cannot reuse test capacity.
    this.accountedTokens += reservedTokens;
    let id;
    try {
      id = await this.shared.reserve(
        model,
        inputTokens,
        maximumOutputTokens,
        purpose,
        work,
      );
    } catch (error) {
      this.accountedTokens -= reservedTokens;
      throw error;
    }
    if (!id) {
      this.accountedTokens -= reservedTokens;
      return null;
    }
    this.attempts.set(id, {
      model,
      purpose,
      reservedTokens,
      state: "reserved",
      usage: null,
    });
    return id;
  }

  /** Captures usage only after durable settlement, preserving uncertainty on persistence failure. */
  async settle(id, usage) {
    await this.shared.settle(id, usage);
    const attempt = this.attempts.get(id);
    if (attempt?.state === "reserved") {
      Object.assign(attempt, { state: usage ? "completed" : "unknown", usage });
      this.accountedTokens += usage
        ? usage.inputTokens + usage.outputTokens - attempt.reservedTokens
        : 0;
    }
  }

  /** Synthetic evaluation scouts use the one shared lane; they cannot impersonate production scouts or mint fair turns. */
  prepare(model, minimumTokens, purpose, work) {
    return this.shared.prepare(model, minimumTokens, purpose, work);
  }

  /** Returns the deployment budget, including concurrent worker activity. */
  snapshot(model, purpose, work) {
    return this.shared.snapshot(model, purpose, work);
  }
}

/** Shares the worker's authoritative ledger and optionally adds a stricter per-invocation test ceiling; unknown outcomes retain capacity under both limits. */
export function withSharedModelTokenBudget(
  action,
  enabled = true,
  maximumTokens = Infinity,
) {
  if (
    maximumTokens !== Infinity &&
    (!Number.isSafeInteger(maximumTokens) || maximumTokens < 0)
  ) {
    throw new Error("invalid_evaluation_token_ceiling");
  }
  return async (evaluationDb) => {
    if (!enabled) {
      return action(evaluationDb, undefined);
    }
    const config = readWorkerConfiguration();
    const db = createPostgresClient(
      config.DATABASE_URL,
      "scoutalert-evaluation-token-budget",
    );
    const repository = new EvaluationTokenBudget(
      new PostgresModelTokenBudgetRepository(
        db,
        config.SCOUT_AI_DAILY_TOKENS,
        configuredTokenPolicies(config),
      ),
      maximumTokens,
    );
    try {
      const before = await repository.snapshot();
      const result = await action(evaluationDb, {
        repository,
        maximumOutputTokens: config.SCOUT_AI_MAX_OUTPUT_TOKENS,
      });
      return {
        ...result,
        sharedTokenBudget: {
          before,
          after: await repository.snapshot(),
          attempts: [...repository.attempts.values()],
          ...(Number.isFinite(maximumTokens)
            ? {
                evaluationTokenCeiling: maximumTokens,
                evaluationAccountedTokens: repository.accountedTokens,
              }
            : {}),
          scope:
            "Evaluation generations share the configured worker database's daily allowance. Before/after snapshots include background worker activity; attempts contain this evaluation only. Counting failures before reservation do not appear as generation attempts.",
        },
      };
    } finally {
      await db.destroy();
    }
  };
}
