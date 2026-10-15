import { parentPort, workerData } from "node:worker_threads";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { feedUrl } from "./document-feeds.js";
import type { PdfTextResult } from "./pdf-text.js";

/** Reads only transferred bytes; scripts, external fonts, images and linked documents are never fetched. */
async function extract(bytes: Uint8Array): Promise<PdfTextResult> {
  const result: PdfTextResult = {
    text: "",
    pages: 0,
    extractedPages: 0,
    reason: null,
    links: [],
  };
  const task = getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWasm: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const document = await task.promise;
    result.pages = document.numPages;
    if (result.pages > 50) {
      return { ...result, reason: "source_pdf_page_limit" };
    }
    for (let number = 1; number <= result.pages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "",
        )
        .join("")
        .trim();
      if (!text) {
        result.reason = "source_pdf_ocr_required";
      }
      const next = `${result.text}${result.text ? "\n\n" : ""}[Page ${number}]\n${text}`;
      if (next.length > 64_000) {
        return { ...result, reason: "source_pdf_text_limit" };
      }
      result.text = next;
      result.extractedPages++;
      for (const annotation of await page.getAnnotations({
        intent: "display",
      })) {
        const url =
          typeof annotation.url === "string"
            ? feedUrl(annotation.url, "https://pdf.invalid/")
            : null;
        if (
          url &&
          result.links.length < 80 &&
          !result.links.some((link) => link.url === url)
        ) {
          result.links.push({ url, text: `PDF link on page ${number}` });
        }
      }
      page.cleanup();
    }
    return result;
  } catch (error) {
    return {
      ...result,
      reason:
        error instanceof Error && error.name === "PasswordException"
          ? "source_pdf_password_required"
          : "source_pdf_invalid",
    };
  } finally {
    await task.destroy();
  }
}

parentPort?.postMessage(await extract(workerData));
