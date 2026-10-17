import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/inventory.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };
const AS_OF = ["--as-of", "2026-10-01"];

test("analyze prints class costs, the saving table, findings and a lifecycle JSON; exit 0 by default", async () => {
  const r = await run(["analyze", "inventory.csv", ...AS_OF], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Current monthly storage cost by class/);
  assert.match(r.output, /Glacier Deep Archive \(day 180\)/);
  assert.match(r.output, /avoidable-waste/);
  assert.match(r.output, /"ObjectSizeGreaterThan": 131071/);
});

test("--fail-on warn exits 1 above the waste threshold and 0 below it", async () => {
  assert.equal((await run(["analyze", "p", ...AS_OF, "--fail-on", "warn"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "p", ...AS_OF, "--fail-on", "warn", "--waste-threshold", "100000"], io)).exitCode, 0);
});

test("--json is parseable; --retrieval-pct and --region-multiplier and --prices change the numbers", async () => {
  const j = JSON.parse((await run(["analyze", "p", ...AS_OF, "--json"], io)).output);
  assert.equal(j.summary.status, "warn");
  assert.equal(j.best.id, "DEEP_ARCHIVE");
  assert.ok(j.pricesAsOf.includes("not a bill"));
  const heavy = JSON.parse((await run(["analyze", "p", ...AS_OF, "--json", "--retrieval-pct", "100"], io)).output);
  assert.ok(heavy.candidates[0].filtered.net < j.candidates[0].filtered.net);
  const dear = JSON.parse((await run(["analyze", "p", ...AS_OF, "--json", "--region-multiplier", "2"], io)).output);
  assert.ok(Math.abs(dear.monthlyNow - 2 * j.monthlyNow) < 1e-6);
  const prices = { readFile: async (p) => (p === "pr.json" ? JSON.stringify({ storage: { STANDARD: 0.046 } }) : text) };
  const pricey = JSON.parse((await run(["analyze", "x", ...AS_OF, "--json", "--prices", "pr.json"], prices)).output);
  assert.ok(pricey.monthlyNow > j.monthlyNow);
});

test("bad input exits 2; stdin works; no args prints usage", async () => {
  assert.equal((await run(["analyze", "p"], { readFile: async () => "no inventory here" })).exitCode, 2);
  assert.equal((await run(["analyze"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--retrieval-pct", "200"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--region-multiplier", "0"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--fail-on", "maybe"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--as-of", "yesterday"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "-", ...AS_OF], { stdin: async () => text })).exitCode, 0);
  assert.equal((await run([], io)).exitCode, 1);
});

test("the real process reads the file", () => {
  const p = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname, ...AS_OF, "--fail-on", "warn"], { encoding: "utf8" });
  assert.equal(p.status, 1);
  assert.match(p.stdout, /Net 12-month saving per action/);
});
