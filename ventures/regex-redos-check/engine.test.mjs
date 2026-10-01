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
