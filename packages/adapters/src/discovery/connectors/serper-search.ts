import { z } from "zod";
import {
  WebSearchProvider,
  type SearchCapability,
  type WebSearchQuery,
  type WebSearchResult,
} from "@repo/core/discovery";
import { readSourceResponse } from "../../scouting/connectors/source-http.js";

const responseSchema = z.object({
  organic: z
    .array(
      z.object({
        link: z.url().max(2048),
        title: z.string().max(1000).optional(),
        snippet: z.string().max(8000).optional(),
        position: z.number().int().positive().optional(),
      }),
    )
    .max(100),
});

/** Google-index adapter preserves public-index semantics; social results do not imply native platform monitoring. */
export class SerperSearchProvider extends WebSearchProvider {
  readonly capability: SearchCapability;

  /** Cost is a configured admission reservation, not a claim about measured provider billing. */
  constructor(
    private readonly apiKey: string,
    settings: { language: string; country: string; requestCostMicros: number },
    private readonly request: typeof fetch = fetch,
  ) {
    super();
    this.capability = {
      id: "serper",
      configuration: "google-search-v2",
      access: "public_index",
      ...settings,
    };
  }

  /** Executes a single bounded result page; provider errors retain the coordinator's spending reservation. */
  async search(query: WebSearchQuery): Promise<WebSearchResult> {
    const response = await this.request("https://google.serper.dev/search", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
      headers: { "X-API-KEY": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        q: query.query,
        hl: query.language,
        gl: query.country ?? undefined,
        tbs: query.freshness === "month" ? "qdr:m" : undefined,
        num: query.limit,
        page: query.page,
      }),
    });
    const parsed = responseSchema.parse(
      await readSourceResponse(response, 1_000_000),
    );
    const observations = parsed.organic
      .slice(0, query.limit)
      .map((item, index) => ({
        url: item.link,
        title: item.title ?? null,
        snippet: item.snippet ?? null,
        rank: item.position ?? index + 1,
      }));

    return {
      kind: "search",
      observations,
      checkedAt: new Date().toISOString(),
      completeness: "window",
      nextPage: observations.length === query.limit ? query.page + 1 : null,
    };
  }
}
