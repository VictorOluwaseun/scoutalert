import { createPostgresClient } from "../../packages/adapters/dist/database/public.js";
import {
  PostgresModelTokenBudgetRepository,
  modelTokenBudgetPolicies,
} from "../../packages/adapters/dist/scouting/public.js";
import { ModelTokenBudgetRepository } from "../../packages/core/dist/scouting/public.js";
import { readWorkerConfiguration } from "../../apps/worker/dist/config.js";

/** Attributes this evaluation's reservations while delegating every admission and settlement to the worker's durable ledger. */
class EvaluationTokenBudget extends ModelTokenBudgetRepository {
  attempts = new Map();

  /** Receives the shared repository, never a fresh per-evaluation allowance. */
  constructor(shared) {
    super();
    this.shared = shared;
  }

  /** Counts a test attempt only after the shared atomic reservation succeeds. */
  async reserve(model, inputTokens, maximumOutputTokens, purpose = "standard") {
    const id = await this.shared.reserve(
      model,
      inputTokens,
      maximumOutputTokens,
      purpose,
    );
    if (id) {
      this.attempts.set(id, {
        model,
        purpose,
        reservedTokens: inputTokens + maximumOutputTokens,
        state: "reserved",
        usage: null,
      });
    }
    return id;
  }

  /** Captures usage only after durable settlement, preserving uncertainty on persistence failure. */
  async settle(id, usage) {
    await this.shared.settle(id, usage);
    const attempt = this.attempts.get(id);
    if (attempt?.state === "reserved") {
      Object.assign(attempt, { state: usage ? "completed" : "unknown", usage });
    }
  }

  /** Returns the deployment budget, including concurrent worker activity. */
  snapshot(model, purpose) {
    return this.shared.snapshot(model, purpose);
  }
}

/** Wraps an isolated-database evaluation with the configured worker database's token ledger; only budget counters are written there. */
export function withSharedModelTokenBudget(action, enabled = true) {
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
        modelTokenBudgetPolicies(
          config.SCOUT_AI_GPT54_DAILY_TOKENS,
          config.SCOUT_AI_GPT54_MINI_DAILY_TOKENS,
          config.SCOUT_AI_AUDIT_DAILY_TOKENS,
        ),
      ),
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
          scope:
            "Evaluation generations share the configured worker database's daily allowance. Before/after snapshots include background worker activity; attempts contain this evaluation only. Counting failures before reservation do not appear as generation attempts.",
        },
      };
    } finally {
      await db.destroy();
    }
  };
}
