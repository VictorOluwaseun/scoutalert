import {
  briefEvidence,
  postingEvidence,
  type Posting,
  type PostingAnalysis,
} from "@repo/core/scouting";
import type { SearchDraft } from "@repo/core/onboarding";
import { evidencePassages, referenceQuotes } from "./evidence-passages.js";

/** Appends original paragraphs once and returns their IDs, keeping each research document's provenance attached to its own passages. */
function appendPassages(
  text: string,
  passages: Record<string, string>,
): string[] {
  return Object.values(evidencePassages(text, "p", 3)).map((quote) => {
    const id = `p${Object.keys(passages).length}`;
    passages[id] = quote;
    return id;
  });
}

/** Losslessly compacts mini's fit request; transport changes do not invalidate already validated semantic-policy results. No source conditions, timestamps or unmatched quotations are removed. */
export function fitPacket(
  posting: Posting,
  search: SearchDraft,
  analysis: PostingAnalysis,
) {
  const passages: Record<string, string> = {};
  const postingPassages = appendPassages(postingEvidence(posting), passages);
  const documents = analysis.research?.documents.map(
    ({ text, ...document }) => ({
      ...document,
      passages: appendPassages(text, passages),
    }),
  );
  const briefPassages = Object.fromEntries(
    briefEvidence(search).map((value, index) => [`b${index}`, value]),
  );
  const input = JSON.stringify({
    passages,
    postingPassages,
    kind: posting.kind ?? "job",
    analysis: {
      ...analysis,
      facts: Object.fromEntries(
        Object.entries(analysis.facts).map(([name, fact]) => [
          name,
          { ...fact, quotes: referenceQuotes(fact.quotes, passages) },
        ]),
      ),
      ...(analysis.research
        ? {
            research: {
              ...analysis.research,
              documents,
              findings: analysis.research.findings.map((finding) => ({
                ...finding,
                quotes: referenceQuotes(finding.quotes, passages),
              })),
            },
          }
        : {}),
    },
    brief: search,
    briefPassages,
  });
  return { input, passages, briefPassages };
}
