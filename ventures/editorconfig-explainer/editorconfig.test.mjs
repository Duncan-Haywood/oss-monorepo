import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionHints, sectionMatches, parseFile, resolvePath, analyze, why, splitSources, reportCsv, coreOutput, legacyValue, nearKey, DEFAULTS } from "./editorconfig.mjs";

const m = (name, path, dir = "") => sectionMatches(name, dir, path);

test("a name without / matches at any depth; with / it is anchored to the file's folder", () => {
  assert.ok(m("*.c", "a.c"));
  assert.ok(m("*.c", "src/deep/a.c"));
  assert.ok(m("src/*.c", "src/a.c"));
  assert.ok(!m("src/*.c", "lib/src/a.c"));
  assert.ok(m("/src/*.c", "src/a.c"), "a leading / changes nothing when there is already a slash");
  assert.ok(m("*.c", "pkg/a.c", "pkg"));
  assert.ok(!m("src/*.c", "src/a.c", "pkg"));
  assert.ok(m("src/*.c", "pkg/src/a.c", "pkg"));
  assert.ok(!m("src/", "src/a.c"), "a name ending with / matches no file");
});

test("* stops at /, ** crosses it, /**/ matches zero or more folders", () => {
  assert.ok(m("a*.c", "abc.c"));
  assert.ok(!m("src/*", "src/a/b.c"));
  assert.ok(m("src/**", "src/a/b.c"));
  assert.ok(m("a/**/b.js", "a/b.js"));
  assert.ok(m("a/**/b.js", "a/x/y/b.js"));
  assert.ok(m("a**z.c", "a/m/z.c"));
  assert.ok(m("*", ".env"), "* matches dotfiles");
  assert.ok(!m("?.c", "ab.c"));
  assert.ok(!m("som?.c", "som/.c"));
});

test("brackets: sets, ranges, negation, a / inside makes them literal", () => {
  assert.ok(m("[ab].a", "a.a"));
  assert.ok(!m("[!ab].b", "a.b"));
  assert.ok(m("[d-g].c", "f.c"));
  assert.ok(m("[-ab].f", "-.f"));
  assert.ok(m("[\\]ab].g", "].g"));
  assert.ok(m("[ab]].g", "b].g"));
  assert.ok(m("ab[e/]cd.i", "ab[e/]cd.i"));
  assert.ok(!m("ab[e/]cd.i", "abecd.i"));
  assert.ok(m("ab[/c", "ab[/c"));
  assert.ok(m("[[]x", "[x"));
});

test("braces: alternatives, nesting, {single} is literal, numeric ranges are exact", () => {
  assert.ok(m("*.{py,js}", "a.js"));
  assert.ok(!m("*.{py,js}", "a.pyc"));
  assert.ok(m("{single}.b", "{single}.b"));
  assert.ok(!m("{single}.b", "single.b"));
  assert.ok(m("*.{md}", "x.{md}"));
  assert.ok(!m("*.{md}", "x.md"));
  assert.ok(m("a{,b}.d", "a.d"));
  assert.ok(m("{word,{also},this}.g", "{also}.g"));
  assert.ok(m("{a\\,b,cd}.txt", "a,b.txt"));
  assert.ok(m("{{,b,c{d}.i", "{{,b,c{d}.i"), "unmatched braces are literal");
  assert.ok(m("{3..120}", "15"));
  assert.ok(!m("{3..120}", "121"));
  assert.ok(!m("{3..120}", "060"));
  assert.ok(m("{-5..5}", "-3"));
  assert.ok(!m("{20..1}", "12"), "a reversed range is invalid and matches nothing");
  assert.ok(m("{1..3}{0..9}", "15"), "the matcher backtracks over how many digits a range takes");
  assert.ok(!m("{aardvark..antelope}", "agreement"));
  assert.ok(m("\\*.c", "*.c"));
  assert.ok(!m("\\*.c", "a.c"), "a backslash makes * literal");
});

test("folder names with glob characters are literal", () => {
  assert.ok(m("*.a", "path_with_special_[chars/test.a", "path_with_special_[chars"));
  assert.ok(m("*.c", "{x}/a.c", "{x}"));
});

test("parser: trimming, comments only at line start, invalid lines, BOM and CRLF", () => {
  const f = parseFile("﻿root = true\r\n[ test 7 ]\r\n  Key = Value  \r\n; c\r\nk2 = v # not a comment\r\n[*.js] # c\r\nindent_size: 4\r\n", "x/.editorconfig");
  assert.equal(f.root, true);
  assert.equal(f.dir, "x");
  assert.equal(f.sections[0].name, " test 7 ");
  assert.deepEqual(f.sections[0].pairs.map((p) => [p.key, p.value]), [["key", "Value"], ["k2", "v # not a comment"]]);
  assert.equal(f.invalid.length, 2);
  assert.match(f.invalid[0].why, /must end with \]/);
  assert.match(f.invalid[1].why, /: instead of =/);
});

test("resolution: later sections and nearer files win, root = true stops the search", () => {
  const files = splitSources("==> .editorconfig <==\nroot = true\n[*]\nindent_size = 2\nindent_style = space\n[*.py]\nindent_size = 4\n==> sub/.editorconfig <==\n[*]\nindent_size = 8\n==> iso/.editorconfig <==\nroot = true\n[*.c]\nk = v\n").map((s) => parseFile(s.text, s.file));
  const r = resolvePath(files, "a.py");
  assert.deepEqual(r.core, { indent_size: "4", indent_style: "space", tab_width: "4" });
  assert.equal(r.props.find((p) => p.key === "indent_size").overrides[0].value, "2");
  assert.equal(resolvePath(files, "sub/a.py").core.indent_size, "8");
  const iso = resolvePath(files, "iso/a.c");
  assert.deepEqual(iso.core, { k: "v" });
  assert.deepEqual(iso.skipped, [".editorconfig"]);
});

test("derived values follow the core-tests: indent_size = tab, tab_width defaults", () => {
  const f = [parseFile("root=true\n[a]\nindent_style = Tab\n[b]\nindent_style=tab\ntab_width=2\n[c]\nindent_size = tab\n")];
  assert.deepEqual(resolvePath(f, "a").core, { indent_style: "tab", indent_size: "tab" });
  assert.deepEqual(resolvePath(f, "b").core, { indent_style: "tab", tab_width: "2", indent_size: "2" });
  assert.deepEqual(resolvePath(f, "a", { version: "0.8.0" }).core, { indent_style: "tab" });
  assert.equal(coreOutput(resolvePath(f, "c")), "indent_size=tab");
});

test("legacy inline comments and key typos", () => {
  assert.equal(legacyValue("4 # four"), "4");
  assert.equal(legacyValue("v;w"), "v;w");
  assert.equal(nearKey("indent-size"), "indent_size");
  assert.equal(nearKey("trim_trailing_whitespaces"), "trim_trailing_whitespace");
  assert.equal(nearKey("insert_final_new_line"), "insert_final_newline");
  assert.equal(nearKey("quote_type"), null);
});

test("analyze on the page's example reports each planted problem", () => {
  const r = analyze(DEFAULTS);
  const kinds = r.findings.map((f) => f.kind);
  for (const k of ["inline-comment", "root-in-section", "unknown-key", "glob-single-brace", "section-unmatched"]) assert.ok(kinds.includes(k), k);
  const py = r.paths.find((p) => p.path === "tools/build.py");
  assert.equal(py.core.indent_size, "4 # pep 8");
  const md = r.paths.find((p) => p.path === "README.md");
  assert.equal(md.core.trim_trailing_whitespace, "true", "[*.{md}] does not match README.md");
  const unmatched = r.findings.find((f) => f.kind === "section-unmatched" && f.text === "[src/*.go]");
  assert.match(unmatched.detail, /\[src\/\*\*\.go\]` would match 1, e\.g\. src\/server\/main\.go/);
  assert.ok(r.findings.find((f) => f.kind === "section-unmatched" && f.text === "[*.{md}]"));
  assert.equal(r.totals.paths, 8);
});

test("findings: preamble pairs, nested root, no root, overridden pairs, invalid values", () => {
  const r = analyze({ sources: "indent_size = 2\n[*]\nindent_size = 3\nend_of_line = LF\ncharset = utf8\n[*]\nindent_size = 4\n==> sub/.editorconfig <==\nroot = true\n[*]\nk=v\n", paths: "a.c\nsub/b.c" });
  const kinds = r.findings.map((f) => f.kind);
  for (const k of ["preamble-pair", "nested-root", "no-root", "overridden-pair", "invalid-value"]) assert.ok(kinds.includes(k), k);
  assert.ok(!r.findings.some((f) => f.kind === "invalid-value" && /end_of_line/.test(f.title)), "values are case-insensitive");
  const ov = r.findings.find((f) => f.kind === "overridden-pair");
  assert.equal(ov.line, 3);
});

test("why lists files top-down and marks matching sections", () => {
  const w = why({ sources: DEFAULTS.sources, path: "packages/legacy/index.js" });
  assert.deepEqual(w.steps.map((s) => s.file), [".editorconfig", "packages/legacy/.editorconfig"]);
  assert.ok(w.steps[1].sections[0].matches);
  assert.equal(w.core["indent-size"], "4");
});

test("CSV has a row per property", () => {
  const csv = reportCsv(analyze(DEFAULTS));
  assert.match(csv, /^path,key,value,file,line,section,overrides\n/);
  assert.match(csv, /Makefile,indent_style,tab,\.editorconfig,14,Makefile,\.editorconfig:4=space/);
});

test("a trailing comma outside braces is literal and flagged (as in Linux's tools/perf section)", () => {
  const name = "tools/{perf,power,rcu,testing/kunit}/**.py,";
  assert.ok(!m(name, "tools/perf/x.py"));
  assert.ok(m(name, "tools/perf/x.py,"));
  assert.deepEqual(sectionHints(name).map((h) => h.kind), ["stray-comma"]);
  assert.deepEqual(sectionHints("*.{js,ts}").map((h) => h.kind), []);
  assert.deepEqual(sectionHints("{a\\,b,c}.txt").map((h) => h.kind), []);
});

test("keys named like Object.prototype members are ordinary unknown keys", () => {
  assert.equal(nearKey("constructor"), null);
  const r = analyze({ sources: "root = true\n[*]\nconstructor = x # y\ntoString = 1\n", paths: "a" });
  assert.equal(r.paths[0].core.constructor, "x # y");
  assert.ok(r.findings.every((f) => f.kind === "inline-comment"));
});
