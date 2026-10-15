import { Worker } from "node:worker_threads";

export interface PdfTextResult {
  text: string;
  pages: number;
  extractedPages: number;
  reason: string | null;
  links: { url: string; text: string }[];
}

/** Extracts untrusted PDF text in a disposable thread with bounded memory, time, pages and output. */
export class PdfTextRepository {
  /** Starts only a local parser; all source downloads and crawl admission happen before this boundary. */
  async read(bytes: Uint8Array, signal: AbortSignal): Promise<PdfTextResult> {
    signal.throwIfAborted();
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(8_000)]);
    const worker = new Worker(
      new URL("./pdf-text-worker.js", import.meta.url),
      {
        workerData: bytes,
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 96, stackSizeMb: 4 },
        stdout: true,
        stderr: true,
      },
    );
    worker.stdout.resume();
    worker.stderr.resume();
    try {
      return await new Promise<PdfTextResult>((resolve, reject) => {
        const abort = () => reject(new Error("source_pdf_timeout"));
        deadline.addEventListener("abort", abort, { once: true });
        worker.once("message", resolve);
        worker.once("error", () => reject(new Error("source_pdf_invalid")));
        worker.once("exit", () => {
          deadline.removeEventListener("abort", abort);
          reject(new Error("source_pdf_invalid"));
        });
      });
    } finally {
      await worker.terminate();
    }
  }
}
