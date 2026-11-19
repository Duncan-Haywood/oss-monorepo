// Tests for the fuzzer itself (quality audit 2026-11-19: 6 of 7 seeded bugs in it survived the 50 guards,
// which only assert "no failures"). Run: node --test platform/fuzz/repair.selftest.mjs
// Named .selftest.mjs, not .test.mjs, until the merge checklist (.github/prompts/verify-and-merge.md,
// owner-gated) lists platform/fuzz; checklist_coverage.py fails any unlisted *.test.mjs directory.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rng, mutate, checkRepair } from "./repair.mjs";

const sample = () => "name,email\nAda,ada@example.com\nBob,bob@example.com\n";
const props = (f) => f.map((x) => x.property).sort();

test("an identity repair passes", () => {
  assert.deepEqual(checkRepair({ sampleCsv: sample, repair: (t) => t, validate: () => ({}) }, { iterations: 200 }), []);
});

test("a repair that changes its own output is reported as not idempotent", () => {
  const f = checkRepair({ sampleCsv: sample, repair: (t) => t + "\n" }, { iterations: 20 });
  assert.ok(f.length >= 1);
  assert.ok(f.every((x) => x.property === "repair-not-idempotent"), JSON.stringify(props(f)));
});

test("throws in validate and repair are reported, not swallowed", () => {
  const f = checkRepair({ sampleCsv: sample, validate: () => { throw new TypeError("v"); }, repair: () => { throw new RangeError("r"); } }, { iterations: 5 });
  assert.deepEqual(props(f), ["repair-throws", "validate-throws"]);
});

test("iterations: 0 still checks the samples", () => {
  const f = checkRepair({ sampleCsv: sample, repair: (t) => t + "x" }, { iterations: 0 });
  assert.equal(f.length, 1);
  assert.match(f[0].message, /repaired sample/);
});

test("mutants differ from the sample and the run is seeded", () => {
  const a = rng(7), b = rng(7);
  const xs = Array.from({ length: 50 }, () => mutate(sample(), a));
  assert.deepEqual(xs, Array.from({ length: 50 }, () => mutate(sample(), b)));
  assert.ok(xs.filter((x) => x !== sample()).length > 40);
});

test("the generator reaches every pair of mutation operations", () => {
  const r = rng(20261118);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(`${r(6)},${r(6)}`);
  assert.equal(seen.size, 36);
  const u = rng(1);
  for (let i = 0; i < 1000; i++) { const v = u(10); assert.ok(Number.isInteger(v) && v >= 0 && v < 10); }
});

test("the CLI rejects a non-numeric --n instead of printing ok", () => {
  const cli = fileURLToPath(new URL("./repair.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [cli, "--n", "abc", "no-such-venture"], { encoding: "utf8" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
});
