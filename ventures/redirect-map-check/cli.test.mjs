import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, parseArgs } from "./cli.mjs";
import { sampleFile, sampleBrokenFile } from "./calc.mjs";

const dir = mkdtempSync(join(tmpdir(), "rmc-"));
const put = (name, text) => { const p = join(dir, name); writeFileSync(p, text); return p; };
const go = (args) => { let out = "", err = ""; const code = run(args, { out: (s) => (out += s), err: (s) => (err += s) }); return { code, out, err }; };

test("a clean map exits 0", () => {
  const r = go([put("ok.csv", sampleFile())]);
  assert.equal(r.code, 0);
  assert.match(r.out, /6 redirect\(s\) read, 0 error\(s\)/);
});

test("a broken map exits 1 and names the line", () => {
  const r = go([put("bad.csv", sampleBrokenFile())]);
  assert.equal(r.code, 1);
  assert.match(r.out, /ERROR/);
});

test("--fail-on never always exits 0", () => {
  assert.equal(go([put("bad2.csv", sampleBrokenFile()), "--fail-on", "never"]).code, 0);
});

test("--json prints parseable JSON", () => {
  const j = JSON.parse(go([put("bad3.csv", sampleBrokenFile()), "--json"]).out);
  assert.ok(j.findings.length > 0);
});

test("--format with --out writes the flattened map", () => {
  const out = join(dir, "_redirects");
  go([put("ok2.csv", sampleFile()), "--format", "netlify", "--out", out]);
  assert.match(readFileSync(out, "utf8"), /^\/about-us {2}\/about {2}301!/m);
});

test("bad usage exits 2", () => {
  assert.equal(go([]).code, 2);
  assert.equal(go(["x.csv", "--nope"]).code, 2);
  assert.equal(go(["x.csv", "--format", "xml"]).code, 2);
  assert.equal(go([join(dir, "missing.csv")]).code, 2);
  assert.throws(() => parseArgs(["a", "b"]));
});
