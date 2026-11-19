import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, why, compile, resolvePath, showValue, parseLine, parsePaths, lineEndings, attrAction, reportCsv, gitModeFor, DEFAULTS } from "./gitattributes.mjs";

const attrsOf = (sources, path, opts = {}) => {
  const { attrs } = resolvePath(compile(sources, opts), path.replace(/\/$/, ""), path.endsWith("/"));
  return Object.fromEntries([...attrs].map(([k, d]) => [k, showValue(d.value)]));
};

// Spec source: gitattributes(5), section EXAMPLES (git's
// Documentation/gitattributes.adoc). The expected values are the manual's,
// not this engine's output.
test("the worked example in gitattributes(5): t/abc", () => {
  const sources = [
    "==> .git/info/attributes <==", "a*\tfoo !bar -baz",
    "==> .gitattributes <==", "abc\tfoo bar baz",
    "==> t/.gitattributes <==", "ab*\tmerge=filfre", "abc\t-foo -bar", "*.c\tfrotz",
  ].join("\n");
  const got = attrsOf(sources, "t/abc");
  assert.equal(got.foo, "set");
  assert.equal(got.bar, "unspecified");
  assert.equal(got.baz, "unset");
  assert.equal(got.merge, "filfre");
  assert.equal(got.frotz, undefined);
});

// gitattributes(5), "Builtin macro attributes": binary is -diff -merge -text
test("the built-in binary macro, and a later token on the same line wins", () => {
  assert.deepEqual(attrsOf("*.png binary", "a.png"), { binary: "set", diff: "unset", merge: "unset", text: "unset" });
  assert.equal(attrsOf("*.x binary text", "a.x").text, "set");
  assert.equal(attrsOf("*.x text binary", "a.x").text, "unset");
  assert.equal(attrsOf("*.x -binary", "a.x").diff, undefined, "an unset macro does not expand");
});

test("a user macro replaces the built-in one; info/attributes defines macros first", () => {
  assert.deepEqual(attrsOf("[attr]binary -diff\n*.b binary", "a.b"), { binary: "set", diff: "unset" });
  const s = "==> .gitattributes <==\n*.u m1\n[attr]m1 fromroot\n==> .git/info/attributes <==\n[attr]m1 fromexclude";
  assert.deepEqual(attrsOf(s, "a.u"), { m1: "set", fromexclude: "set" });
});

test("macros in a subfolder are not allowed; ! makes an attribute unspecified and blocks lower lines", () => {
  const s = "* text=auto\n==> sub/.gitattributes <==\n[attr]sub -text\n*.s sub\n*.t !text";
  assert.deepEqual(attrsOf(s, "sub/a.s"), { sub: "set", text: "auto" });
  assert.deepEqual(attrsOf(s, "sub/a.t"), { text: "unspecified" });
});

test("lines git drops whole", () => {
  assert.equal(parseLine("!*.neg foo").reason, "negative");
  assert.equal(parseLine("*.z a/b ok").reason, "invalid-name");
  assert.equal(parseLine("*.c - ok").reason, "invalid-name");
  assert.equal(parseLine("*.c = ok").reason, "invalid-name");
  assert.equal(parseLine("*.w builtin_x").reason, "reserved-name");
  assert.equal(parseLine("*.w builtin_x", { git: "old" }).type, "rule", "git 2.43 and earlier accept builtin_ names");
  assert.equal(parseLine("[attr]x y", { macroOk: false }).reason, "macro-not-allowed");
  assert.equal(parseLine("*.l " + "a".repeat(2043)).type, "rule", "2,047 bytes is kept");
  assert.equal(parseLine("*.l " + "a".repeat(2044)).reason, "long-line", "2,048 bytes is dropped");
  assert.equal(parseLine("   # indented comment").type, "comment");
  assert.equal(parseLine("\t*.ind ind").type, "rule");
});

test("values, quoting and directory patterns", () => {
  assert.deepEqual(attrsOf("*.f a=b=c x=", "a.f"), { a: "b=c", x: "" });
  assert.deepEqual(attrsOf('"sp ace.q" quoted', "sp ace.q"), { quoted: "set" });
  assert.deepEqual(attrsOf('"caf\\303\\251.txt" q', "café.txt"), { q: "set" });
  assert.deepEqual(attrsOf("docs/ doc", "docs/a.md"), {}, "a folder pattern never reaches the files inside");
  assert.deepEqual(attrsOf("docs/ doc", "docs/"), { doc: "set" });
  assert.deepEqual(attrsOf("docs/** doc", "docs/a/b.md"), { doc: "set" });
  assert.deepEqual(attrsOf("==> n/.gitattributes <==\n/n/x anch\nx any", "n/n/x"), { anch: "set", any: "set" });
  assert.deepEqual(attrsOf("==> n/.gitattributes <==\n/n/x anch", "n/x"), {});
});

test("the ** literal-prefix change in git 2.52", () => {
  assert.deepEqual(attrsOf("/a**/x q", "ab/c/x", { git: "mid" }), { q: "set" });
  assert.deepEqual(attrsOf("/a**/x q", "ab/c/x", { git: "modern" }), {});
  assert.equal(gitModeFor("git version 2.43.0"), "old");
  assert.equal(gitModeFor("git version 2.47.1"), "mid");
  assert.equal(gitModeFor("git version 2.52.0"), "modern");
});

// convert.c convert_attrs and text_eol_is_crlf; the labels are what
// `git ls-files --eol` prints in its attr/ column (checked against git in
// gitattributes.diff.test.mjs).
test("line-ending requests and decisions", () => {
  const v = (o) => (n) => o[n];
  assert.equal(attrAction(v({ eol: "crlf" })).label, "text eol=crlf", "eol implies text");
  assert.equal(attrAction(v({ text: false, eol: "crlf" })).label, "-text");
  assert.equal(attrAction(v({ crlf: "input" })).label, "text eol=lf");
  assert.equal(attrAction(v({ text: true, eol: "CRLF" })).label, "text", "eol is compared exactly");
  assert.equal(lineEndings(v({}), { autocrlf: "true" }).checkout, "crlf");
  assert.equal(lineEndings(v({}), { autocrlf: "false" }).action, "BINARY");
  assert.equal(lineEndings(v({ text: true }), { eol: "native", platform: "windows" }).checkout, "crlf");
  assert.equal(lineEndings(v({ text: true }), { autocrlf: "input", eol: "crlf" }).checkout, "lf", "autocrlf wins over core.eol");
  assert.equal(lineEndings(v({ text: "auto" }), {}).normalise, "if text");
});

test("the example: findings a person would act on", () => {
  const r = analyze(DEFAULTS);
  const kinds = r.findings.map((f) => `${f.kind}@${f.source}:${f.line}`);
  for (const k of ["eol-value@.gitattributes:4", "folder-pattern@.gitattributes:13", "negative-pattern@.gitattributes:15",
    "macro-not-allowed@web/.gitattributes:1", "name-case@web/.gitattributes:3", "lfs-text@.gitattributes:8"]) assert.ok(kinds.includes(k), `${k} in ${kinds}`);
  const row = (p) => r.paths.find((x) => x.path === p);
  assert.equal(row("release.zip").attrs.find((a) => a.name === "text").via[0], "lfs");
  assert.equal(row("docs/guide.md").attrs.some((a) => a.name === "linguist-documentation"), false);
  assert.equal(row("vendor/ours/util.js").attrs.find((a) => a.name === "linguist-vendored").shown, "set");
  assert.equal(r.totals.high, 5);
});

test("rules that match nothing or decide nothing", () => {
  const r = analyze({ sources: "*.c text\n*.c -text\nsrc/*.h text\n", paths: "a.c\nx/src/a.h" });
  const by = Object.fromEntries(r.findings.map((f) => [f.line, f.kind]));
  assert.equal(by[1], "overridden");
  assert.equal(by[3], "matches-nothing");
  assert.equal(by[2], undefined);
});

test("typos and odd values", () => {
  const k = (s) => analyze({ sources: s }).findings.map((f) => f.kind);
  assert.ok(k("* linguist-vendor").includes("name-typo"));
  assert.ok(k("* Text").includes("name-case"));
  assert.ok(k("* text=true").includes("text-value"));
  assert.ok(k("* diff=false").includes("driver-value"));
  assert.ok(k("my file.txt text").includes("unquoted-space"));
  assert.ok(k("*.bin -text eol=lf").includes("eol-binary"));
  assert.ok(k("*.c crlf").includes("legacy-crlf"));
  assert.deepEqual(k("* text=auto\n*.png binary\n[attr]lfs filter=lfs diff=lfs merge=lfs -text\n*.zip lfs\ndist/ export-ignore"), []);
});

test("paths: ls-files --eol output, quoted names, folders, comments", () => {
  assert.deepEqual(parsePaths("i/lf    w/lf    attr/text=auto  \tsrc/a.c\n\"caf\\303\\251\"\ndocs/\n# note\n./b"), [
    { path: "src/a.c", isDir: false }, { path: "café", isDir: false }, { path: "docs", isDir: true }, { path: "b", isDir: false },
  ]);
});

test("why lists every matching line in the order git reads it", () => {
  const w = why({ sources: "* text=auto\n*.png binary\n*.png text", path: "a.png" });
  assert.deepEqual(w.steps.map((s) => s.rule.line), [3, 2, 1]);
  const t = w.steps[1].tokens;
  assert.ok(t.find((x) => x.name === "text" && !x.decided && x.by.line === 3));
  assert.equal(w.eol.label, "text");
});

test("CSV escapes formulas and commas", () => {
  const csv = reportCsv(analyze({ sources: "* a=1,2", paths: "=cmd.txt" }));
  assert.match(csv, /'=cmd\.txt/);
  assert.match(csv, /"1,2"/);
});

test("attribute names that are also Object.prototype keys are ordinary names", () => {
  const r = analyze({ sources: "* constructor toString=1 __proto__", paths: "a" });
  assert.deepEqual(r.paths[0].attrs.map((a) => `${a.name}=${a.shown}`), ["__proto__=set", "constructor=set", "toString=1"]);
  assert.deepEqual(analyze({ sources: "* text", git: "constructor" }).git, "modern");
  assert.match(reportCsv(analyze({ sources: "* n=-12.50", paths: "a" })), /,-12\.50,/);
});

test("mutation guards: folder patterns, unspecified macros, autocrlf=true with text", () => {
  assert.deepEqual(attrsOf("a/ x", "a"), {}, "a file named like the folder pattern is not matched");
  assert.deepEqual(attrsOf("a/ x", "a/"), { x: "set" });
  assert.deepEqual(attrsOf("*.x !binary", "a.x"), { binary: "unspecified" }, "an unspecified macro does not expand");
  assert.equal(lineEndings((n) => ({ text: true })[n], { autocrlf: "true" }).checkout, "crlf");
  assert.equal(lineEndings((n) => ({ text: true })[n], { autocrlf: "false", eol: "native", platform: "unix" }).checkout, "lf");
});

test("a UTF-8 byte order mark on the first line is skipped, as git skips it", () => {
  assert.deepEqual(attrsOf("\uFEFF*.c q", "a.c"), { q: "set" });
  assert.equal(parseLine("\uFEFF*.c q").pattern, "\uFEFF*.c", "only on line 1");
});
