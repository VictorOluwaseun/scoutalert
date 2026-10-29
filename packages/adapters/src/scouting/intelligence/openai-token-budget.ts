import OpenAI from "openai";
import type { InputTokenCountParams } from "openai/resources/responses/input-tokens";
import type {
  ModelTokenBudgetRepository,
  ModelTokenUsage,
} from "@repo/core/scouting";

/** Token enforcement supplied by the host; the native SDK continues handling requests and structured output. */
export interface OpenAITokenBudget {
  repository: ModelTokenBudgetRepository;
  maximumOutputTokens: number;
}

/** Guards the SDK's supported fetch hook so usage is retained even when structured-output parsing later fails. */
export class OpenAITokenBudgetTransport {
  /** Shares a durable repository across providers and uses a separate native counting client with retries disabled. */
  constructor(
    private readonly counter: OpenAI,
    private readonly budget: OpenAITokenBudget,
    private readonly send: typeof fetch = fetch,
  ) {
    if (
      !Number.isInteger(budget.maximumOutputTokens) ||
      budget.maximumOutputTokens < 16 ||
      budget.maximumOutputTokens > 4000
    ) {
      throw new Error("invalid_output_token_limit");
    }
  }

  /** Counts the complete request, reserves its worst-case tokens, then sends once; failed counting/admission never generates output. */
  async fetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (
      typeof url !== "string" ||
      !new URL(url).pathname.endsWith("/responses") ||
      init?.method !== "POST" ||
      typeof init.body !== "string"
    ) {
      throw new Error("unsupported_budgeted_model_request");
    }
    const body = JSON.parse(init.body);
    // Only the application's stateless, text-only, non-tool calls have a single bounded generation.
    if (
      typeof body.input !== "string" ||
      typeof body.model !== "string" ||
      body.stream ||
      body.background ||
      body.tools?.length ||
      body.conversation ||
      body.previous_response_id ||
      body.prompt ||
      !Number.isInteger(body.max_output_tokens) ||
      body.max_output_tokens < 16
    ) {
      throw new Error("unsupported_budgeted_model_request");
    }
    const maximumOutputTokens = Math.min(
      body.max_output_tokens,
      this.budget.maximumOutputTokens,
    );
    const snapshot = await this.budget.repository.snapshot();
    if (snapshot.remainingTokens < maximumOutputTokens) {
      throw new Error("daily_token_budget_exhausted");
    }
    const countInput: InputTokenCountParams = {
      model: body.model,
      input: body.input,
      instructions: body.instructions,
      reasoning: body.reasoning,
      text: body.text,
    };
    const counted = await this.counter.responses.inputTokens.count(countInput, {
      timeout: 8_000,
      maxRetries: 0,
      signal: init.signal ?? undefined,
    });
    const id = await this.budget.repository.reserve(
      body.model,
      counted.input_tokens,
      maximumOutputTokens,
    );
    if (!id) {
      throw new Error("daily_token_budget_exhausted");
    }
    let response: Response;
    try {
      init.signal?.throwIfAborted();
      response = await this.send(url, {
        ...init,
        body: JSON.stringify({
          ...body,
          max_output_tokens: maximumOutputTokens,
        }),
      });
    } catch (error) {
      await this.budget.repository.settle(id, null);
      throw error;
    }
    const usage = await this.readUsage(response);
    await this.budget.repository.settle(id, usage);
    return response;
  }

  /** Reads only counters from the response envelope; missing/malformed usage retains the reservation instead of assuming zero. */
  private async readUsage(response: Response): Promise<ModelTokenUsage | null> {
    try {
      const body = await response.clone().json();
      const inputTokens = body.usage?.input_tokens;
      const outputTokens = body.usage?.output_tokens;
      const cachedInputTokens =
        body.usage?.input_tokens_details?.cached_tokens ?? 0;
      if (
        ![inputTokens, outputTokens, cachedInputTokens].every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        ) ||
        cachedInputTokens > inputTokens ||
        !Number.isSafeInteger(inputTokens + outputTokens) ||
        (body.usage?.total_tokens !== undefined &&
          body.usage.total_tokens !== inputTokens + outputTokens)
      ) {
        return null;
      }
      return { inputTokens, outputTokens, cachedInputTokens };
    } catch {
      return null;
    }
  }
}
