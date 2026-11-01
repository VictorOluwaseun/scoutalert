import { describe, expect, it } from "vitest";
import {
  briefEvidence,
  postingEvidence,
  researchText,
  researchFacts,
} from "@repo/core/scouting";
import { fitPacket, evidencePassages } from "@repo/adapters/scouting";
import { analysis, posting, search } from "./fixtures/intelligence.js";

describe("compact mini fit evidence", () => {
  it("sends every source paragraph once with provenance and preserves unmatched claims without mutating analysis", () => {
    const paragraph = "Required remote delivery in Nigeria. ".repeat(25);
    const evidence = structuredClone(analysis);
    const checkedAt = new Date().toISOString();
    evidence.research = {
      checkedAt,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      documents: [
        {
          url: "https://example.com/policy",
          text: paragraph,
          checkedAt,
          fingerprint: "policy-v1",
        },
      ],
      findings: researchFacts.map((fact) => ({
        fact,
        status: "unresolved",
        applicability: "unclear",
        value: "",
        explanation: "Retain the original condition.",
        quotes: [paragraph],
        sourceUrl: "https://example.com/policy",
      })),
    };
    for (const fact of Object.values(evidence.facts)) {
      fact.quotes = [paragraph, "partial quote"];
    }
    const saved = structuredClone(evidence);
    const packet = fitPacket(posting, search, evidence);
    const input = JSON.parse(packet.input);
    const doc = input.analysis.research.documents[0];
    expect(doc).toMatchObject({
      url: "https://example.com/policy",
      checkedAt,
      fingerprint: "policy-v1",
    });
    expect(doc.text).toBeUndefined();
    expect(
      doc.passages.map((id: string) => packet.passages[id]).join("\n"),
    ).toBe(paragraph);
    expect(
      input.postingPassages.map((id: string) => packet.passages[id]),
    ).toEqual(
      Object.values(evidencePassages(postingEvidence(posting), "p", 3)),
    );
    expect(input.analysis.facts.role.quotes).toEqual([
      doc.passages[0],
      "partial quote",
    ]);
    expect(input.analysis.research.findings[0].quotes).toEqual(doc.passages);
    expect(input.analysis.research.expiresAt).toBe(evidence.research.expiresAt);
    expect(input.brief).toEqual(search);
    expect(evidence).toEqual(saved);
    const previous = JSON.stringify({
      passages: evidencePassages(
        `${postingEvidence(posting)}\n${researchText(evidence)}`,
        "p",
        3,
      ),
      kind: posting.kind ?? "job",
      analysis: evidence,
      brief: search,
      briefPassages: Object.fromEntries(
        briefEvidence(search).map((text, index) => [`b${index}`, text]),
      ),
    });
    expect(Buffer.byteLength(packet.input)).toBeLessThan(
      Buffer.byteLength(previous) / 2,
    );
  });
});
