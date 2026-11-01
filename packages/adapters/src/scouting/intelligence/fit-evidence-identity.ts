import type { PostingAnalysis } from "@repo/core/scouting";

/** Excludes observation clocks from fit identity only; callers must still validate the current evidence's freshness before reuse. All facts, provenance, text and fingerprints remain significant. */
export function fitEvidenceIdentity(analysis: PostingAnalysis | undefined) {
  if (!analysis?.research) {
    return analysis;
  }
  const {
    checkedAt: _checkedAt,
    expiresAt: _expiresAt,
    ...research
  } = analysis.research;
  return {
    ...analysis,
    research: {
      ...research,
      documents: research.documents.map(
        ({ checkedAt: _observed, ...document }) => document,
      ),
    },
  };
}
