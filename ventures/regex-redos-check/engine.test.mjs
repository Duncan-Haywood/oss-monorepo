import test from "node:test";
import assert from "node:assert/strict";
import { analyzePattern, parseRegex, extractRegexes, extractJsRegexes, extractPythonRegexes, scanSource, mergeScans, summarize } from "./engine.mjs";

const rules = (src, flags = "", lang = "js") => analyzePattern(src, flags, lang).findings.map((f) => f.rule);
const severities = (src) => analyzePattern(src).findings.map((f) => f.severity);

test("classic exponential shapes are errors", () => {
  for (const p of ["(a+)+$", "^(\\w+\\s?)+$", "(a*)*b", "^(([a-z])+.)+[A-Z]([a-z])+$", "(\\s*\\w+)*$", "(x+x+)+y", "(a+b?)+$"]) {
    assert.ok(rules(p).includes("nested-quantifier"), p);
    assert.ok(severities(p).includes("error"), p);
  }
});

test("overlapping alternation under a repeat is an error", () => {
  for (const p of ["(a|aa)+$", "(\\d|\\w)+$", "(a|a)*b", "([a-z]|\\w)*x"]) assert.ok(rules(p).includes("overlapping-alternation"), p);
});

test("safe, delimited patterns are clean", () => {
  for (const p of ["^([a-z]+\\.)*[a-z]+$", '("[^"]*")*', "^(\\s*,\\s*\\w+)*$", "(a|ab)*c", "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", "(.*a){12}", "^\\d{3}-\\d{4}$", "^(a+)++$", "(?>a+)+b", "(?:foo|bar)+", "^[a-z0-9_-]{3,16}$", "(?:.|\\n)*x"]) {
    assert.deepEqual(rules(p), [], p);
  }
});

test("adjacent overlapping repeats are polynomial warnings", () => {
  for (const p of ["\\d+\\d+$", ".*.*x", "\\w+\\s*\\w+$", "^\\s*(.*?)\\s*$"]) {
    const found = analyzePattern(p).findings.find((f) => f.rule === "adjacent-overlap");
    assert.ok(found, p);
    assert.equal(found.severity, "warn");
  }
  assert.deepEqual(rules("\\d+,\\d+"), [], "a mandatory delimiter between the repeats makes it linear");
});

test("trailing repeat before $ without ^ is the quadratic trim shape", () => {
  const f = analyzePattern("\\s+$").findings.find((x) => x.rule === "quadratic-end-anchor");
  assert.equal(f.severity, "warn");
  assert.match(f.message, /Stack Overflow/);
  assert.deepEqual(rules("^\\s+$"), [], "start-anchored is fine");
  const digits = analyzePattern("\\d+$").findings.find((x) => x.rule === "quadratic-end-anchor");
  assert.equal(digits.severity, "info", "non-whitespace sets are a note, not a warning");
  assert.ok(rules("^\\s+|\\s+$").includes("quadratic-end-anchor"), "the trim idiom has an unanchored branch");
});

test("the end-anchor note is dropped when a real error already covers the pattern", () => {
  assert.deepEqual(rules("(a+)+$"), ["nested-quantifier"]);
});

test("possessive quantifiers and atomic groups are not flagged", () => {
  assert.deepEqual(rules("(a+)++$", "", "py"), []);
  assert.deepEqual(rules("(?>a+)+$", "", "py"), []);
});

test("parser handles classes, escapes, groups and lookarounds", () => {
  for (const p of ["[^\\]]+", "[\\w.-]+@[\\w.-]+", "(?<year>\\d{4})-(?<m>\\d\\d)", "(?=.*\\d)(?!.*\\s).{8,}", "\\p{L}+", "\\u00e9\\x41\\cJ", "(?:a|b){2,5}?", "a{,3}", "\\1(a)"]) {
    assert.doesNotThrow(() => parseRegex(p), p);
  }
  assert.throws(() => parseRegex("(a"), SyntaxError);
  assert.throws(() => parseRegex("a)"), SyntaxError);
  assert.throws(() => parseRegex("*a"), SyntaxError);
  const bad = analyzePattern("(a");
  assert.equal(bad.parsed, false);
  assert.equal(bad.findings[0].rule, "unparsable");
});

test("python syntax: named groups, inline flags, comments", () => {
  assert.doesNotThrow(() => parseRegex("(?P<n>\\d+)(?P=n)", { lang: "py" }));
  assert.doesNotThrow(() => parseRegex("(?i)abc(?#note)", { lang: "py" }));
  assert.ok(rules("(?P<w>a+)+$", "", "py").includes("nested-quantifier"));
});

test("case-insensitive flag makes [a-z] and [A-Z] alternatives overlap", () => {
  assert.ok(rules("([a-z]|[A-Z])+$", "i").includes("overlapping-alternation"));
  assert.deepEqual(rules("([a-z]|[A-Z])+$"), []);
});

test("extracts JS regex literals but not division, strings, comments or template text", () => {
  const src = [
    "const a = x / y / z;",
    "const r1 = /(a+)+$/i;",
    "const s = '/(b+)+$/';",
    "// const c = /(c+)+$/;",
    "/* /(d+)+$/ */",
    "const t = `/(e+)+$/`;",
    "if (/\\d+\\d+$/.test(v)) {}",
    "const cls = /[/]+/g;",
    "return /x+/;",
  ].join("\n");
  const found = extractJsRegexes(src);
  assert.deepEqual(found.map((f) => f.pattern), ["(a+)+$", "\\d+\\d+$", "[/]+", "x+"]);
  assert.equal(found[0].flags, "i");
  assert.equal(found[0].line, 2);
});

test("extracts new RegExp / RegExp strings with escapes, and flags dynamic ones", () => {
  const src = 'const a = new RegExp("(a+)+\\\\d$", "gi");\nconst b = RegExp(\'^x*$\');\nconst c = new RegExp(userInput);\nconst d = new RegExp("a" + b);';
  const found = extractJsRegexes(src);
  assert.equal(found[0].pattern, "(a+)+\\d$");
  assert.equal(found[0].flags, "gi");
  assert.equal(found[1].pattern, "^x*$");
  assert.equal(found[2].kind, "dynamic");
  assert.equal(found.length, 3, "string concatenation is not guessed at");
});

test("extracts Python re.* calls, raw strings and pattern constants", () => {
  const src = [
    "import re",
    'EMAIL_RE = r"^(\\w+\\s?)+$"',
    'm = re.match(r"(a+)+$", s)',
    "p = re.compile(r'''(x|xx)+y''')",
    'other = re.sub("\\\\s+$", "", s)',
    'name = "not a pattern"',
  ].join("\n");
  const found = extractPythonRegexes(src);
  assert.deepEqual(found.map((f) => f.pattern), ["^(\\w+\\s?)+$", "(a+)+$", "(x|xx)+y", "\\s+$"]);
  assert.equal(found[1].line, 3);
  assert.equal(extractRegexes(src, "app.py").length, 4);
  assert.equal(extractRegexes(src).length, 4, "unknown language runs both extractors");
});

test("scanSource reports file, line and pattern; mergeScans and summarize roll up", () => {
  const a = scanSource("const ok = /^[a-z]+$/;\nconst bad = /(a+)+$/;\n", "a.js");
  const b = scanSource("import re\nre.compile(r'\\\\d+\\\\d+$')\n".replace("\\\\", "\\"), "b.py");
  assert.equal(a.patterns.length, 2);
  assert.equal(a.findings.length, 1);
  assert.equal(a.findings[0].line, 2);
  assert.equal(a.findings[0].file, "a.js");
  const merged = mergeScans([a, b]);
  const s = summarize(merged);
  assert.equal(s.status, "error");
  assert.match(s.text, /likely exponential/);
  assert.equal(summarize(scanSource("const x = 1;", "c.js")).status, "none");
  assert.equal(summarize(scanSource("const x = /^a$/;", "c.js")).status, "ok");
});

test("dynamic RegExp is an info note, never a failure", () => {
  const scan = scanSource("const r = new RegExp(query);", "d.js");
  assert.equal(scan.findings[0].rule, "dynamic-regexp");
  assert.equal(summarize(scan).status, "ok");
});

test("an inner repeat that can swallow the next iteration's delimiters is an error (2026-11-15 sweep)", () => {
  // From gpx-track-check: [\s\S]*? can match "--><!--", so one comment can stand for several.
  for (const p of ["^\\s*(<\\?xml[^>]*\\?>\\s*)?(<!--[\\s\\S]*?-->\\s*)*<gpx\\b", "^(a.*b)+$", "(<b>[\\s\\S]*</b>)+x"]) {
    assert.ok(rules(p).includes("nested-quantifier"), p);
  }
  // The fixed forms, and delimiters the inner class cannot match, stay clean.
  for (const p of ["^\\s*(<!--(?:(?!-->)[\\s\\S])*-->\\s*)*<gpx\\b", '("[^"]*")+', "(\\w+\\s)+", "(?:.*\\n)*"]) assert.deepEqual(rules(p), [], p);
});

test("regexes inside a template literal's ${...} are found; the template text and a shebang are not", () => {
  const src = '#!/usr/bin/env node\nconst a = `x ${b.replace(/(\\n\\s*-{3,}\\s*)+$/, "")} y ${ {k: 1}.k } </td><td>${c}</td>`;\nconst d = /e+f/;\nconst g = `${`${/h+i/.source}`}`;\n';
  assert.deepEqual(extractJsRegexes(src).map((r) => [r.line, r.pattern]), [[2, "(\\n\\s*-{3,}\\s*)+$"], [3, "e+f"], [4, "h+i"]]);
});

// quality audit 2026-11-19 (portfolio/quality/audits/2026-11-19-regex-redos-check.json): these hung V8 and were reported clean
test("a flexible bounded count or an optional branch under a repeat is an error", () => {
  assert.ok(rules("^([a-z0-9]{2,4})+$").includes("nested-quantifier"));
  assert.ok(rules("^(a{2,4})+$").includes("nested-quantifier"));
  assert.ok(rules("^([a-zA-Z0-9_\\.\\-])+\\@(([a-zA-Z0-9\\-])+\\.)+([a-zA-Z0-9]{2,4})+$").includes("nested-quantifier"));
  assert.ok(rules("^(a|a?)+$").includes("overlapping-alternation"));
  for (const p of ["^(a{3})+$", "^(?:ab{2,4})+$", "^(a?)+$", "^(\\d{3}-)+\\d{4}$", "(a|b?)+c"]) assert.deepEqual(rules(p), [], p);
});
