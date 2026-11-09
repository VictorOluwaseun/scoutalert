import OpenAI from "openai";
import type { InputTokenCountParams } from "openai/resources/responses/input-tokens";
import {
  ModelTokenBudgetDeferred,
  paidTokenCost,
  type ModelTokenBudgetSnapshot,
  type ModelTokenWork,
  type ModelTokenScope,
  type ModelTokenBudgetRepository,
  type ModelTokenUsage,
} from "@repo/core/scouting";

/** Internal routing metadata is removed by the guarded fetch hook before either provider endpoint sees it. */
export function tokenBudgetMetadata(
  work: ModelTokenWork,
  scope?: ModelTokenScope,
): Record<string, string> {
  return {
    scout_token_work: work,
    ...(scope
      ? {
          scout_budget_scout_id: scope.scoutId,
          scout_budget_scout_version: String(scope.version),
        }
      : {}),
  };
}

/** Removes internal scout attribution even for explicitly unbudgeted evaluation clients. */
export async function sendWithoutTokenScope(
  url: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof init?.body !== "string") {
    return fetch(url, init);
  }
  const body = JSON.parse(init.body);
  const {
    scout_budget_scout_id: _scout,
    scout_budget_scout_version: _version,
    ...metadata
  } = body.metadata ?? {};
  return fetch(url, { ...init, body: JSON.stringify({ ...body, metadata }) });
}

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
    const purpose = body.metadata?.scout_budget_purpose ?? "standard";
    if (purpose !== "standard" && purpose !== "audit") {
      throw new Error("unsupported_model_budget_purpose");
    }
    const work = body.metadata?.scout_token_work ?? "maintenance";
    if (work !== "discovery" && work !== "maintenance") {
      throw new Error("unsupported_model_token_work");
    }
    const {
      scout_budget_scout_id: scoutId,
      scout_budget_scout_version: version,
      ...metadata
    } = body.metadata ?? {};
    const scope =
      scoutId === undefined && version === undefined
        ? undefined
        : { scoutId, version: Number(version) };
    if (
      scope &&
      (typeof scoutId !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          scoutId,
        ) ||
        !Number.isSafeInteger(scope.version) ||
        scope.version < 1)
    ) {
      throw new Error("invalid_model_token_scope");
    }
    const snapshot = await this.budget.repository.prepare(
      body.model,
      maximumOutputTokens,
      purpose,
      work,
      scope,
    );
    this.assertAvailable(snapshot, maximumOutputTokens, work, purpose);
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
      purpose,
      work,
      scope,
    );
    if (!id) {
      const current = await this.budget.repository.snapshot(
        body.model,
        purpose,
        work,
        scope,
      );
      this.assertAvailable(
        current,
        counted.input_tokens + maximumOutputTokens,
        work,
        purpose,
        counted.input_tokens,
        maximumOutputTokens,
      );
      throw new ModelTokenBudgetDeferred(
        new Date(Date.now() + 60_000).toISOString(),
      );
    }
    let response: Response;
    try {
      init.signal?.throwIfAborted();
      response = await this.send(url, {
        ...init,
        body: JSON.stringify({
          ...body,
          metadata,
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

  /** Distinguishes a known unsent admission denial from an ambiguous provider failure; no SDK count is needed while pacing credit is unavailable. */
  private assertAvailable(
    snapshot: ModelTokenBudgetSnapshot,
    tokens: number,
    work: ModelTokenWork,
    purpose: "standard" | "audit",
    inputTokens = 0,
    outputTokens = tokens,
  ): void {
    const nextDay = new Date(
      new Date(`${snapshot.day}T00:00:00Z`).getTime() + 86_400_000,
    ).toISOString();
    if (snapshot.account && snapshot.account.remainingTokens < tokens) {
      throw new ModelTokenBudgetDeferred(nextDay);
    }
    const paid = snapshot.paid;
    const paidAvailable =
      paid &&
      purpose === "standard" &&
      snapshot.pacing?.fairTurn !== false &&
      (work === "discovery" ||
        !snapshot.pacing ||
        snapshot.pacing.maintenanceBorrowing) &&
      paidTokenCost(paid, inputTokens, outputTokens) <= paid.availableMicrousd;
    if (paidAvailable) {
      return;
    }
    const capacity =
      snapshot.pacing?.allocations?.find((item) => item.purpose === purpose)
        ?.capacity ?? snapshot.pacing?.limit;
    if (
      capacity !== undefined &&
      capacity > 0 &&
      tokens > capacity &&
      paid &&
      paidTokenCost(paid, inputTokens, outputTokens) <= paid.burstMicrousd
    ) {
      throw new ModelTokenBudgetDeferred(paid.retryAt);
    }
    if (capacity !== undefined && capacity > 0 && tokens > capacity) {
      throw new Error("model_request_exceeds_pacing_capacity");
    }
    if (snapshot.remainingTokens < tokens) {
      const retryAt = paid
        ? new Date(
            Math.min(Date.parse(nextDay), Date.parse(paid.retryAt)),
          ).toISOString()
        : nextDay;
      throw new ModelTokenBudgetDeferred(retryAt);
    }
    const paced =
      work === "discovery"
        ? snapshot.pacing?.availableTokens
        : snapshot.pacing?.maintenanceAvailableTokens;
    if (paced !== undefined && paced < tokens) {
      const retryAt = paid
        ? new Date(
            Math.min(
              Date.parse(snapshot.pacing!.retryAt),
              Date.parse(paid.retryAt),
            ),
          ).toISOString()
        : snapshot.pacing!.retryAt;
      throw new ModelTokenBudgetDeferred(retryAt);
    }
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
