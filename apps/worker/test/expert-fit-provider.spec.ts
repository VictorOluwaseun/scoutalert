import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIntelligenceClient,
  OpenAIFitReviewProvider,
} from "@repo/adapters/scouting";
import { fitReviewRequest } from "@repo/core/scouting";
import { search, posting, analysis, fit } from "./fixtures/intelligence.js";

afterEach(() => vi.unstubAllGlobals());

describe("native expert review boundary", () => {
  it("references repeated quotations without dropping source text or increasing the packet ceiling", async () => {
    const paragraphs = ["A", "B", "C", "D"].map((letter) =>
      letter.repeat(1000),
    );
    const baseline = structuredClone(fit);
    for (const criterion of baseline.criteria) {
      criterion.quotes = [...paragraphs];
    }
    const facts = structuredClone(analysis);
    for (const fact of Object.values(facts.facts)) {
      fact.quotes = [...paragraphs];
    }
    const request = fitReviewRequest(posting, facts, baseline, "sample_audit");
    request.sources = [
      {
        url: posting.url,
        observedAt: null,
        text: paragraphs.join("\n"),
        complete: true,
      },
    ];
    const client = createIntelligenceClient("fixture-no-network");
    const parse = vi
      .spyOn(client.responses, "parse")
      .mockRejectedValue(new Error("captured"));
    const provider = new OpenAIFitReviewProvider(client, "gpt-5.4-2026-03-05");
    await expect(provider.review(search, facts, request)).rejects.toThrow(
      "captured",
    );
    const input = parse.mock.calls[0]![0].input as string;
    const packet = JSON.parse(input);
    expect(Buffer.byteLength(input)).toBeLessThan(24_000);
    expect(Object.values(packet.sources[0].passages)).toEqual(paragraphs);
    expect(packet.sources[0].complete).toBe(true);
    expect(packet.baseline.criteria[0].quotes).toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
    ]);
    expect(packet.facts.role.quotes).toEqual(["p0", "p1", "p2", "p3"]);
    expect(request.baseline.criteria[0]!.quotes).toEqual(paragraphs);
  });

  it.each(["sample_audit", "conditional_requirements"] as const)(
    "preserves source citations and charges %s to its allocation",
    async (reason) => {
      let sent: Record<string, any> | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          sent = JSON.parse(init.body as string);
          const packet = JSON.parse(sent!.input);
          const ids = packet.sources.flatMap((source: any) =>
            Object.keys(source.passages),
          );
          return Response.json({
            id: "resp_review",
            object: "response",
            created_at: 1,
            status: "completed",
            model: sent!.model,
            output: [
              {
                id: "msg_review",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    annotations: [],
                    text: JSON.stringify({
                      criteria: fit.criteria.map((item) => ({
                        ...item,
                        quotes: [ids.at(-1)],
                        briefQuotes: ["b0"],
                      })),
                    }),
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 240,
              output_tokens: 100,
              total_tokens: 340,
              input_tokens_details: { cached_tokens: 40 },
              output_tokens_details: { reasoning_tokens: 20 },
            },
          });
        }),
      );
      const request = fitReviewRequest(posting, analysis, fit, reason);
      request.sources.push({
        url: "https://example.com/requirements",
        observedAt: "2026-10-29T00:00:00Z",
        text: "Applicants must reside in Nigeria.",
        complete: true,
      });
      const provider = new OpenAIFitReviewProvider(
        createIntelligenceClient("fixture-no-network"),
        "gpt-5.4-2026-03-05",
      );
      const result = await provider.review(search, analysis, request);
      expect(sent).toMatchObject({
        model: "gpt-5.4-2026-03-05",
        max_output_tokens: 4000,
        reasoning: { effort: "medium" },
        metadata: {
          scout_budget_purpose:
            reason === "sample_audit" ? "audit" : "standard",
        },
        store: false,
      });
      expect(JSON.parse(sent!.input).sources[1]).toMatchObject({
        url: "https://example.com/requirements",
        observedAt: "2026-10-29T00:00:00Z",
        complete: true,
      });
      expect(result.fit.criteria[0]!.quotes).toEqual([
        "Applicants must reside in Nigeria.",
      ]);
      expect(result.fit.criteria[0]!.briefQuotes).not.toEqual(["b0"]);
      expect(result.usage).toMatchObject({
        inputTokens: 240,
        outputTokens: 100,
        cachedInputTokens: 40,
      });
    },
  );

  it("refuses an oversized packet before provider access", async () => {
    const send = vi.fn(() => {
      throw new Error("unexpected_network");
    });
    vi.stubGlobal("fetch", send);
    const provider = new OpenAIFitReviewProvider(
      createIntelligenceClient("fixture-no-network"),
      "gpt-5.4-2026-03-05",
    );
    const request = fitReviewRequest(posting, analysis, fit, "sample_audit");
    request.sources[0]!.text = "界".repeat(24_000);
    await expect(provider.review(search, analysis, request)).rejects.toThrow(
      "expert_fit_packet_too_large",
    );
    expect(send).not.toHaveBeenCalled();
  });
});
