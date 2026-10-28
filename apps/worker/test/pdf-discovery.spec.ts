import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  PdfTextRepository,
  PublicSourceDocumentRepository,
  PublicHttpRepository,
  publicResponseBytes,
  documentLinks,
  type PublicResponse,
} from "@repo/adapters/discovery";
import { blocksSourceHost } from "@repo/core/discovery";
import { fixturePdf } from "./fixtures/pdf.js";

const url = "https://procurement.example.org/website-redesign.pdf";

/** Supplies one admitted public PDF response and counts policy/content reads without using the network. */
class PdfHttp extends PublicHttpRepository {
  calls = 0;
  /** Allows tests to simulate denied robots, HTTP failures and content types. */
  constructor(
    private readonly response: PublicResponse,
    private readonly denied = false,
  ) {
    super();
  }
  /** Returns permissive robots or the exact authored PDF; no hidden resources are allowed. */
  override async read(value: string) {
    this.calls++;
    return value.endsWith("robots.txt")
      ? { status: this.denied ? 403 : 404, contentType: "text/plain", body: "" }
      : this.response;
  }
}

describe("permitted PDF discovery", () => {
  it("marks null-mapped PDF glyphs incomplete while preserving text that PostgreSQL can store", async () => {
    const result = await new PublicSourceDocumentRepository(
      new PdfHttp({
        status: 200,
        contentType: "application/pdf",
        body: "",
        binary: fixturePdf(["Website # redesign RFP"], undefined, true),
      }),
    ).read(url);
    expect(result).toMatchObject({
      status: "access_limited",
      reason: "source_pdf_invalid",
      truncated: true,
      capture: { complete: false },
    });
    expect(result.text).toContain("Website \uFFFD redesign RFP");
    expect(result.text).not.toContain("\u0000");
  });

  it("extracts ordered pages and only observed public links using the real PDF parser", async () => {
    const parsed = await new PdfTextRepository().read(
      fixturePdf(
        [
          "Website redesign RFP. Remote delivery. Budget USD 5000.",
          "Proposals due November 20, 2026. Apply at our portal.",
        ],
        "https://procurement.example.org/apply",
      ),
      AbortSignal.timeout(10_000),
    );
    expect(parsed.reason).toBeNull();
    expect(parsed.text).toContain("[Page 1]\nWebsite redesign");
    expect(parsed.text).toContain("[Page 2]\nProposals due");
    expect(parsed.pages).toBe(2);
    expect(parsed.extractedPages).toBe(2);
    expect(parsed.links).toEqual([
      {
        url: "https://procurement.example.org/apply",
        text: "PDF link on page 1",
      },
    ]);
  });

  it("preserves binary gzip bytes and rejects decompression over the original ceiling", async () => {
    const bytes = Buffer.concat([
      Buffer.from("%PDF-"),
      Buffer.from([0xff, 0xfe, 0x80]),
    ]);
    expect(
      await publicResponseBytes(
        gzipSync(bytes),
        "gzip",
        "application/pdf",
        url,
        1000,
      ),
    ).toEqual(bytes);
    await expect(
      publicResponseBytes(
        gzipSync(Buffer.alloc(20_000)),
        "gzip",
        "application/pdf",
        url,
        100,
      ),
    ).rejects.toThrow("source_response_too_large");
  });

  it("retains robots, binary accounting, PDF provenance and ordinary observed-link discovery", async () => {
    const binary = fixturePdf([
      "Website redesign RFP. Remote delivery. Proposals are open until November 20, 2026.",
    ]);
    const http = new PdfHttp({
      status: 200,
      contentType: "application/pdf",
      body: "",
      binary,
    });
    const result = await new PublicSourceDocumentRepository(http).read(url);
    expect(result).toMatchObject({
      status: "fetched",
      pdf: { pages: 1, extractedPages: 1 },
      truncated: false,
      capture: {
        method: "http",
        parser: "public-pdf-v2",
        requests: 2,
        bytes: binary.length,
        complete: true,
      },
    });
    expect(
      documentLinks(
        `<a href="/website-redesign.pdf">Download the RFP</a>`,
        "https://procurement.example.org/rfps",
      ),
    ).toEqual([{ url, text: "Download the RFP" }]);
  });

  it.each([
    [fixturePdf([""]), "source_pdf_ocr_required"],
    [
      fixturePdf(Array.from({ length: 51 }, () => "Project")),
      "source_pdf_page_limit",
    ],
    [new Uint8Array(Buffer.from("invalid pdf")), "source_pdf_invalid"],
  ])(
    "keeps incomplete PDFs out of matching and does not block sibling documents",
    async (binary, reason) => {
      const result = await new PublicSourceDocumentRepository(
        new PdfHttp({
          status: 200,
          contentType: "application/pdf",
          body: "",
          binary: binary as Uint8Array,
        }),
      ).read(url);
      expect(result).toMatchObject({
        status: "access_limited",
        reason,
        truncated: true,
        capture: { complete: false },
      });
      expect(blocksSourceHost(result)).toBe(false);
    },
  );

  it("honors cancellation before starting extraction", async () => {
    await expect(
      new PdfTextRepository().read(fixturePdf(["Demand"]), AbortSignal.abort()),
    ).rejects.toThrow();
  });

  it("never parses denied robots or an HTTP 403 as a PDF", async () => {
    const binary = fixturePdf(["Buyer demand"]);
    const denied = new PdfHttp(
      { status: 200, contentType: "application/pdf", body: "", binary },
      true,
    );
    expect(
      await new PublicSourceDocumentRepository(denied).read(url),
    ).toMatchObject({ reason: "crawl_policy_unavailable" });
    expect(denied.calls).toBe(1);
    const forbidden = new PdfHttp({
      status: 403,
      contentType: "application/pdf",
      body: "",
      binary,
    });
    expect(
      await new PublicSourceDocumentRepository(forbidden).read(url),
    ).toMatchObject({
      reason: "source_access_denied",
      capture: { complete: false },
    });
  });

  it("identifies the approved Upwork access requirement without attempting website scraping", async () => {
    const http = new PdfHttp({
      status: 200,
      contentType: "text/html",
      body: "unexpected",
    });
    expect(
      await new PublicSourceDocumentRepository(http).read(
        "https://www.upwork.com/jobs/~123",
      ),
    ).toMatchObject({
      status: "access_limited",
      reason: "upwork_api_access_required",
      capture: { requests: 0 },
    });
    expect(http.calls).toBe(0);
  });

  it("retains the Upwork access boundary across an observed redirect", async () => {
    const http = new PdfHttp({
      status: 302,
      contentType: "text/html",
      body: "",
      headers: { location: "https://www.upwork.com/jobs/~123" },
    });
    expect(
      await new PublicSourceDocumentRepository(http).read(url),
    ).toMatchObject({
      reason: "upwork_api_access_required",
      capture: { requests: 2, complete: false },
    });
    expect(http.calls).toBe(2);
  });
});
