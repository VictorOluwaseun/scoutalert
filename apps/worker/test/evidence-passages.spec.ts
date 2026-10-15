import { describe, expect, it } from "vitest";
import { evidencePassages } from "@repo/adapters/scouting";

describe("source citation passages", () => {
  it.each([
    "UK\nWebsite redesign\n28\nFixed price",
    "Website redesign\n\nUK\nRemote project",
    `Description\n${"a".repeat(1001)}\nEU`,
  ])("keeps short labels with exact surrounding source evidence", (source) => {
    const passages = Object.values(evidencePassages(source, "p", 3));
    expect(
      passages.every(
        (passage) => source.includes(passage) && passage.trim().length >= 3,
      ),
    ).toBe(true);
    for (const paragraph of source.split(/\n+/u)) {
      expect(passages.join("").replace(/\n/gu, "")).toContain(paragraph);
    }
  });

  it("preserves short private brief values and never fabricates context for a source that has none", () => {
    expect(evidencePassages("UK\n5", "b")).toEqual({ b0: "UK", b1: "5" });
    expect(evidencePassages("UK", "p", 3)).toEqual({ p0: "UK" });
    expect(evidencePassages("", "p", 3)).toEqual({});
  });
});
