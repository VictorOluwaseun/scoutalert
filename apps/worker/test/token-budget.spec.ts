import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntelligenceClient } from "@repo/adapters/scouting";
import {
  ModelTokenBudgetRepository,
  type ModelTokenUsage,
} from "@repo/core/scouting";

/** Deterministic ledger fixture for native SDK transport checks; concurrency is tested against PostgreSQL separately. */
class TokenBudget extends ModelTokenBudgetRepository {
  held = 0;
  used: ModelTokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
  };
  unknown = 0;
  reservations: number[] = [];

  /** Sets only the authored test allowance. */
  constructor(readonly limit = 1000) {
    super();
  }

  /** Checks the reservation synchronously before yielding to mimic atomic admission in the fixture. */
  async reserve(_model: string, input: number, output: number) {
    if (!Number.isSafeInteger(input) || input < 0) {
      throw new Error("invalid_count");
    }
    const tokens = input + output;
    if (
      tokens + this.held + this.used.inputTokens + this.used.outputTokens >
      this.limit
    ) {
      return null;
    }
    this.held += tokens;
    this.reservations.push(tokens);
    return String(this.reservations.length - 1);
  }

  /** Retains unknown spending, or replaces the held allowance with authored provider usage. */
  async settle(id: string, usage: ModelTokenUsage | null) {
    if (!usage) {
      this.unknown++;
      return;
    }
    this.held -= this.reservations[Number(id)]!;
    this.used = usage;
  }

  /** Returns a budget snapshot without performing I/O. */
  async snapshot() {
    const usedTokens = this.used.inputTokens + this.used.outputTokens;
    return {
      day: "2026-10-29",
      dailyLimit: this.limit,
      ...this.used,
      reservedTokens: this.held,
      usedTokens,
      remainingTokens: Math.max(0, this.limit - usedTokens - this.held),
      unknownReservations: this.unknown,
    };
  }
}

const request = {
  model: "gpt-5.4-mini-2026-03-17",
  input: "Public test evidence",
  instructions: "Reply with the supplied test verdict.",
  max_output_tokens: 4000,
  reasoning: { effort: "low" as const },
  text: {
    format: {
      type: "json_schema" as const,
      name: "verdict",
      strict: true,
      schema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
        additionalProperties: false,
      },
    },
  },
};

/** Supplies a native Responses envelope with usage independent of whether its structured text is valid. */
function response(
  text = '{"ok":true}',
  status = "completed",
  usage: unknown = {
    input_tokens: 100,
    output_tokens: 60,
    input_tokens_details: { cached_tokens: 20 },
    output_tokens_details: { reasoning_tokens: 40 },
    total_tokens: 160,
  },
) {
  return {
    id: "resp_fixture",
    object: "response",
    created_at: 1,
    model: request.model,
    status,
    output: [
      {
        id: "msg_fixture",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage,
  };
}

/** Stubs only the HTTP boundary while retaining the real OpenAI SDK counting and parsing behavior. */
function fixture(
  budget = new TokenBudget(),
  output: unknown = response(),
  counted = 100,
) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const send = vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: JSON.parse(init.body as string) });
    if (path.endsWith("/input_tokens")) {
      return Response.json({
        object: "response.input_tokens",
        input_tokens: counted,
      });
    }
    if (output instanceof Error) {
      throw output;
    }
    return Response.json(output);
  });
  vi.stubGlobal("fetch", send);
  const client = createIntelligenceClient("test-key-not-real", {
    repository: budget,
    maximumOutputTokens: 256,
  });
  return { client, budget, calls, send };
}

afterEach(() => vi.unstubAllGlobals());

describe("token limits at the native model boundary", () => {
  it("counts instructions and schemas, bounds output and records cached input/reasoning exactly once", async () => {
    const f = fixture();
    await expect(f.client.responses.parse(request)).resolves.toMatchObject({
      output_parsed: { ok: true },
    });
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0]!.body).toMatchObject({
      model: request.model,
      input: request.input,
      instructions: request.instructions,
      text: request.text,
      reasoning: request.reasoning,
    });
    expect(f.calls[1]!.body.max_output_tokens).toBe(256);
    expect(f.budget.reservations).toEqual([356]);
    expect(await f.budget.snapshot()).toMatchObject({
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 60,
      usedTokens: 160,
      reservedTokens: 0,
      remainingTokens: 840,
    });
  });

  it("blocks all provider requests when the daily allowance is zero", async () => {
    const f = fixture(new TokenBudget(0));
    await expect(f.client.responses.create(request)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });

  it("checks the requested model before counting, even when the global allowance has room", async () => {
    const budget = new TokenBudget(100_000);
    const snapshot = vi.spyOn(budget, "snapshot").mockResolvedValue({
      ...(await budget.snapshot()),
      remainingTokens: 0,
      dailyLimit: 250,
    });
    const f = fixture(budget);
    await expect(
      f.client.responses.create({ ...request, model: "gpt-5.4" }),
    ).rejects.toThrow();
    expect(snapshot).toHaveBeenLastCalledWith("gpt-5.4", "standard");
    expect(f.calls).toEqual([]);
    expect(budget.reservations).toEqual([]);
  });

  it("does not count or generate for an unconfigured model family", async () => {
    const budget = new TokenBudget();
    vi.spyOn(budget, "snapshot").mockRejectedValue(
      new Error("unconfigured_model_token_budget"),
    );
    const f = fixture(budget);
    await expect(
      f.client.responses.create({ ...request, model: "unreviewed-model" }),
    ).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });

  it("does not generate when exact input plus output does not fit", async () => {
    const f = fixture(new TokenBudget(300));
    await expect(f.client.responses.create(request)).rejects.toThrow();
    expect(f.calls.map((c) => c.path)).toEqual(["/v1/responses/input_tokens"]);
    expect(f.budget.held).toBe(0);
  });

  it("retains a smaller stage-specific output limit", async () => {
    const f = fixture();
    await f.client.responses.create({ ...request, max_output_tokens: 128 });
    expect(f.calls[1]!.body.max_output_tokens).toBe(128);
    expect(f.budget.reservations).toEqual([228]);
  });

  it.each([NaN, -1, 1.5])(
    "rejects an invalid input count without generation: %s",
    async (count) => {
      const f = fixture(new TokenBudget(), response(), count);
      await expect(f.client.responses.create(request)).rejects.toThrow();
      expect(f.calls).toHaveLength(1);
    },
  );

  it("keeps the complete allowance when the generation outcome is unknown and does not retry", async () => {
    const f = fixture(new TokenBudget(), new Error("fixture_timeout"));
    await expect(f.client.responses.create(request)).rejects.toThrow();
    expect(f.calls).toHaveLength(2);
    expect(await f.budget.snapshot()).toMatchObject({
      reservedTokens: 356,
      usedTokens: 0,
      unknownReservations: 1,
    });
  });

  it("records actual tokens before structured-output parsing rejects the response", async () => {
    const f = fixture(new TokenBudget(), response("invalid json"));
    await expect(f.client.responses.parse(request)).rejects.toThrow();
    expect(await f.budget.snapshot()).toMatchObject({
      usedTokens: 160,
      reservedTokens: 0,
    });
  });

  it("records actual tokens for an incomplete response", async () => {
    const f = fixture(new TokenBudget(), response('{"ok":', "incomplete"));
    await f.client.responses.create(request);
    expect(await f.budget.snapshot()).toMatchObject({
      usedTokens: 160,
      reservedTokens: 0,
    });
  });

  it.each([
    null,
    { input_tokens: 100, output_tokens: -1 },
    {
      input_tokens: 100,
      output_tokens: 50,
      input_tokens_details: { cached_tokens: 101 },
    },
  ])("holds capacity for missing or invalid usage", async (usage) => {
    const f = fixture(
      new TokenBudget(),
      response('{"ok":true}', "completed", usage),
    );
    await f.client.responses.create(request);
    expect(await f.budget.snapshot()).toMatchObject({
      usedTokens: 0,
      reservedTokens: 356,
      unknownReservations: 1,
    });
  });

  it("fails closed if the ledger cannot admit the request", async () => {
    const f = fixture();
    vi.spyOn(f.budget, "reserve").mockRejectedValueOnce(
      new Error("fixture_database_failure"),
    );
    await expect(f.client.responses.create(request)).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
  });

  it("never generates or retries when the counting endpoint is unavailable", async () => {
    const f = fixture();
    f.send.mockResolvedValueOnce(
      Response.json(
        { error: { message: "fixture unavailable" } },
        { status: 503 },
      ),
    );
    await expect(f.client.responses.create(request)).rejects.toThrow();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.budget.held).toBe(0);
  });

  it("keeps capacity reserved when persisting returned usage fails", async () => {
    const f = fixture();
    vi.spyOn(f.budget, "settle").mockRejectedValueOnce(
      new Error("fixture_database_failure"),
    );
    await expect(f.client.responses.create(request)).rejects.toThrow();
    expect(f.calls).toHaveLength(2);
    expect(f.budget.held).toBe(356);
  });

  it("refuses stored prompts whose expanded input is not available to the counter", async () => {
    const f = fixture();
    await expect(
      f.client.responses.create({ ...request, prompt: { id: "pmpt_fixture" } }),
    ).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });

  it("does not release capacity for contradictory token totals", async () => {
    const f = fixture(
      new TokenBudget(),
      response('{"ok":true}', "completed", {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 500,
      }),
    );
    await f.client.responses.create(request);
    expect(await f.budget.snapshot()).toMatchObject({
      reservedTokens: 356,
      usedTokens: 0,
      unknownReservations: 1,
    });
  });
});
