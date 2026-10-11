import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { assessPersonalFit } from "../../packages/core/dist/scouting/public.js";

const [input, output] = process.argv.slice(2);
assert.ok(
  input && output,
  "Pass a saved live-quality report and a new output path",
);
const report = JSON.parse(await readFile(input, "utf8"));
const analyses = [
  ...new Map(
    report.intelligence
      .filter((task) => task.result?.analysis)
      .map((task) => [
        JSON.stringify(task.result.analysis),
        task.result.analysis,
      ]),
  ).values(),
];
const results = report.opportunities.map((opportunity) => {
  const role = opportunity.detail.criteria.find(
    (item) => item.criterion === "role",
  );
  const matching = analyses.filter(
    (analysis) =>
      analysis.facts.role.quotes.length > 0 &&
      analysis.facts.role.quotes.every((quote) => role.quotes.includes(quote)),
  );
  // Early reports did not retain task IDs. Require an unambiguous source-citation join, never a guessed title join.
  assert.equal(matching.length, 1, `Ambiguous evidence for ${opportunity.url}`);
  const assessment = assessPersonalFit(report.search, matching[0], {
    criteria: opportunity.detail.criteria,
  });
  return {
    url: opportunity.url,
    title: opportunity.title,
    before: true,
    after: !!assessment,
    assessment,
  };
});
const replay = {
  checkedAt: new Date().toISOString(),
  input,
  evaluationPolicy: "supported-criteria-v4",
  before: report.opportunities.length,
  after: results.filter((item) => item.after).length,
  results,
  modelRequests: 0,
  searchRequests: 0,
  emailsSent: 0,
  scope:
    "Monotonic replay of previously accepted results using their frozen public analysis and displayed criteria. Does not revive rejected results, establish independent relevance, refresh source availability or retract the historical synthetic Mailpit message. Previous-policy assessments require reassessment before another email.",
};
await writeFile(output, JSON.stringify(replay, null, 2) + "\n", { flag: "wx" });
console.log(
  JSON.stringify(
    {
      before: replay.before,
      after: replay.after,
      results: results.map(({ title, after }) => ({ title, after })),
      output,
    },
    null,
    2,
  ),
);
