const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLockfile, buildReport, toMarkdown, toJson, packageName } = require("./evidence.js");

function fixture(overrides) {
  return JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { "runtime-lib": "^1.0.0" } },
      "node_modules/runtime-lib": { version: "1.2.0" },
      "node_modules/build-tool": { version: "2.0.0", dev: true },
      "node_modules/nested-build/node_modules/nested-lib": { version: "3.0.0", dev: true },
      ...overrides,
    },
  });
}

test("packageName reads the segment after the last node_modules/", () => {
  assert.equal(packageName("node_modules/express"), "express");
  assert.equal(packageName("node_modules/foo/node_modules/bar"), "bar");
  assert.equal(packageName("node_modules/@scope/pkg"), "@scope/pkg");
  assert.equal(packageName(""), null);
  assert.equal(packageName("packages/app"), null);
});

test("classifies declared, transitive-production, and dev-only-nested components", () => {
  const report = buildReport(fixture(), "package-lock.json");
  const surfaces = Object.fromEntries(report.components.map((row) => [row.name, row.surface]));
  assert.deepEqual(surfaces, { "build-tool": "build-only", "nested-lib": "build-only", "runtime-lib": "production" });
  assert.deepEqual(report.counts, { production: 1, "build-only": 2 });
  assert.equal(report.componentCount, 3);
});

test("a package with any non-dev install location is production even if not declared", () => {
  const text = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { dependencies: {} },
      "node_modules/transitive-runtime": { version: "1.0.0" },
    },
  });
  const report = buildReport(text, "package-lock.json");
  const row = report.components.find((r) => r.name === "transitive-runtime");
  assert.equal(row.surface, "production");
  assert.match(row.reason, /production path/);
});

test("declared dependency wins even if every install location is marked dev", () => {
  const text = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { "oddly-marked": "^1.0.0" } },
      "node_modules/oddly-marked": { version: "1.0.0", dev: true },
    },
  });
  const report = buildReport(text, "package-lock.json");
  const row = report.components.find((r) => r.name === "oddly-marked");
  assert.equal(row.surface, "production");
  assert.match(row.reason, /declared by the application/);
});

test("multiple install locations for one package merge into one row with sorted versions", () => {
  const text = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { dependencies: {} },
      "node_modules/a/node_modules/chalk": { version: "5.3.0", dev: true },
      "node_modules/b/node_modules/chalk": { version: "4.1.2", dev: true },
    },
  });
  const report = buildReport(text, "package-lock.json");
  const row = report.components.find((r) => r.name === "chalk");
  assert.deepEqual(row.versions, ["4.1.2", "5.3.0"]);
  assert.equal(row.locations.length, 2);
});

test("rejects a lockfile that is not valid JSON", () => {
  assert.throws(() => buildReport("not json", "x.json"), /not valid JSON/);
});

test("rejects yarn/pnpm-shaped input (no lockfileVersion 2/3 packages map)", () => {
  const text = JSON.stringify({ lockfileVersion: 1, dependencies: {} });
  assert.throws(() => buildReport(text, "x.json"), /v2 or v3/);
});

test("entries missing a version are skipped rather than crashing", () => {
  const text = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": {},
      "node_modules/no-version": {},
    },
  });
  const report = buildReport(text, "x.json");
  assert.equal(report.componentCount, 0);
});

test("parseLockfile exposes the raw root object for callers that need it", () => {
  const { root, packages } = parseLockfile(fixture());
  assert.equal(root.lockfileVersion, 3);
  assert.ok(packages["runtime-lib"]);
});

test("markdown report includes summary counts, table rows, and the no-warranty clause", () => {
  const report = buildReport(fixture(), "package-lock.json");
  const md = toMarkdown(report);
  assert.match(md, /Production-path components: \*\*1\*\*/);
  assert.match(md, /Build-only components: \*\*2\*\*/);
  assert.match(md, /`runtime-lib`/);
  assert.match(md, /No warranty/);
});

test("JSON report round-trips through JSON.parse with the same component count", () => {
  const report = buildReport(fixture(), "package-lock.json");
  const parsed = JSON.parse(toJson(report));
  assert.equal(parsed.componentCount, report.componentCount);
  assert.equal(parsed.lockfile, "package-lock.json");
});
