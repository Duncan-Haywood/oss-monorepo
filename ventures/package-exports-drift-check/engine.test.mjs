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
  checkWildcards,
  exportsConfigErrors,
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

test("classifyExportEntries: splits literal, wildcard, invalid", () => {
  const entries = extractExportEntries({
    ".": "./index.js",
    "./features/*": "./src/features/*.js",
    "./polyfill": "some-other-package/polyfill",
  });
  const { literal, wildcard, invalid } = classifyExportEntries(entries);
  assert.deepEqual(literal.map((e) => e.target), ["./index.js"]);
  assert.deepEqual(wildcard.map((e) => e.target), ["./src/features/*.js"]);
  // Node: ERR_INVALID_PACKAGE_TARGET, "targets must start with "./"".
  assert.deepEqual(invalid.map((e) => e.target), ["some-other-package/polyfill"]);
  assert.match(invalid[0].reason, /only "imports" can/);
});

test("classifyExportEntries: targets Node refuses are invalid, not literal", () => {
  for (const target of ["../outside.js", "dist/index.js", "/abs/index.js", "./dist/../index.js", "./node_modules/x/index.js", "https://example.com/x.js"]) {
    const { literal, invalid } = classifyExportEntries([{ subpath: ".", condition: null, target }]);
    assert.equal(literal.length, 0, target);
    assert.equal(invalid.length, 1, target);
  }
});

test("classifyExportEntries: a * target under an exact key is a literal file name", () => {
  const { literal, wildcard } = classifyExportEntries([{ subpath: "./all", condition: null, target: "./dist/*.js" }]);
  assert.equal(literal.length, 1);
  assert.equal(wildcard.length, 0);
});

test("checkWildcards: every * takes the same non-empty text", () => {
  const files = new Set(["src/a/a.js", "src/a/b.js", "src/c.js", "src/.js"]);
  const [w] = checkWildcards([{ subpath: "./*", condition: null, target: "./src/*/*.js" }], files);
  assert.deepEqual(w.reached, ["src/a/a.js"]);
  assert.deepEqual(w.examples, [{ file: "src/a/a.js", subpath: "./a" }]);
  const [v] = checkWildcards([{ subpath: "./x/*", condition: null, target: "./src/*.js" }], files);
  assert.deepEqual(v.reached, ["src/a/a.js", "src/a/b.js", "src/c.js"]);
});

test("exportsConfigErrors: mixed keys and numeric condition keys", () => {
  assert.equal(exportsConfigErrors({ ".": "./a.js", "./b": "./b.js" }).length, 0);
  assert.match(exportsConfigErrors({ ".": "./a.js", import: "./b.js" })[0], /ERR_INVALID_PACKAGE_CONFIG/);
  assert.match(exportsConfigErrors({ ".": { 0: "./a.js", default: "./b.js" } })[0], /numeric key "0"/);
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

test("summarize: lists every kind of problem", () => {
  const { status, text } = summarize({ missing: [{}], matched: [{}] }, { wildcardCount: 2, invalidCount: 1, unmatchedWildcardCount: 1, configErrorCount: 1 });
  assert.equal(status, "missing");
  assert.match(text, /1 map-level error.*1 export target.*1 target\(s\) Node refuses.*1 wildcard target\(s\) match no listed file/);
});

test("summarize: wildcards that reach files count as checked", () => {
  const { status, text } = summarize({ missing: [], matched: [] }, { wildcardCount: 1 });
  assert.equal(status, "ok");
  assert.match(text, /1 wildcard target\(s\) each reach at least one file/);
});

// Red team 2026-11-22 (mutants that escaped, and a real defect).
test("classifyExportEntries: '..' and '../x' both read as outside the package", () => {
  for (const target of ["..", "../x.js"]) {
    const { invalid } = classifyExportEntries([{ subpath: ".", condition: null, target }]);
    assert.match(invalid[0].reason, /outside the package/, target);
  }
});

test("classifyExportEntries: a folder-mapping key ('./lib/') is dead in Node 17+, not a file to look for", () => {
  const { literal, invalid } = classifyExportEntries(extractExportEntries({ ".": "./i.js", "./lib/": "./lib/" }));
  assert.deepEqual(literal.map((e) => e.target), ["./i.js"]);
  assert.deepEqual(invalid.map((e) => e.subpath), ["./lib/"]);
  assert.match(invalid[0].reason, /"\.\/lib\/\*"/);
});

test("checkWildcards: a file Node refuses to reach (node_modules or '.' in the * part) does not count", () => {
  const files = new Set(["dist/node_modules/x.js", "dist/a/./b.js"]);
  const [w] = checkWildcards([{ subpath: "./*", condition: null, target: "./dist/*.js" }], files);
  assert.deepEqual(w.reached, []);
  const [v] = checkWildcards([{ subpath: "./*", condition: null, target: "./dist/*.js" }], new Set(["dist/node_modules/x.js", "dist/ok.js"]));
  assert.deepEqual(v.reached, ["dist/ok.js"]);
});

test("exportsConfigErrors: array-index keys stop at 4294967294, as in Node", () => {
  assert.equal(exportsConfigErrors({ ".": { 4294967294: "./a.js" } }).length, 1);
  assert.equal(exportsConfigErrors({ ".": { 4294967295: "./a.js" } }).length, 0);
  assert.equal(exportsConfigErrors({ ".": { "01": "./a.js", "-1": "./b.js" } }).length, 0);
});
