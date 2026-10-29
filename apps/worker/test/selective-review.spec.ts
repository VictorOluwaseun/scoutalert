import { describe, expect, it } from "vitest";
import {
  fitReviewReason,
  fitReviewRequest,
  validReviewedFit,
  assessPersonalFit,
} from "@repo/core/scouting";
import { search, posting, analysis, fit } from "./fixtures/intelligence.js";

describe("observable expert-review routing", () => {
  it("keeps ordinary source interpretation and missing evidence with mini", () => {
    expect(fitReviewReason(posting, search, analysis, fit, 0)).toBeNull();
    const missing = {
      ...analysis,
      facts: {
        ...analysis.facts,
        arrangement: { status: "unknown" as const, value: "", quotes: [] },
      },
    };
    expect(fitReviewReason(posting, search, missing, fit, 0)).toBeNull();
    expect(assessPersonalFit(search, missing, fit)).toBeNull();
  });

  it("routes source conflicts, conditional requirements and complex buyer briefs", () => {
    const condition =
      "Remote only if based in Canada. Supplier registration and liability insurance are required.";
    const source = { ...posting, text: `${posting.text}\n${condition}` };
    expect(fitReviewReason(source, search, analysis, fit, 0)).toBe(
      "conditional_requirements",
    );
    const conflict = {
      ...analysis,
      facts: {
        ...analysis.facts,
        location: {
          status: "conflicting" as const,
          value: "Conflicting locations",
          quotes: [posting.text, condition],
        },
      },
    };
    expect(fitReviewReason(source, search, conflict, fit, 0)).toBe(
      "conflicting_evidence",
    );
    expect(
      fitReviewReason(
        {
          ...posting,
          kind: "client_request",
          text: `${posting.text}\nSupplier registration and liability insurance are required.`,
        },
        search,
        analysis,
        fit,
        0,
      ),
    ).toBe("complex_client_request");
    expect(
      fitReviewReason(
        {
          ...posting,
          kind: "client_request",
          text: `${posting.text}\nSupplier registration.`,
        },
        search,
        analysis,
        fit,
        0,
      ),
    ).toBeNull();
  });

  it("samples both accepted and rejected baselines deterministically, with zero disabling audits", () => {
    const rejected = {
      criteria: fit.criteria.map((item) =>
        item.criterion === "role"
          ? { ...item, status: "conflicts" as const }
          : item,
      ),
    };
    for (const baseline of [fit, rejected]) {
      const selected = Array.from({ length: 400 }, (_, index) => ({
        ...posting,
        id: `sample-${index}`,
      })).filter(
        (source) =>
          fitReviewReason(source, search, analysis, baseline, 5) ===
          "sample_audit",
      );
      expect(selected.length).toBeGreaterThan(0);
      expect(selected.length).toBeLessThan(60);
      for (const source of selected) {
        expect(fitReviewReason(source, search, analysis, baseline, 5)).toBe(
          "sample_audit",
        );
        expect(
          fitReviewReason(source, search, analysis, baseline, 0),
        ).toBeNull();
      }
    }
  });

  it("preserves source provenance and exact restrictions in a compact packet", () => {
    const restriction = "Contractors must reside in Canada.";
    const source = {
      ...posting,
      text: `${posting.text}\n${"Boilerplate.\n".repeat(800)}${restriction}`,
    };
    const packet = fitReviewRequest(
      source,
      analysis,
      fit,
      "conditional_requirements",
    );
    expect(packet.sources[0]).toMatchObject({
      url: posting.url,
      observedAt: posting.sourceUpdatedAt,
      complete: false,
    });
    expect(packet.sources[0]!.text).toContain(restriction);
    expect(packet.sources[0]!.text.length).toBeLessThanOrEqual(6000);
    expect(packet.baseline).toEqual(fit);
  });

  it("refuses invented evidence and positive upgrades when source context was omitted", () => {
    const unknown = {
      criteria: fit.criteria.map((item) =>
        item.criterion === "location"
          ? { ...item, status: "unknown" as const }
          : item,
      ),
    };
    const packet = fitReviewRequest(posting, analysis, unknown, "sample_audit");
    expect(validReviewedFit(posting, search, analysis, packet, fit)).toBe(true);
    packet.sources[0]!.complete = false;
    expect(validReviewedFit(posting, search, analysis, packet, fit)).toBe(
      false,
    );
    expect(validReviewedFit(posting, search, analysis, packet, unknown)).toBe(
      true,
    );
    const invented = {
      criteria: unknown.criteria.map((item) => ({
        ...item,
        quotes: ["Invented worldwide permission"],
      })),
    };
    expect(validReviewedFit(posting, search, analysis, packet, invented)).toBe(
      false,
    );
  });
});
