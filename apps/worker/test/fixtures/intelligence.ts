import {
  factNames,
  criterionNames,
  type Posting,
  type PostingAnalysis,
  type PersonalFit,
} from "@repo/core/scouting";
import type { SearchDraft } from "@repo/core/onboarding";
export const search: SearchDraft = {
  goal: "Product design work",
  target: "Product Designer",
  name: "Design",
  category: "employment",
  arrangement: "remote",
  arrangementRequired: true,
  residence: "Nigeria",
  workLocations: "Nigeria",
  background: "5 years of design",
  minimumPay: "50000",
  currency: "USD",
  payPeriod: "year",
  unknownEligibility: "review",
  undisclosedPay: "include",
};
export const posting: Posting = {
  id: "example:ai",
  source: "example",
  externalId: "ai",
  familyId: "ai",
  company: "Example",
  title: "Product Designer",
  location: "Remote",
  url: "https://example.com/job",
  text: "Permanent employment. Remote worldwide, including Nigeria. 3 years of design required. USD 60000 to 80000 per year. Confirm legal authorization.",
  sourceUpdatedAt: "2026-10-01T00:00:00Z",
  fingerprint: "ai-1",
  version: 1,
};
export const analysis: PostingAnalysis = {
  facts: Object.fromEntries(
    factNames.map((name) => [
      name,
      {
        status: "stated",
        value: name === "arrangement" ? "remote" : name,
        quotes: [posting.text],
      },
    ]),
  ) as PostingAnalysis["facts"],
  pay: { minimum: 60000, maximum: 80000, currency: "USD", period: "year" },
};
export const fit: PersonalFit = {
  criteria: criterionNames.map((criterion) => ({
    criterion,
    status: "meets",
    explanation: `${criterion} evidence`,
    quotes: [posting.text],
    briefQuotes: [search.target],
  })),
};
