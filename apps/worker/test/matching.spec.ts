import { describe, expect, it } from "vitest";
import { assessPosting, roleTerms, type Posting } from "@repo/core/scouting";
import { digestWindow } from "@repo/core/notifications";
import type { SearchDraft, ScoutAlerts } from "@repo/core/onboarding";

const search: SearchDraft = {
  goal: "Find product design work",
  target: "Product designer",
  name: "Design scout",
  category: "employment",
  arrangement: "remote",
  arrangementRequired: false,
  residence: "Lagos",
  workLocations: "Worldwide",
  background: "Product design",
  minimumPay: "",
  currency: "USD",
  payPeriod: "year",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
const posting: Posting = {
  id: "example:1",
  source: "example",
  externalId: "1",
  familyId: "example:1",
  company: "Example",
  title: "Senior Product Designer",
  location: "Remote, United States",
  url: "https://example.com/job",
  text: "Role description",
  sourceUpdatedAt: "2026-10-01T00:00:00Z",
  fingerprint: "example",
  version: 1,
};
const alerts: ScoutAlerts = {
  frequency: "daily",
  timezone: "Africa/Lagos",
  deliveryTime: "08:00",
  weekday: "Monday",
  promptAlerts: true,
  consent: true,
  consentVersion: "opportunity-alerts-v1",
};

describe("conservative matching policies", () => {
  it("keeps public evidence separate from unverified eligibility and detailed fit", () => {
    const result = assessPosting(search, posting)!;
    expect(result.reasons).toContain(
      "The source title or location describes remote work.",
    );
    expect(
      result.uncertainties.some((value) =>
        value.includes("work authorization"),
      ),
    ).toBe(true);
    expect(
      result.uncertainties.some((value) => value.includes("Experience")),
    ).toBe(true);
  });
  it("honors strict unknown and undisclosed-pay policies", () => {
    expect(
      assessPosting({ ...search, unknownEligibility: "exclude" }, posting),
    ).toBeNull();
    expect(
      assessPosting({ ...search, undisclosedPay: "exclude" }, posting),
    ).toBeNull();
  });
  it("requires explicit work-arrangement evidence for a must-have", () => {
    expect(
      assessPosting(
        { ...search, arrangementRequired: true },
        { ...posting, location: "New York" },
      ),
    ).toBeNull();
    expect(
      assessPosting(
        { ...search, arrangementRequired: true },
        { ...posting, location: "Hybrid / Remote" },
      ),
    ).toBeNull();
  });
  it("does not misread Java as JavaScript or departments as role phrases", () => {
    expect(roleTerms("Java developer")).toEqual(["java", "development"]);
    expect(
      assessPosting(
        { ...search, target: "Java developer" },
        { ...posting, title: "JavaScript Developer" },
      ),
    ).toBeNull();
    expect(
      assessPosting(search, {
        ...posting,
        title: "Brand Designer, Product Launches",
      }),
    ).toBeNull();
    expect(
      assessPosting(search, {
        ...posting,
        title: "Director, People Partners - Product, Design & Engineering",
      }),
    ).toBeNull();
  });
  it("does not turn ordinary job postings into client projects or contracts", () => {
    expect(
      assessPosting({ ...search, category: "services" }, posting),
    ).toBeNull();
    expect(
      assessPosting({ ...search, category: "contracts" }, posting),
    ).toBeNull();
    expect(
      assessPosting(
        { ...search, category: "contracts" },
        { ...posting, title: "Product Designer (Contract)" },
      ),
    ).not.toBeNull();
  });
});

describe("recipient digest windows", () => {
  it("uses the chosen timezone, permits same-day catchup and honors consent", () => {
    expect(digestWindow(alerts, new Date("2026-10-01T06:59:00Z"))).toBeNull();
    expect(digestWindow(alerts, new Date("2026-10-01T07:00:00Z"))).toBe(
      "digest:Africa/Lagos:2026-10-01:08:00",
    );
    expect(digestWindow(alerts, new Date("2026-10-01T19:00:00Z"))).toBe(
      "digest:Africa/Lagos:2026-10-01:08:00",
    );
    expect(
      digestWindow(
        { ...alerts, consent: false },
        new Date("2026-10-01T19:00:00Z"),
      ),
    ).toBeNull();
    expect(
      digestWindow(
        { ...alerts, frequency: "dashboard" },
        new Date("2026-10-01T19:00:00Z"),
      ),
    ).toBeNull();
  });
  it("honors weekly weekdays and deduplicates repeated DST hours", () => {
    expect(
      digestWindow(
        { ...alerts, frequency: "weekly" },
        new Date("2026-10-01T19:00:00Z"),
      ),
    ).toBeNull();
    const dst = {
      ...alerts,
      timezone: "America/New_York",
      deliveryTime: "01:30",
    };
    expect(digestWindow(dst, new Date("2026-11-01T05:45:00Z"))).toBe(
      digestWindow(dst, new Date("2026-11-01T06:45:00Z")),
    );
    expect(
      digestWindow(
        { ...dst, deliveryTime: "02:30" },
        new Date("2026-03-08T07:30:00Z"),
      ),
    ).not.toBeNull();
  });
});
