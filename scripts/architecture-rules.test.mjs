import assert from "node:assert/strict";
import test from "node:test";
import { checkManifest, checkSource } from "./architecture-rules.mjs";

const root = "/workspace";
const core = {
  directory: "packages/core",
  manifest: {
    name: "@repo/core",
    exports: { "./scouts": "./src/scouts/public.ts" },
    devDependencies: { vitest: "4.1.11" },
  },
};
const adapters = {
  directory: "packages/adapters",
  manifest: {
    name: "@repo/adapters",
    exports: { "./scouts": "./src/scouts/public.ts" },
    dependencies: { "@repo/core": "workspace:*", pg: "8.23.0" },
  },
};
const api = {
  directory: "apps/api",
  manifest: {
    name: "api",
    dependencies: {
      "@repo/core": "workspace:*",
      "@repo/adapters": "workspace:*",
    },
  },
};
const web = {
  directory: "apps/web",
  manifest: { name: "web", dependencies: {} },
};
const workspaces = [core, adapters, api, web];

/** Checks a source fixture under the same workspace ownership rules as the command. */
function violations(
  workspace,
  source,
  file = `${workspace.directory}/src/example.ts`,
) {
  return checkSource(file, source, workspace, workspaces, root);
}

test("core rejects datasource SDKs across runtime, optional, peer, and development dependencies", () => {
  for (const section of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "devDependencies",
  ]) {
    assert.equal(
      checkManifest({
        ...core,
        manifest: { ...core.manifest, [section]: { kysely: "0.29.6" } },
      }).length,
      1,
      section,
    );
  }
  assert.deepEqual(checkManifest(core), []);
});

test("core catches value imports, type imports, re-exports, loaders, and TypeScript import types", () => {
  const sources = [
    'import { Pool } from "pg";',
    'import type { Kysely } from "kysely";',
    'export type { Redis } from "ioredis";',
    'export * from "@nestjs/common";',
    'const client = await import("pg");',
    'const client = require("pg");',
    'const path = require.resolve("pg");',
    'type Client = import("pg").Pool;',
    'import Client = require("pg");',
    'import "\\u0070g";',
  ];
  for (const source of sources)
    assert.equal(violations(core, source).length, 1, source);
});

test("computed module loading is rejected while constant templates are checked", () => {
  assert.match(
    violations(core, "const client = await import(provider);")[0],
    /literal module path/,
  );
  assert.match(
    violations(adapters, "const client = require(provider);")[0],
    /literal module path/,
  );
  assert.match(
    violations(core, "const client = await import(`pg`);")[0],
    /Core cannot import pg/,
  );
});

test("pure local core code passes and comments or ordinary strings do not create imports", () => {
  assert.deepEqual(
    violations(
      core,
      'import type { Scout } from "./scouts/domain/scout.js"; const description = \'import("pg")\'; // import "kysely"',
    ),
    [],
  );
  assert.deepEqual(
    violations(core, 'import type { Scout } from "@repo/core/scouts";'),
    [],
  );
});

test("core tooling is restricted to tests/configuration, including TypeScript test files", () => {
  assert.deepEqual(
    violations(
      core,
      'import { test } from "vitest";',
      "packages/core/src/scouts/scout.test.ts",
    ),
    [],
  );
  assert.deepEqual(
    violations(
      core,
      'import test from "node:test";',
      "packages/core/src/scouts/scout.spec.ts",
    ),
    [],
  );
  assert.equal(violations(core, 'import { test } from "vitest";').length, 1);
  assert.equal(
    violations(
      core,
      'import { readFile } from "node:fs";',
      "packages/core/src/scouts/scout.spec.ts",
    ).length,
    1,
  );
});

test("adapters can use SDKs and declared public core contracts", () => {
  assert.deepEqual(checkManifest(adapters), []);
  assert.deepEqual(
    violations(
      adapters,
      'import { Pool } from "pg"; import type { ScoutRepository } from "@repo/core/scouts";',
    ),
    [],
  );
});

test("adapters cannot import application code or depend on outward workspaces", () => {
  assert.equal(violations(adapters, 'import "api";').length, 1);
  assert.equal(
    violations(
      adapters,
      'import "../../api/src/app.service.js";',
      "packages/adapters/example.ts",
    ).length,
    1,
  );
  assert.equal(
    checkManifest({
      ...adapters,
      manifest: {
        ...adapters.manifest,
        dependencies: { "@repo/ui": "workspace:*" },
      },
    }).length,
    1,
  );
  assert.equal(
    checkManifest({
      ...adapters,
      manifest: { ...adapters.manifest, dependencies: { api: "workspace:*" } },
    }).length,
    1,
  );
});

test("relative paths and sibling name prefixes cannot escape the core boundary", () => {
  assert.equal(
    violations(core, 'import "../../adapters/src/client.js";').length,
    1,
  );
  assert.equal(
    violations(core, 'import "../../core-other/src/client.js";').length,
    1,
  );
  assert.equal(
    violations(
      api,
      'import "../../../packages/core/src/scouts/domain/scout.js";',
    ).length,
    1,
  );
});

test("consumers must use declared feature exports and dependencies", () => {
  assert.deepEqual(
    violations(api, 'import type { Scout } from "@repo/core/scouts";'),
    [],
  );
  for (const specifier of [
    "@repo/core",
    "@repo/core/src/scouts/public",
    "@repo/core/scouts/domain/scout",
    "@repo/core/matching",
  ]) {
    assert.equal(
      violations(api, `import "${specifier}";`).length,
      1,
      specifier,
    );
  }
  assert.equal(
    checkSource(
      "apps/api/src/example.ts",
      'import "@repo/core/scouts";',
      { ...api, manifest: { name: "api" } },
      workspaces,
      root,
    ).length,
    1,
  );
});

test("wildcard and root exports fail while dependency foundations may expose no features", () => {
  assert.deepEqual(
    checkManifest({ ...core, manifest: { name: "@repo/core", exports: {} } }),
    [],
  );
  assert.equal(
    checkManifest({ ...core, manifest: { name: "@repo/core" } }).length,
    1,
  );
  for (const entry of [".", "./*", "./scouts/private"]) {
    assert.equal(
      checkManifest({
        ...core,
        manifest: {
          name: "@repo/core",
          exports: { [entry]: "./src/index.ts" },
        },
      }).length,
      1,
      entry,
    );
  }
});

test("web cannot import core or adapters even through otherwise valid public exports", () => {
  assert.equal(violations(web, 'import "@repo/core/scouts";').length, 1);
  assert.equal(violations(web, 'import "@repo/adapters/scouts";').length, 1);
  assert.equal(
    checkManifest({
      ...web,
      manifest: {
        name: "web",
        dependencies: { "@repo/adapters": "workspace:*" },
      },
    }).length,
    1,
  );
});
