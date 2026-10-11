import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const cwd = fileURLToPath(new URL("../../apps/web/", import.meta.url));
const lint = new ESLint({ cwd });

test("web TSX is checked, accepts type-only names, and preserves JSX scope", async () => {
  const [result] = await lint.lintText(
    'import type { ReactNode } from "react";\nexport function Preview({ children }: { children: ReactNode }) { return <section>{children}</section>; }',
    { filePath: "features/lint-regression.tsx" },
  );
  assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
  assert.equal(result.warningCount, 0, JSON.stringify(result.messages));
});

test("unused TypeScript values fail instead of being ignored or reduced to warnings", async () => {
  const [result] = await lint.lintText(
    'const unused: string = "fail";\nexport {};',
    { filePath: "features/lint-regression.ts" },
  );
  assert.ok(
    result.messages.some(
      ({ ruleId, severity }) =>
        ruleId === "@typescript-eslint/no-unused-vars" && severity === 2,
    ),
  );
});

test("syntax errors fail while generated Next output stays ignored", async () => {
  const [result] = await lint.lintText("export const value: = ;", {
    filePath: "features/lint-regression.ts",
  });
  assert.ok(result.fatalErrorCount > 0);
  assert.equal(await lint.isPathIgnored(`${cwd}.next/generated.ts`), true);
});
