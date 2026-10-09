import { chromium, type Route, type Page } from "playwright";
import type { PublicResponse } from "./public-http.js";
import type { PublicPageSession } from "./public-page-session.js";

/** One browser snapshot remains bounded evidence, never a claim that all content on a site has been read. */
export interface BrowserCapture {
  html: string;
  text: string;
  complete: boolean;
  reason: string | null;
}

/** Reads JavaScript-rendered public documents using an isolated browser with all HTTP I/O mediated by the pinned repository. */
export class BrowserDocumentRepository {
  /** Executes a page in a new sandboxed process/context; no persistent browser session or account is available. */
  async render(
    url: string,
    initial: PublicResponse,
    session: PublicPageSession,
  ): Promise<BrowserCapture> {
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      timeout: 5000,
      proxy: { server: "http://127.0.0.1:9", bypass: "<-loopback>" },
      args: [
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--disable-quic",
      ],
    });
    /** Closes stalled scripts/processes when the shared source deadline expires. */
    const abort = () => {
      void browser.close().catch(() => undefined);
    };
    session.signal.addEventListener("abort", abort, { once: true });
    try {
      session.signal.throwIfAborted();
      const context = await browser.newContext({
        serviceWorkers: "block",
        acceptDownloads: false,
        permissions: [],
        userAgent: "ScoutAlert/1.0",
      });
      let failure: string | null = null;
      await context.routeWebSocket(/.*/, (socket) => {
        failure ??= "browser_request_blocked";
        socket.close();
      });
      const page = await context.newPage();
      let initialUsed = false;
      await context.route("**/*", async (route) => {
        try {
          const request = route.request();
          const type = request.resourceType();
          if (["image", "media", "font"].includes(type)) {
            await route.abort();
            return;
          }
          if (!this.permitted(route, page, url)) {
            failure ??= "browser_request_blocked";
            await route.abort();
            return;
          }
          const first =
            !initialUsed && type === "document" && request.url() === url;
          initialUsed ||= first;
          const response = first ? initial : await session.read(request.url());
          if (
            response.status !== 200 ||
            !this.supported(response.contentType)
          ) {
            failure ??= "browser_resource_unavailable";
            await route.abort();
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: response.contentType,
            headers: response.headers,
            body: response.body,
          });
        } catch {
          failure ??= session.signal.aborted
            ? "browser_deadline"
            : "browser_resource_unavailable";
          await route.abort().catch(() => undefined);
        }
      });
      await page
        .goto(url, { waitUntil: "networkidle", timeout: 18_000 })
        .catch(() => {
          failure ??= "browser_deadline";
        });
      // A short second observation allows immediate hydration without waiting indefinitely for timers or polling.
      await page.waitForTimeout(500);
      const snapshot = await page.evaluate(() => {
        const clone = document.documentElement.cloneNode(true) as HTMLElement;
        const originals = [...document.documentElement.querySelectorAll("*")];
        const copies = [...clone.querySelectorAll("*")];
        for (let index = 0; index < originals.length; index += 1) {
          const element = originals[index]!;
          const style = getComputedStyle(element);
          if (
            element.tagName !== "SCRIPT" &&
            (style.display === "none" ||
              style.visibility === "hidden" ||
              element.getAttribute("aria-hidden") === "true")
          ) {
            copies[index]?.remove();
          }
        }
        return {
          html: clone.outerHTML.slice(0, 2_000_000),
          text: (document.body?.innerText ?? "").slice(0, 64_001),
          oversized: clone.outerHTML.length > 2_000_000,
        };
      });
      const oversized = snapshot.oversized || snapshot.text.length > 64_000;
      failure ??= snapshot.text.trim() ? null : "browser_empty_capture";
      return {
        html: snapshot.html,
        text: snapshot.text.slice(0, 64_000),
        complete: !failure && !oversized,
        reason: failure ?? (oversized ? "source_text_truncated" : null),
      };
    } finally {
      session.signal.removeEventListener("abort", abort);
      session.close();
      await browser.close();
    }
  }

  /** Allows only read requests from the main page; navigation, frames, writes and cross-origin data calls remain unsupported. */
  private permitted(route: Route, page: Page, source: string): boolean {
    const request = route.request();
    const url = new URL(request.url());
    const type = request.resourceType();
    return (
      request.method() === "GET" &&
      url.protocol === "https:" &&
      request.frame() === page.mainFrame() &&
      ["document", "script", "stylesheet", "xhr", "fetch"].includes(type) &&
      (type !== "document" || request.url() === source) &&
      (!["xhr", "fetch"].includes(type) ||
        url.origin === new URL(source).origin) &&
      !/(?:logout|delete|unsubscribe|checkout|payment)/iu.test(url.pathname)
    );
  }

  /** Only text resources needed for rendering enter Chromium; archives, binaries and attachments are not downloaded. */
  private supported(type: string): boolean {
    return /^(?:text\/(?:html|plain|css|javascript)|application\/(?:javascript|json|xhtml\+xml))(?:;|$)/iu.test(
      type,
    );
  }
}
