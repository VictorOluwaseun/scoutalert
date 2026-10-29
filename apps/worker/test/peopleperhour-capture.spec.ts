import { describe, expect, it, vi } from "vitest";
import {
  peoplePerHourRequestContent,
  PublicHttpRepository,
  PublicSourceDocumentRepository,
  reviewInput,
} from "@repo/adapters/discovery";

const url =
  "https://www.peopleperhour.com/freelance-jobs/technology-programming/website-development/website-redesign-4526000";
// Sanitized structure from public HTML observed 2026-10-15; bidder and clarification claims deliberately conflict with the buyer.
const html = `<html><head><link rel="canonical" href="${url}"></head><body>
<div class="main-content controller-job action-view">
<header><h1>Website redesign</h1><section><div class="budget">Fixed Price $500</div><div>Ends in (days) 28</div></section>
<ul><li>Posted: 2 days ago</li><li>Remote</li><li>#4526000</li><li><span class="info-label job-status open-for-proposals">Open for Proposals</span></li></ul></header>
<div class="bidders"><p>Senior React and TypeScript developer based in London. Ten years experience. $9000.</p></div>
<div class="job-details"><h3>Description</h3><div><div class="description-experience-level">Experience Level: Expert</div>
<div class="project-description gutter-top">We need a complete website redesign in WordPress with mobile layouts and accessible navigation. Please include testing in your proposal.</div></div></div>
<div id="clarification-list"><p>Does this need Angular? Must the contractor be in London?</p></div>
<aside>Similar project: Office-only Java developer</aside></div></body></html>`;

describe("PeoplePerHour primary buyer capture", () => {
  it("passes only the complete buyer section into source review and suppresses employment schema", async () => {
    const http = new PublicHttpRepository();
    vi.spyOn(http, "read")
      .mockResolvedValueOnce({
        status: 404,
        contentType: "text/plain",
        body: "",
      })
      .mockResolvedValueOnce({
        status: 200,
        contentType: "text/html",
        body: html,
      });
    const document = await new PublicSourceDocumentRepository(http).read(url);
    expect(document).toMatchObject({
      status: "fetched",
      truncated: false,
      posting: null,
      capture: {
        scope: "buyer_brief",
        complete: true,
        parser: "peopleperhour-public-html-v3",
      },
    });
    const input = reviewInput({
      id: "fixture",
      url,
      title: "Website redesign",
      snippet: "TypeScript bidder",
      content_status: document.status,
      document,
      last_seen_at: document.checkedAt,
    });
    expect(input.sourceKind).toBe("buyer_brief");
    expect(input.text).not.toContain("TypeScript");
  });

  it("retains scope, budget, identity, timing and remote status without bidder or clarification claims", () => {
    const result = peoplePerHourRequestContent(html, url);
    expect(result).toMatchObject({
      complete: true,
      reason: null,
      parser: "peopleperhour-public-html-v3",
    });
    for (const text of [
      "WordPress",
      "$500",
      "#4526000",
      "Open for Proposals",
      "Ends in 28 days",
      "2 days ago",
      "Remote",
      "Experience Level: Expert",
    ]) {
      expect(result?.text).toContain(text);
    }
    expect(result?.text).not.toMatch(
      /TypeScript|London|9000|Angular|Java developer/,
    );
  });

  it.each([
    ["canonical mismatch", html.replace(url, `${url}-1`)],
    ["project ID mismatch", html.replace("#4526000", "#4526001")],
    ["missing status", html.replace("job-status", "unknown")],
    ["missing description", html.replace("project-description", "unknown")],
    [
      "duplicate description",
      html
        .replace(
          "</body>",
          "<div class='project-description'>Other brief</div></body>",
        )
        .replace(
          "</aside>",
          "</aside><div class='project-description'>Other brief</div>",
        ),
    ],
    [
      "hidden root",
      html.replace('class="main-content', 'hidden class="main-content'),
    ],
    ["truncated response", html.split('<div id="clarification-list">')[0]!],
  ])("withholds %s rather than falling back to bidder text", (_name, body) => {
    expect(peoplePerHourRequestContent(body, url)).toMatchObject({
      text: null,
      complete: false,
      reason: "buyer_brief_structure_unrecognized",
    });
  });

  it("preserves closed and canceled outcomes even when a search excerpt says open", () => {
    const expired = peoplePerHourRequestContent(
      html.replace("Open for Proposals", "Expired"),
      url,
    );
    expect(expired?.complete).toBe(true);
    expect(expired?.text).toContain("Expired");
    const canceled = html.replace(
      /<header>[\s\S]*<\/aside>/u,
      '<div class="view-moderated"><header><h1>This project is no longer available</h1></header><section><p class="empty">This project has been canceled</p></section></div>',
    );
    expect(peoplePerHourRequestContent(canceled, url)).toMatchObject({
      complete: true,
      text: expect.stringContaining("canceled"),
    });
  });

  it("leaves directories generic and bounds oversized buyer briefs", () => {
    expect(
      peoplePerHourRequestContent(
        html,
        "https://www.peopleperhour.com/freelance-jobs/technology-programming",
      ),
    ).toBeNull();
    expect(
      peoplePerHourRequestContent(
        html,
        "https://example.com/freelance-jobs/project-4526000",
      ),
    ).toBeNull();
    expect(
      peoplePerHourRequestContent(
        html.replace("We need", "Scope. ".repeat(10_000)),
        url,
      ),
    ).toMatchObject({ complete: false, reason: "buyer_brief_too_large" });
  });

  it.each(["Expired", "Paused", "Archived", "Awarded"])(
    "captures %s evidence when the exact project names its immediate category as canonical",
    (status) => {
      const category = url.slice(0, url.lastIndexOf("/"));
      const body = html
        .replace(url, category)
        .replace("Open for Proposals", status);
      const result = peoplePerHourRequestContent(body, url);
      expect(result?.complete).toBe(true);
      expect(result?.text).toContain(status);
      expect(result?.text).toContain("#4526000");
      expect(result?.text).not.toMatch(/TypeScript|London|Angular/);
      expect(
        peoplePerHourRequestContent(body.replace("#4526000", "#9999999"), url)
          ?.complete,
      ).toBe(false);
    },
  );

  it("never accepts open demand, another category or another host via category canonical fallback", () => {
    const category = url.slice(0, url.lastIndexOf("/"));
    expect(
      peoplePerHourRequestContent(html.replace(url, category), url)?.complete,
    ).toBe(false);
    for (const canonical of [
      category.replace("website-development", "cms-development"),
      category.replace("peopleperhour.com", "example.org"),
    ]) {
      expect(
        peoplePerHourRequestContent(
          html.replace(url, canonical).replace("Open for Proposals", "Expired"),
          url,
        )?.complete,
      ).toBe(false);
    }
  });
});
