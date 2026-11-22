// Hand-written cases for resolve.mjs, most of them the examples in Node's
// "Modules: Packages" documentation (doc/api/packages.md). The random
// differential test against Node itself is resolve.diff.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveExports, resolveImports, resolveSpecifier, patternKeyCompare, DEFAULT_CONDITIONS } from "./resolve.mjs";

const file = (r) => (r.ok ? r.file : r.code);

test("subpath patterns, with a null block that wins over a less specific pattern", () => {
  // packages.md, "Subpath patterns".
  const exports = {
    "./features/*.js": "./src/features/*.js",
    "./features/private-internal/*": null,
  };
  assert.equal(file(resolveExports(exports, "./features/x.js")), "./src/features/x.js");
  assert.equal(file(resolveExports(exports, "./features/y/y.js")), "./src/features/y/y.js");
  assert.equal(file(resolveExports(exports, "./features/private-internal/m.js")), "ERR_PACKAGE_PATH_NOT_EXPORTED");
});

test("an exact key beats a pattern; a longer pattern base beats a shorter one", () => {
  const exports = { "./*": "./a/*.js", "./lib/*": "./b/*.js", "./lib/x": "./c.js" };
  assert.equal(file(resolveExports(exports, "./lib/x")), "./c.js");
  assert.equal(file(resolveExports(exports, "./lib/y")), "./b/y.js");
  assert.equal(file(resolveExports(exports, "./other")), "./a/other.js");
  assert.equal(patternKeyCompare("./lib/*", "./*"), -1);
  assert.equal(patternKeyCompare("./*.js", "./*"), -1); // same base, longer key
});

test("conditions are tried in the map's order, not the runtime's", () => {
  const exports = { ".": { default: "./d.js", import: "./i.js" } };
  assert.equal(file(resolveExports(exports, ".")), "./d.js");
  const ordered = { ".": { import: "./i.js", require: "./r.js", default: "./d.js" } };
  assert.equal(file(resolveExports(ordered, ".", { conditions: DEFAULT_CONDITIONS.import })), "./i.js");
  assert.equal(file(resolveExports(ordered, ".", { conditions: DEFAULT_CONDITIONS.require })), "./r.js");
  assert.equal(file(resolveExports(ordered, ".", { conditions: ["browser"] })), "./d.js");
});

test("a nested condition with no match falls through to the next key", () => {
  const exports = { node: { import: "./n.mjs" }, default: "./d.js" };
  assert.equal(file(resolveExports(exports, ".", { conditions: ["node", "require"] })), "./d.js");
  assert.equal(file(resolveExports({ node: { import: "./n.mjs" } }, ".", { conditions: ["node", "require"] })), "ERR_PACKAGE_PATH_NOT_EXPORTED");
});

test("fallback arrays skip invalid targets but stop at the first valid one", () => {
  assert.equal(file(resolveExports({ ".": ["invalid:x", "./ok.js"] }, ".")), "./ok.js");
  assert.equal(file(resolveExports({ ".": ["dist/x.js", "./ok.js"] }, ".")), "./ok.js");
  assert.equal(file(resolveExports({ ".": ["dist/x.js"] }, ".")), "ERR_INVALID_PACKAGE_TARGET");
  assert.equal(file(resolveExports({ ".": [] }, ".")), "ERR_PACKAGE_PATH_NOT_EXPORTED");
});

test("targets that leave the package or name another package are invalid", () => {
  for (const t of ["dist/index.js", "other-pkg", "../x.js", "/x.js", "./a/../b.js", "./node_modules/x.js", "./%2e%2e/x.js"]) {
    assert.equal(file(resolveExports({ ".": t }, ".")), "ERR_INVALID_PACKAGE_TARGET", t);
  }
});

test("the part a pattern fills in cannot add .. or node_modules", () => {
  const exports = { "./*": "./src/*.js" };
  assert.equal(file(resolveExports(exports, "./../secret")), "ERR_INVALID_MODULE_SPECIFIER");
  assert.equal(file(resolveExports(exports, "./node_modules/x")), "ERR_INVALID_MODULE_SPECIFIER");
  assert.equal(file(resolveExports(exports, "./a%2fb")), "ERR_INVALID_MODULE_SPECIFIER");
});

test("mixing . keys with condition keys is a config error for every subpath", () => {
  const r = resolveExports({ ".": "./a.js", import: "./b.js" }, ".");
  assert.equal(r.code, "ERR_INVALID_PACKAGE_CONFIG");
  assert.equal(resolveExports({ ".": { 0: "./a.js" } }, ".").code, "ERR_INVALID_PACKAGE_CONFIG");
});

test("sugar: a string, array or condition map is the \".\" export only", () => {
  assert.equal(file(resolveExports("./i.js", ".")), "./i.js");
  assert.equal(file(resolveExports("./i.js", "./other")), "ERR_PACKAGE_PATH_NOT_EXPORTED");
  assert.equal(file(resolveExports({ import: "./i.js" }, ".")), "./i.js");
});

test("imports: # names, patterns and external packages", () => {
  // packages.md, "Subpath imports".
  const imports = { "#dep": { node: "dep-node-native", default: "./dep-polyfill.js" }, "#internal/*.js": "./src/internal/*.js" };
  assert.deepEqual(resolveImports(imports, "#dep").external, "dep-node-native");
  assert.equal(file(resolveImports(imports, "#dep", { conditions: ["browser"] })), "./dep-polyfill.js");
  assert.equal(file(resolveImports(imports, "#internal/z.js")), "./src/internal/z.js");
  assert.equal(file(resolveImports(imports, "#nope")), "ERR_PACKAGE_IMPORT_NOT_DEFINED");
  assert.equal(file(resolveImports(imports, "#")), "ERR_INVALID_MODULE_SPECIFIER");
  assert.equal(file(resolveImports(imports, "#/x")), "ERR_INVALID_MODULE_SPECIFIER");
});

test("resolveSpecifier: package name, subpath, #import, other package", () => {
  const pkg = { name: "@scope/lib", exports: { ".": "./i.js", "./f": "./f.js" }, imports: { "#u": "./u.js" } };
  assert.equal(resolveSpecifier(pkg, "@scope/lib").file, "./i.js");
  assert.equal(resolveSpecifier(pkg, "@scope/lib/f").file, "./f.js");
  assert.equal(resolveSpecifier(pkg, "./f").file, "./f.js");
  assert.equal(resolveSpecifier(pkg, "#u").file, "./u.js");
  assert.equal(resolveSpecifier(pkg, "react").code, "NOT_THIS_PACKAGE");
  assert.equal(resolveSpecifier({ name: "x", exports: "./i.js" }, "#u", { mode: "require" }).code, "NO_IMPORTS");
  assert.equal(resolveSpecifier({ name: "x" }, "x").code, "NO_EXPORTS");
});

test("trace and warnings explain the decision", () => {
  const r = resolveSpecifier({ name: "l", exports: { "./*": { types: "./t/*.d.ts", import: "./e/*.js" } } }, "l/a", { extraConditions: [] });
  assert.equal(r.file, "./e/a.js");
  assert.deepEqual(r.trace, ['pattern key "./*" is the most specific match, with "*" = "a"', 'condition "import" applies', 'value "./e/*.js"']);
  const w = resolveExports({ "./a/*": "./src//*.js" }, "./a/x");
  assert.equal(w.file, "./src//x.js");
  assert.match(w.warnings[0], /DEP0166/);
});
