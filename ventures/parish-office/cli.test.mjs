import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const sample = new URL("./examples/sample-book.json", import.meta.url).pathname;

test("checks the sample book: high findings exit 1 and print the disclaimer", () => {
  const r = run([sample, "--today", "2026-11-03"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /\[high\] c\. 948/);
  assert.match(r.out, /\[high\] c\. 955 §1/);
  assert.match(r.out, /\[high\] c\. 956/);
  assert.match(r.out, /No warranty/);
});

test("--json, --csv, --summary and --book", () => {
  const fs = JSON.parse(run([sample, "--today", "2026-11-03", "--json"]).out);
  assert.ok(fs.every((f) => f.quote && f.canon));
  assert.match(run([sample, "--today", "2026-11-03", "--csv"]).out, /^id,received,donor/);
  assert.match(run([sample, "--today", "2026-11-03", "--summary", "2026"]).out, /received\s+5\s+\$75\.00/);
  const b = JSON.parse(run([sample, "--today", "2026-11-03", "--book", "--json"]).out);
  assert.ok(b.placed.some((p) => p.id === "2026-077" && p.massId === "2026-11-08 08:00"));
  assert.ok(b.unplaced.some((u) => u.id === "2025-118"));
});

test("lump sum and bad input", () => {
  assert.match(run(["--lump", "10500", "--offering", "1000"]).out, /^10 Masses, \$5\.00 left over/);
  assert.equal(run(["missing.json"], () => { throw new Error("no such file"); }).code, 2);
  assert.equal(run(["x.json"], () => "{not json").code, 2);
});
