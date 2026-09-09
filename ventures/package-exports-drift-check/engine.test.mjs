import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePackageJson,
  extractExportEntries,
  classifyExportEntries,
  normalizePath,
  parseFileList,
  diffExports,
  summarize,
} from "./engine.mjs";

test("parsePackageJson: parses valid JSON", () => {
  const pkg = parsePackageJson('{"name":"x","exports":"./index.js"}');
  assert.equal(pkg.name, "x");
});

test("parsePackageJson: throws a readable error on invalid JSON", () => {
  assert.throws(() => parsePackageJson("{not json"), /not valid JSON/);
});

test("extractExportEntries: bare string export", () => {
  const entries = extractExportEntries("./index.js");
  assert.deepEqual(entries, [{ subpath: ".", condition: null, target: "./index.js" }]);
});

test("extractExportEntries: subpath map", () => {
  const entries = extractExportEntries({
    ".": "./index.js",
    "./feature": "./lib/feature.js",
  });
  assert.deepEqual(entries.map((e) => [e.subpath, e.target]).sort(), [
    [".", "./index.js"],
    ["./feature", "./lib/feature.js"],
  ]);
});

test("extractExportEntries: nested condition map on root", () => {
  const entries = extractExportEntries({
    import: "./esm/index.js",
    require: "./cjs/index.js",
  });
  const byTarget = Object.fromEntries(entries.map((e) => [e.target, e.condition]));
  assert.equal(byTarget["./esm/index.js"], "import");
  assert.equal(byTarget["./cjs/index.js"], "require");
  assert.ok(entries.every((e) => e.subpath === "."));
});

test("extractExportEntries: subpath map with per-subpath conditions", () => {
  const entries = extractExportEntries({
    ".": { import: "./esm/index.js", require: "./cjs/index.js", types: "./types/index.d.ts" },
    "./feature": { import: "./esm/feature.js", require: "./cjs/feature.js" },
  });
  assert.equal(entries.length, 5);
  const feature = entries.filter((e) => e.subpath === "./feature");
  assert.equal(feature.length, 2);
  assert.ok(feature.some((e) => e.condition === "import" && e.target === "./esm/feature.js"));
});

test("extractExportEntries: fallback array is flattened", () => {
  const entries = extractExportEntries({ ".": ["./a.js", "./b.js"] });
  assert.deepEqual(entries.map((e) => e.target).sort(), ["./a.js", "./b.js"]);
});

test("extractExportEntries: null leaf (explicitly blocked subpath) produces no entry", () => {
  const entries = extractExportEntries({ ".": "./index.js", "./internal/*": null });
  assert.deepEqual(entries, [{ subpath: ".", condition: null, target: "./index.js" }]);
});

test("extractExportEntries: missing/null exports field yields no entries", () => {
  assert.deepEqual(extractExportEntries(undefined), []);
  assert.deepEqual(extractExportEntries(null), []);
});

test("extractExportEntries: deeply nested subpath + condition", () => {
  const entries = extractExportEntries({
    "./feature": { node: { import: "./node-esm/feature.js" }, default: "./browser/feature.js" },
  });
  const nodeImport = entries.find((e) => e.target === "./node-esm/feature.js");
  assert.equal(nodeImport.condition, "node > import");
});

test("classifyExportEntries: splits literal, wildcard, external", () => {
  const entries = extractExportEntries({
    ".": "./index.js",
    "./features/*": "./src/features/*.js",
    "./polyfill": "some-other-package/polyfill",
  });
  const { literal, wildcard, external } = classifyExportEntries(entries);
  assert.deepEqual(literal.map((e) => e.target), ["./index.js"]);
  assert.deepEqual(wildcard.map((e) => e.target), ["./src/features/*.js"]);
  assert.deepEqual(external.map((e) => e.target), ["some-other-package/polyfill"]);
});

test("classifyExportEntries: ../ target is literal, not external", () => {
  const entries = [{ subpath: ".", condition: null, target: "../outside.js" }];
  const { literal } = classifyExportEntries(entries);
  assert.equal(literal.length, 1);
});

test("normalizePath: strips one leading ./ and normalizes backslashes", () => {
  assert.equal(normalizePath("./dist/index.js"), "dist/index.js");
  assert.equal(normalizePath("dist\\index.js"), "dist/index.js");
  assert.equal(normalizePath("  ./a.js  "), "a.js");
});

test("parseFileList: splits on newlines, skips blanks, normalizes", () => {
  const files = parseFileList("./dist/index.js\n\ndist/esm/index.js\n  \n");
  assert.deepEqual([...files].sort(), ["dist/esm/index.js", "dist/index.js"]);
});

test("diffExports: flags a literal target that fileExists() rejects", () => {
  const literal = [
    { subpath: ".", condition: null, target: "./dist/index.js" },
    { subpath: "./feature", condition: null, target: "./dist/feature.js" },
  ];
  const report = diffExports({ literal, fileExists: (t) => t === "./dist/index.js" });
  assert.deepEqual(report.matched.map((e) => e.target), ["./dist/index.js"]);
  assert.deepEqual(report.missing.map((e) => e.target), ["./dist/feature.js"]);
});

test("diffExports: missing list sorted by target", () => {
  const literal = [
    { subpath: ".", condition: null, target: "./z.js" },
    { subpath: ".", condition: null, target: "./a.js" },
  ];
  const report = diffExports({ literal, fileExists: () => false });
  assert.deepEqual(report.missing.map((e) => e.target), ["./a.js", "./z.js"]);
});

test("summarize: ok with matches and no skipped entries", () => {
  const { status, text } = summarize({ missing: [], matched: [{}, {}] });
  assert.equal(status, "ok");
  assert.match(text, /2 export target/);
  assert.doesNotMatch(text, /not checked/);
});

test("summarize: ok with nothing checkable at all", () => {
  const { status, text } = summarize({ missing: [], matched: [] });
  assert.equal(status, "ok");
  assert.match(text, /No checkable/);
});

test("summarize: missing status names the count", () => {
  const { status, text } = summarize({ missing: [{}, {}], matched: [{}] });
  assert.equal(status, "missing");
  assert.match(text, /2 export target\(s\)/);
});

test("summarize: notes skipped wildcard/external entries", () => {
  const { text } = summarize({ missing: [], matched: [{}] }, { wildcardCount: 1, externalCount: 2 });
  assert.match(text, /1 wildcard, 2 external entries not checked/);
});
