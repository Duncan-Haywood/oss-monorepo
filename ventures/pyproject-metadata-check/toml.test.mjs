import { test } from "node:test";
import assert from "node:assert/strict";
import { parseToml, lineOf, TomlError } from "./toml.mjs";

test("values, tables, arrays of tables and line numbers", () => {
  const { data, lines } = parseToml('a = 1\n[project]\nname = "x" # c\nlist = [\n  1,\n  2, # two\n]\n[[project.people]]\nn = "a"\n[[project.people]]\nn = "b"\n[t]\ns = """\nline\\\n   joined"""\nlit = \'C:\\path\'\nbig = 9_007_199_254_740_993\nf = 1e3\nd = 1979-05-27T07:32:00Z\n');
  assert.equal(data.a, 1);
  assert.deepEqual(data.project.list, [1, 2]);
  assert.equal(data.project.people[1].n, "b");
  assert.equal(data.t.s, "linejoined");
  assert.equal(data.t.lit, "C:\\path");
  assert.equal(data.t.big, 9007199254740993n);
  assert.equal(data.t.f, 1000);
  assert.equal(data.t.d.$toml, "offset-datetime");
  assert.equal(lineOf(lines, ["project", "name"]), 3);
  assert.equal(lineOf(lines, ["project", "people", 1, "n"]), 11);
  assert.equal(lineOf(lines, ["project", "nothing", "here"]), 2);
});

test("errors carry the line: duplicate keys, redefined tables, frozen inline tables", () => {
  for (const [src, line] of [['a = 1\na = 2\n', 2], ['[a]\n[a]\n', 2], ['a = {b = 1}\n[a]\n', 2], ['a = {b = 1}\n[a.c]\n', 2], ['x = "unterminated\n', 1], ['[a]\nb.c = 1\n[a.b]\n', 3], ["a = 1 2\n", 1]]) {
    assert.throws(() => parseToml(src), (e) => e instanceof TomlError && e.line === line, src);
  }
});

test("dotted keys may add sub-tables under a header but not reopen it", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(parseToml("[a.b]\nc = 1\n[a]\nd = 2\n").data)), { a: { b: { c: 1 }, d: 2 } });
  assert.throws(() => parseToml("[a.b]\nc = 1\n[a]\nb.d = 2\n"));
});
