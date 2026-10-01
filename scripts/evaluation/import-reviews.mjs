import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyReviews } from "./corpus.mjs";

const [corpusPath, reviewPath, outputPath] = process.argv.slice(2);
assert.ok(
  corpusPath && reviewPath && outputPath,
  "Usage: node scripts/evaluation/import-reviews.mjs corpus.json reviews.json reviewed-corpus.json",
);
assert.notEqual(
  resolve(corpusPath),
  resolve(outputPath),
  "Preserve the original corpus and create a label version",
);
const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
const packet = JSON.parse(await readFile(reviewPath, "utf8"));
const reviewed = applyReviews(corpus, packet);
await writeFile(outputPath, JSON.stringify(reviewed, null, 2) + "\n", {
  flag: "wx",
});
console.log(
  JSON.stringify({
    outputPath,
    importedReviews: packet.reviews.length,
    corpusHash: reviewed.contentHash,
  }),
);
