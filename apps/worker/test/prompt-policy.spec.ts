import { describe, expect, it } from "vitest";
import { isPromptMatch, promptWindow } from "@repo/core/notifications";
import { assessPersonalFit, type OpportunityView } from "@repo/core/scouting";
import type { ScoutAlerts } from "@repo/core/onboarding";
import { search, posting, analysis, fit } from "./fixtures/intelligence.js";

const now = new Date("2026-10-01T12:00:00Z");
const alerts: ScoutAlerts = {
  frequency: "daily",
  timezone: "UTC",
  deliveryTime: "18:00",
  weekday: "Monday",
  consent: true,
  promptAlerts: true,
  consentVersion: "opportunity-alerts-v1",
};

/** Builds a supported but explicitly authorization-unconfirmed opportunity for policy evaluation. */
const confirmed = {
  ...search,
  authorizationLocations: "Nigeria",
  sponsorshipNeed: "not_needed" as const,
  authorizationConfirmed: true,
};

function opportunity(): OpportunityView {
  return {
    ...posting,
    ...assessPersonalFit(confirmed, analysis, fit)!,
    checkedAt: now.toISOString(),
    scouts: [search.name],
    availability: {
      status: "available",
      checkedAt: now.toISOString(),
      sourceUrl: "https://boards-api.greenhouse.io/v1/boards/example/jobs/1",
      fingerprint: posting.fingerprint,
    },
  };
}

describe("prompt alert quality and local quiet hours", () => {
  it("requires confirmed authorization even when the user accepts unknown eligibility for review", () => {
    expect(isPromptMatch(opportunity(), confirmed, now)).toBe(true);
    expect(isPromptMatch(opportunity(), search, now)).toBe(false);
    expect(
      isPromptMatch(
        opportunity(),
        { ...confirmed, unknownEligibility: "exclude" },
        now,
      ),
    ).toBe(true);
    const unknown = opportunity();
    unknown.detail!.criteria = unknown.detail!.criteria.map((item) =>
      item.criterion === "authorization"
        ? { ...item, status: "unknown" }
        : item,
    );
    expect(isPromptMatch(unknown, confirmed, now)).toBe(false);
    expect(
      isPromptMatch(opportunity(), { ...search, background: "" }, now),
    ).toBe(false);
    expect(
      isPromptMatch({ ...opportunity(), detail: undefined }, search, now),
    ).toBe(false);
  });
  it.each([
    "role",
    "category",
    "arrangement",
    "location",
    "experience",
    "compensation",
    "authorization",
  ])("withholds a prompt when %s is unknown or contradictory", (criterion) => {
    for (const status of ["unknown", "conflicts"] as const) {
      const result = opportunity();
      result.detail!.criteria = result.detail!.criteria.map((item) =>
        item.criterion === criterion ? { ...item, status } : item,
      );
      expect(isPromptMatch(result, confirmed, now)).toBe(false);
    }
  });
  it.each(["closed", "changed", "unresolved"] as const)(
    "withholds a prompt for %s availability",
    (status) => {
      const result = opportunity();
      result.availability!.status = status;
      expect(isPromptMatch(result, confirmed, now)).toBe(false);
    },
  );
  it("rejects absent, stale, future-dated or duplicate evidence", () => {
    for (const checkedAt of [
      "invalid",
      "2026-10-01T11:45:00Z",
      "2026-10-01T12:00:01Z",
    ]) {
      const result = opportunity();
      result.availability!.checkedAt = checkedAt;
      expect(isPromptMatch(result, confirmed, now)).toBe(false);
    }
    expect(
      isPromptMatch({ ...opportunity(), availability: null }, search, now),
    ).toBe(false);
    const duplicate = opportunity();
    duplicate.detail!.criteria[1] = duplicate.detail!.criteria[0]!;
    expect(isPromptMatch(duplicate, search, now)).toBe(false);
  });
  it("respects an explicit deadline even before the availability cache expires", () => {
    const result = opportunity();
    result.availability!.validUntil = "2026-10-01T12:00:00Z";
    expect(isPromptMatch(result, confirmed, now)).toBe(false);
    result.availability!.validUntil = "2026-10-01T12:01:00Z";
    expect(isPromptMatch(result, confirmed, now)).toBe(true);
    result.availability!.fingerprint = null;
    expect(isPromptMatch(result, confirmed, now)).toBe(false);
  });
  it("honors opt-in, dashboard-only and exact quiet-hour boundaries", () => {
    expect(promptWindow(alerts, now)).toBe("prompt:UTC:2026-10-01");
    expect(promptWindow({ ...alerts, consent: false }, now)).toBeNull();
    expect(promptWindow({ ...alerts, promptAlerts: false }, now)).toBeNull();
    expect(promptWindow({ ...alerts, frequency: "dashboard" }, now)).toBeNull();
    for (const time of ["00:00", "07:59", "20:00", "23:59"])
      expect(
        promptWindow(alerts, new Date(`2026-10-01T${time}:00Z`)),
      ).toBeNull();
    expect(
      promptWindow(alerts, new Date("2026-10-01T08:00:00Z")),
    ).not.toBeNull();
    expect(
      promptWindow(
        { ...alerts, quietHours: { start: "09:00", end: "17:00" } },
        now,
      ),
    ).toBeNull();
    expect(
      promptWindow(
        { ...alerts, quietHours: { start: "08:00", end: "08:00" } },
        now,
      ),
    ).toBeNull();
  });
  it("uses IANA local time through both repeated DST hours", () => {
    const choices = {
      ...alerts,
      timezone: "America/New_York",
      quietHours: { start: "01:00", end: "02:00" },
    };
    expect(promptWindow(choices, new Date("2026-11-01T05:30:00Z"))).toBeNull();
    expect(promptWindow(choices, new Date("2026-11-01T06:30:00Z"))).toBeNull();
    expect(
      promptWindow(choices, new Date("2026-11-01T07:00:00Z")),
    ).not.toBeNull();
  });
});
