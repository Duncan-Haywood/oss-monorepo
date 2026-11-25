// The Python-regex verdicts and messages below were checked against
// CPython 3.11.18's re.compile; the YAML values against PyYAML 6.0.4's
// SafeLoader. differential/ holds the scripts that compare at scale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPythonRegex } from "./pyregex.mjs";
import { loadYaml, pyType, pyRepr, YamlError, DUP_KEYS } from "./yaml11.mjs";

test("Python regex: accepted where JavaScript would refuse, and the reverse", () => {
  const cases = {
    "(?x) a # comment": null,
    "(?P<n>a)(?P=n)": null,
    "a\\Z": null,
    "a{,3}": null,
    "a*+": null,
    "(?>a)": null,
    "[]a]": null,
    "^*": "nothing to repeat",
    "(?<n>a)": "unknown extension ?<n",
    "\\q": "bad escape \\q",
    "[\\q]": "bad escape \\q",
    "(?<=a+)b": "look-behind requires fixed-width pattern",
    "(?<=a|bc)d": "look-behind requires fixed-width pattern",
    "a(?i)b": "global flags not at the start of the expression",
    "x{3,1}": "min repeat greater than max repeat",
    "a{2}{3}": "multiple repeat",
    "(a)\\2": "invalid group reference 2",
    "(a\\1)": "cannot refer to an open group",
    "[\\d-z]": "bad character range \\d-z",
    "\\400": "octal escape value \\400 outside of range 0-0o377",
    "(?P<a>x)(?P<a>y)": "redefinition of group name 'a' as group 2; was group 1",
    "(": "missing ), unterminated subpattern",
    ")": "unbalanced parenthesis",
    "[a": "unterminated character set",
  };
  for (const [p, msg] of Object.entries(cases)) {
    const r = checkPythonRegex(p);
    if (msg === null) assert.equal(r.ok, true, p);
    else { assert.equal(r.ok, false, p); assert.equal(r.message, msg, p); }
  }
});

test("YAML 1.1 scalar typing matches PyYAML", () => {
  const v = loadYaml("a: [yes, No, on, 1, 0x1F, 017, 1:30, 6.0, 1.2.3, 1e5, 1.0e+5, 2024-01-01, '6.0', ~, v1]\n").get("a");
  assert.deepEqual(v.map(pyType), ["bool", "bool", "bool", "int", "int", "int", "int", "float", "str", "str", "float", "date", "str", "NoneType", "str"]);
  assert.equal(pyRepr(v[5]), "15");
  // A float needs a dot in YAML 1.1: these stay strings in PyYAML.
  assert.deepEqual(loadYaml("a: [08, 1e+5]\n").get("a").map(pyType), ["str", "str"]);
  assert.equal(pyRepr(v[6]), "90");
  assert.equal(pyRepr(v[7]), "6.0");
});

test("block scalars, folding and anchors", () => {
  const y = loadYaml("a: |\n  x\n  y\n\nb: >-\n  one\n  two\nc: &v 3\nd: *v\ne: \"p\n  q\"\nf: one\n  two\n");
  assert.equal(y.get("a"), "x\ny\n");
  assert.equal(y.get("b"), "one two");
  assert.equal(pyRepr(y.get("d")), "3");
  assert.equal(y.get("e"), "p q");
  assert.equal(y.get("f"), "one two");
  const m = loadYaml("a: &a {y: 1, x: 2}\nb:\n  <<: *a\n  x: 3\n").get("b");
  assert.deepEqual([...m.keys()], ["y", "x"]);
  assert.equal(pyRepr(m.get("x")), "3");
});

test("duplicate keys are kept last-wins and recorded", () => {
  const y = loadYaml("a: 1\na: 2\n");
  assert.equal(pyRepr(y.get("a")), "2");
  assert.equal(y[DUP_KEYS].length, 1);
});

test("errors PyYAML also raises", () => {
  for (const t of ["a: 1\n---\nb: 2\n", "a:\n\tb: 1\n", "a: *nope\n", "a: 1\n  b: 2\n"]) {
    assert.throws(() => loadYaml(t), YamlError, JSON.stringify(t));
  }
});

test("a \\U escape past U+10FFFF is a YamlError, not a RangeError", () => {
  assert.throws(() => loadYaml('a: "\\UFFFFFFFF"\n'), YamlError);
  assert.equal(loadYaml('a: "\\U0001F600"\n').get("a"), "😀");
});
