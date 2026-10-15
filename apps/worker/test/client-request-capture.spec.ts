import { describe, expect, it, vi } from "vitest";
import {
  BrowserDocumentRepository,
  PublicHttpRepository,
  PublicSourceDocumentRepository,
  freelancerRequestContent,
  reviewInput,
} from "@repo/adapters/discovery";
import {
  mayPublishLead,
  type SourceDocumentResult,
} from "@repo/core/discovery";
import { demandReview } from "./fixtures/lead-review.js";

const url =
  "https://www.freelancer.com/projects/website-development/need-website";
const description =
  "We need a website developer to redesign our business website with accessible pages and easy content editing. Share your cost and delivery time.";
// Sanitized structural fixture from the public server-rendered project layout, observed 2026-10-12.
const html = `<!doctype html><html><head><link rel="canonical" href="${url}"></head><body>
<noscript>Please enable JavaScript to continue using this application.</noscript>
<app-project-view-logged-out-main><div>
<div class="Project-heading"><h1>Website redesign</h1><p>Open</p><p>USD 500–1000</p></div>
<p class="Project-description">${description}</p>
<div><fl-tag fltrackinglabel="ProjectViewLoggedOut-SkillTag">WordPress</fl-tag></div>
<p>Project ID: 123456</p>
<app-project-view-logged-out-about><p>Open for bidding</p><p>Remote project</p></app-project-view-logged-out-about>
<app-project-view-logged-out-bid-list><p>My proposal: I have ten years of React experience and will charge $3000.</p><p>Sign in to view the full brief</p></app-project-view-logged-out-bid-list>
</div></app-project-view-logged-out-main>
<aside>Similar jobs: Permanent Java developer in Berlin</aside>
<script src="/unavailable.js"></script></body></html>`;

/** Supplies a complete HTTP response without third-party calls; unexpected browser resource requests fail loudly. */
class CaptureHttp extends PublicHttpRepository {
  readonly requested: string[] = [];
  /** Keeps each fixture's page body independent. */
  constructor(
    private readonly body: string,
    private readonly sourceUrl = url,
  ) {
    super();
  }
  /** Simulates permissive robots and a single source page, retaining normal repository request accounting. */
  override async read(
    target: string,
    maximumBytes: number,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    this.requested.push(target);
    if (new URL(target).pathname === "/robots.txt") {
      return { status: 404, contentType: "text/plain", body: "" };
    }
    if (
      target !== this.sourceUrl ||
      Buffer.byteLength(this.body) > maximumBytes
    ) {
      throw new Error("unexpected_fixture_request");
    }
    return { status: 200, contentType: "text/html", body: this.body };
  }
}

/** Passes captures through the real review boundary so assertions cover publication safety, not just text selection. */
function input(document: SourceDocumentResult) {
  return reviewInput({
    id: "fixture",
    url,
    title: "Website redesign",
    snippet: description,
    content_status: document.status,
    document,
    last_seen_at: document.checkedAt,
  });
}

describe("primary client request capture", () => {
  it("carries structural buyer provenance only for complete source captures and versions the review input", async () => {
    const document = await new PublicSourceDocumentRepository(
      new CaptureHttp(html),
    ).read(url);
    const complete = input(document);
    expect(complete.sourceKind).toBe("buyer_brief");
    const untyped = input({
      ...document,
      capture: { ...document.capture!, scope: undefined },
    });
    expect(untyped.sourceKind).toBeUndefined();
    expect(untyped.fingerprint).not.toBe(complete.fingerprint);
    expect(input({ ...document, truncated: true }).sourceKind).toBeUndefined();
    expect(
      input({ ...document, status: "access_limited" }).sourceKind,
    ).toBeUndefined();
    expect(
      input({ ...document, capture: { ...document.capture!, complete: false } })
        .sourceKind,
    ).toBeUndefined();
  });
  it("retains the buyer's budget, scope, platform skills, project identity and open remote status only", () => {
    const result = freelancerRequestContent(html, url);
    expect(result).toMatchObject({ complete: true, reason: null });
    for (const text of [
      description,
      "500–1000",
      "Listed skills: WordPress",
      "Project ID: 123456",
      "Open for bidding",
      "Remote project",
    ]) {
      expect(result?.text).toContain(text);
    }
    for (const text of [
      "React",
      "$3000",
      "Berlin",
      "enable JavaScript",
      "Sign in",
    ]) {
      expect(result?.text).not.toContain(text);
    }
  });

  it.each([
    [
      "missing description",
      html.replace('class="Project-description"', 'class="Changed-layout"'),
    ],
    [
      "incomplete response",
      html.split("</app-project-view-logged-out-about>")[0]!,
    ],
    ["conflicting identity", html.replace(url, `${url}-another`)],
    [
      "duplicate canonical",
      html.replace("</head>", `<link rel="canonical" href="${url}"></head>`),
    ],
    [
      "hidden primary content",
      html.replace(
        "<app-project-view-logged-out-main>",
        "<app-project-view-logged-out-main hidden>",
      ),
    ],
    ["missing status", html.replace("<p>Open</p>", "")],
    ["missing project ID", html.replace("Project ID: 123456", "")],
    [
      "duplicate brief",
      html
        .replace(
          "</body>",
          `<p class="Project-description">Another request</p></body>`,
        )
        .replace(
          "</div></app-project-view-logged-out-main>",
          '<p class="Project-description">Second request</p></div></app-project-view-logged-out-main>',
        ),
    ],
  ])("withholds %s instead of assessing bidder claims", (_label, body) => {
    expect(freelancerRequestContent(body, url)).toMatchObject({
      text: null,
      complete: false,
      reason: "buyer_brief_structure_unrecognized",
    });
  });

  it("keeps unsupported sources generic and does not treat a closed page as an open request", () => {
    expect(
      freelancerRequestContent(html, "https://example.com/projects/web/site"),
    ).toBeNull();
    expect(
      freelancerRequestContent(
        html,
        "https://www.freelancer.com/jobs/website-development",
      ),
    ).toBeNull();
    const closed = freelancerRequestContent(
      html.replaceAll("Open", "Closed"),
      url,
    );
    expect(closed?.complete).toBe(true);
    expect(closed?.text).toContain("Closed");
  });

  it("marks an oversized buyer description incomplete even when its wrapper is closed", () => {
    expect(
      freelancerRequestContent(
        html.replace(description, "Design scope. ".repeat(5000)),
        url,
      ),
    ).toMatchObject({
      complete: false,
      reason: "buyer_brief_too_large",
    });
  });

  it("uses complete server HTML without loading optional scripts, even with a large bid list", async () => {
    const http = new CaptureHttp(
      html.replace("My proposal:", "Bidder history. ".repeat(5000)),
    );
    const browser = new BrowserDocumentRepository();
    const render = vi.spyOn(browser, "render");
    const document = await new PublicSourceDocumentRepository(
      http,
      browser,
    ).read(url);
    expect(render).not.toHaveBeenCalled();
    expect(http.requested).toEqual([
      "https://www.freelancer.com/robots.txt",
      url,
    ]);
    expect(document).toMatchObject({
      status: "fetched",
      truncated: false,
      reason: null,
      posting: null,
      capture: {
        method: "http",
        complete: true,
        scope: "buyer_brief",
        parser: "freelancer-public-html-v1",
      },
    });
    expect(input(document).truncated).toBe(false);
    expect(input(document).text).not.toContain("React");
  });

  it("does not publish a source whose primary structure is missing", async () => {
    const document = await new PublicSourceDocumentRepository(
      new CaptureHttp(html.replace("Project-description", "unknown")),
    ).read(url);
    expect(document.truncated).toBe(true);
    const review = input(document);
    expect(review.scope).toBe("search_excerpt");
    expect(mayPublishLead(review, demandReview(review), new Date())).toBe(
      false,
    );
  });
});

describe("public brief access gates", () => {
  it.each([
    "Log in or Register to view this RFP and download solicitation documents.",
    "Sign in to read the full brief.",
    "Subscribe to download complete solicitation documents.",
  ])("withholds explicitly gated evidence: %s", async (gate) => {
    const body = `<h1>Website redesign tender</h1><p>${description}</p><p>${gate}</p><script src="/app.js"></script>`;
    const sourceUrl = "https://tenders.example.com/website-redesign";
    const document = await new PublicSourceDocumentRepository(
      new CaptureHttp(body, sourceUrl),
    ).read(sourceUrl);
    expect(document.reason).toBe("source_details_require_sign_in");
    expect(document.capture?.complete).toBe(false);
    expect(document.text).toContain(description);
    const review = input(document);
    expect(mayPublishLead(review, demandReview(review), new Date())).toBe(
      false,
    );
  });
});

describe("readable public application instructions", () => {
  it("allows sign-in to apply when the brief itself is public", async () => {
    const sourceUrl = "https://projects.example.com/website-redesign";
    const body = `<h1>Website redesign tender</h1><p>${description}</p><p>Sign in to apply and submit a proposal.</p>`;
    const document = await new PublicSourceDocumentRepository(
      new CaptureHttp(body, sourceUrl),
    ).read(sourceUrl);
    expect(document).toMatchObject({
      reason: null,
      truncated: false,
      capture: { complete: true },
    });
    expect(input(document).scope).toBe("source");
  });
});
