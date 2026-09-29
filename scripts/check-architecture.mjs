import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkManifest, checkSource } from "./architecture-rules.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifests = globSync(["apps/*/package.json", "packages/*/package.json"], {
  cwd: root,
});
const workspaces = manifests.sort().map((file) => ({
  directory: file.slice(0, -"/package.json".length),
  manifest: JSON.parse(
    readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
  ),
}));
const violations = workspaces.flatMap(checkManifest);
let sourceCount = 0;

for (const workspace of workspaces) {
  const sources = globSync(
    `${workspace.directory}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`,
    {
      cwd: root,
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/.turbo/**",
        "**/coverage/**",
        "**/build/**",
      ],
    },
  );
  for (const file of sources.sort()) {
    sourceCount += 1;
    try {
      violations.push(
        ...checkSource(
          file,
          readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
          workspace,
          workspaces,
          root,
        ),
      );
    } catch (error) {
      violations.push(`${file}: Unable to check syntax: ${error.message}`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Architecture checks passed (${workspaces.length} workspaces, ${sourceCount} source files).`,
  );
}
