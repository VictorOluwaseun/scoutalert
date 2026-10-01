import { parse } from "@babel/parser";
import { dirname, relative, resolve } from "node:path";

const coreName = "@repo/core";
const adaptersName = "@repo/adapters";
const workflowsName = "@repo/workflows";
const protectedPackages = new Set([coreName, adaptersName, workflowsName]);
const coreTooling = new Set([
  "@repo/eslint-config",
  "@repo/typescript-config",
  "@types/node",
  "@vitest/coverage-v8",
  "eslint",
  "typescript",
  "vitest",
]);
const runtimeSections = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
];

/** Returns violations in runtime ownership and the protected packages' export surfaces. */
export function checkManifest(workspace) {
  const { manifest, directory } = workspace;
  const violations = [];
  const runtimeDependencies = runtimeSections.flatMap((section) =>
    Object.entries(manifest[section] ?? {}),
  );

  for (const [dependency, version] of runtimeDependencies) {
    const message = checkRuntimeDependency(manifest.name, dependency, version);

    if (message) {
      violations.push(`${directory}/package.json: ${message}`);
    }
  }

  const toolingDependencies =
    manifest.name === coreName
      ? Object.keys(manifest.devDependencies ?? {})
      : [];

  for (const dependency of toolingDependencies) {
    if (coreTooling.has(dependency)) {
      continue;
    }

    violations.push(
      `${directory}/package.json: Core development dependency ${dependency} is not approved tooling.`,
    );
  }

  if (!protectedPackages.has(manifest.name)) {
    return violations;
  }

  if (!manifest.exports || typeof manifest.exports !== "object") {
    violations.push(
      `${directory}/package.json: Declare explicit feature exports; use {} before features exist.`,
    );

    return violations;
  }

  for (const entry of Object.keys(manifest.exports)) {
    if (/^\.\/[a-z][a-z0-9-]*$/.test(entry)) {
      continue;
    }

    violations.push(
      `${directory}/package.json: Export ${entry} must be a single named feature, without a root barrel or wildcard.`,
    );
  }

  return violations;
}

/** Keeps core dependency-free and prevents infrastructure dependencies from pointing outward. */
function checkRuntimeDependency(consumer, dependency, version) {
  const workspaceReference =
    dependency.startsWith("@repo/") || /^(workspace|file|link):/.test(version);

  if (consumer === workflowsName && dependency !== "@temporalio/workflow") {
    return `Workflow definitions cannot depend on ${dependency}; keep activities and clients in the worker.`;
  }

  if (consumer === coreName) {
    return `Core cannot declare runtime dependency ${dependency}; pure additions require explicit architectural review.`;
  }

  if (
    consumer === adaptersName &&
    workspaceReference &&
    dependency !== coreName
  ) {
    return `Adapters cannot depend on workspace ${dependency}; implementations point inward to core.`;
  }

  if (
    ["web", "docs", "@repo/ui"].includes(consumer) &&
    protectedPackages.has(dependency)
  ) {
    return `${consumer} cannot depend on ${dependency}; use transport contracts and the API.`;
  }

  return null;
}

/** Checks static, type-only, re-export, CommonJS, and dynamic import syntax without executing code. */
export function checkSource(file, source, workspace, workspaces, root) {
  const ast = parse(source, {
    sourceType: "unambiguous",
    sourceFilename: file,
    createImportExpressions: true,
    plugins: ["typescript", "jsx", "decorators-legacy"],
  });
  const violations = [];

  for (const node of walk(ast)) {
    const reference = moduleReference(node);

    if (reference === undefined) {
      continue;
    }

    const specifier = literalModuleName(reference);
    const message =
      specifier === null
        ? "Use a literal module path so dependency boundaries can be checked."
        : checkImport(file, specifier, workspace, workspaces, root);

    if (message) {
      violations.push(`${file}:${node.loc.start.line}: ${message}`);
    }
  }

  return violations;
}

/** Resolves ordinary relative paths by workspace ownership rather than trusting import spelling. */
function checkImport(file, specifier, workspace, workspaces, root) {
  const consumer = workspace.manifest.name;
  const local = specifier.startsWith(".") || specifier.startsWith("/");
  const destination = local ? resolve(root, dirname(file), specifier) : null;
  const target = local
    ? workspaces.find((item) =>
        isWithin(resolve(root, item.directory), destination),
      )
    : workspaces.find(
        (item) =>
          specifier === item.manifest.name ||
          specifier.startsWith(`${item.manifest.name}/`),
      );

  if (local && protectedPackages.has(consumer) && target !== workspace) {
    return `${consumer} cannot import outside its workspace via ${specifier}.`;
  }

  if (
    local &&
    target !== workspace &&
    protectedPackages.has(target?.manifest.name)
  ) {
    return `Import ${target.manifest.name} through a declared feature export, not ${specifier}.`;
  }

  if (local) {
    return null;
  }

  if (consumer === workflowsName && specifier !== "@temporalio/workflow") {
    return `Workflow definitions cannot import ${specifier}; use serializable local contracts.`;
  }

  if (
    consumer === coreName &&
    target?.manifest.name !== coreName &&
    !isCoreToolImport(file, specifier, workspace)
  ) {
    return `Core cannot import ${specifier}; depend on inward contracts and pure local modules.`;
  }

  if (
    consumer === adaptersName &&
    target &&
    ![coreName, adaptersName].includes(target.manifest.name)
  ) {
    return `Adapters cannot import workspace ${target.manifest.name}; compose applications outside adapters.`;
  }

  if (
    ["web", "docs", "@repo/ui"].includes(consumer) &&
    protectedPackages.has(target?.manifest.name)
  ) {
    return `${consumer} cannot import ${specifier}; use transport contracts and the API.`;
  }

  if (!protectedPackages.has(target?.manifest.name)) {
    return null;
  }

  const entry = `.${specifier.slice(target.manifest.name.length)}`;

  if (
    !/^\.\/[a-z][a-z0-9-]*$/.test(entry) ||
    !Object.hasOwn(target.manifest.exports ?? {}, entry)
  ) {
    return `${specifier} is not a declared public feature export.`;
  }

  if (
    target !== workspace &&
    !Object.hasOwn(workspace.manifest.dependencies ?? {}, target.manifest.name)
  ) {
    return `Declare ${target.manifest.name} as a workspace dependency before importing its features.`;
  }

  return null;
}

/** Allows explicitly declared test/config tooling without granting production code those imports. */
function isCoreToolImport(file, specifier, workspace) {
  const testFile =
    /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|\/(?:test|tests|__tests__)\/)/.test(
      file,
    );
  const configFile = /\/(?:eslint|vitest)\.config\.[cm]?[jt]s$/.test(file);

  if (
    testFile &&
    ["node:test", "node:assert", "node:assert/strict"].includes(specifier)
  ) {
    return true;
  }

  if (!testFile && !configFile) {
    return false;
  }

  const dependency = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];

  return (
    coreTooling.has(dependency) &&
    Object.hasOwn(workspace.manifest.devDependencies ?? {}, dependency)
  );
}

/** Tests containment without accepting sibling paths with a shared name prefix. */
function isWithin(directory, file) {
  const path = relative(directory, file);

  return (
    path === "" ||
    (!path.startsWith("../") && path !== ".." && !path.startsWith("/"))
  );
}

/** Extracts a module operand, including TypeScript imports that disappear at runtime. */
function moduleReference(node) {
  if (
    [
      "ImportDeclaration",
      "ExportNamedDeclaration",
      "ExportAllDeclaration",
      "ImportExpression",
    ].includes(node.type)
  ) {
    return node.source ?? undefined;
  }

  if (node.type === "TSImportType") {
    return node.source;
  }

  if (node.type === "TSExternalModuleReference") {
    return node.expression;
  }

  if (node.type !== "CallExpression") {
    return undefined;
  }

  if (node.callee.type === "Identifier" && node.callee.name === "require") {
    return node.arguments[0];
  }

  if (
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "require" &&
    node.callee.property.name === "resolve"
  ) {
    return node.arguments[0];
  }

  return undefined;
}

/** Accepts constant strings/templates and refuses computed loading paths. */
function literalModuleName(node) {
  if (node.type === "StringLiteral") {
    return node.value;
  }

  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }

  return null;
}

/** Traverses syntax nodes while skipping location, comment, and parser metadata. */
function* walk(node) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") {
    return;
  }

  yield node;

  for (const value of Object.values(node)) {
    const children = Array.isArray(value) ? value : [value];

    for (const child of children) {
      yield* walk(child);
    }
  }
}
