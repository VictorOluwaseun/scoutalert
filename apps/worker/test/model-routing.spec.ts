import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIDiscoveryReasoningProvider } from "@repo/adapters/discovery";
import {
  createIntelligenceClient,
  estimateIntelligenceCost,
} from "@repo/adapters/scouting";

afterEach(() => vi.unstubAllGlobals());

describe("selective GPT-5.4 review and mini execution", () => {
  it("keeps routine strategy and choices on mini and routes a flagged recovery to GPT-5.4", async () => {
    const requests: Record<string, any>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        requests.push(body);
        const strategy = body.text.format.name === "scout_strategy";
        return Response.json({
          id: "resp_fixture",
          object: "response",
          created_at: 1,
          status: "completed",
          model: body.model,
          output: [
            {
              id: "msg_fixture",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  annotations: [],
                  text: JSON.stringify(
                    strategy
                      ? {
                          targets: ["Website redesign"],
                          explanation: "Preserve the requested deliverable.",
                        }
                      : {
                          index: 0,
                          explanation: "Inspect the supplied buyer brief.",
                        },
                  ),
                },
              ],
            },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 30,
            total_tokens: 130,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 10 },
          },
        });
      }),
    );
    const client = createIntelligenceClient("fixture-no-network");
    const provider = new OpenAIDiscoveryReasoningProvider(
      client,
      "gpt-5.4-mini-2026-03-17",
      "gpt-5.4-mini-2026-03-17",
      "gpt-5.4-2026-03-05",
    );
    const intent = {
      target: "Website redesign",
      category: "services" as const,
      remote: true,
    };
    const strategy = await provider.reason({ kind: "strategy", intent });
    const choice = await provider.reason({
      kind: "choice",
      intent,
      choices: [],
      evidence: [],
    });
    await provider.reason({
      kind: "choice",
      intent,
      choices: [],
      evidence: [],
      expertReview: "stalled_discovery",
    });
    expect(requests.map((body) => body.model)).toEqual([
      "gpt-5.4-mini-2026-03-17",
      "gpt-5.4-mini-2026-03-17",
      "gpt-5.4-2026-03-05",
    ]);
    expect(JSON.parse(requests[0]!.input)).toEqual({
      kind: "strategy",
      intent,
    });
    expect(
      requests
        .slice(0, 2)
        .every(
          (body) =>
            body.max_output_tokens === 2000 && body.reasoning.effort === "low",
        ),
    ).toBe(true);
    expect(strategy.usage.model).toBe("gpt-5.4-mini-2026-03-17");
    expect(requests[2]!.reasoning.effort).toBe("medium");
    expect(choice.usage.model).toBe("gpt-5.4-mini-2026-03-17");
    expect(provider.configuration).not.toBe(
      new OpenAIDiscoveryReasoningProvider(client, "gpt-5.4-mini-2026-03-17")
        .configuration,
    );
  });

  it("rejects oversized strategy input before any provider request", async () => {
    const send = vi.fn(() => {
      throw new Error("unexpected_network");
    });
    vi.stubGlobal("fetch", send);
    const provider = new OpenAIDiscoveryReasoningProvider(
      createIntelligenceClient("fixture-no-network"),
      "gpt-5.4-mini",
      "gpt-5.4",
    );
    await expect(
      provider.reason({
        kind: "strategy",
        intent: {
          target: "界".repeat(1000),
          category: "services",
          remote: true,
        },
      }),
    ).rejects.toThrow("discovery_reasoning_input_too_large");
    expect(send).not.toHaveBeenCalled();
  });

  it("estimates both reviewed model prices including cached input and long-context rates", () => {
    const usage = {
      model: "gpt-5.4",
      inputTokens: 1000,
      cachedInputTokens: 800,
      outputTokens: 100,
      durationMs: 1,
      responseId: "fixture",
    };
    expect(estimateIntelligenceCost(usage)?.estimatedMicrousd).toBe(2200);
    expect(
      estimateIntelligenceCost({ ...usage, model: "gpt-5.4-2026-03-05" })
        ?.estimatedMicrousd,
    ).toBe(2200);
    expect(
      estimateIntelligenceCost({ ...usage, model: "gpt-5.4-mini" })
        ?.estimatedMicrousd,
    ).toBe(660);
    expect(
      estimateIntelligenceCost({
        ...usage,
        inputTokens: 300_000,
        cachedInputTokens: 200_000,
      })?.estimatedMicrousd,
    ).toBe(602_250);
    expect(
      estimateIntelligenceCost({ ...usage, model: "gpt-5.4-unreviewed" }),
    ).toBeNull();
  });
});
