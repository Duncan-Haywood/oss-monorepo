import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseArgs, run, render } from "./cli.mjs";
import { sampleText } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;

test("parseArgs reads flags and rejects bad ones", () => {
  const o = parseArgs(["--horizon", "24", "--margin", "40", "--segment", "likely lost", "--csv", "f.csv"]);
  assert.deepEqual([o.horizon, o.margin, o.segment, o.csv, o.file], [24, 40, "Likely lost", true, "f.csv"]);
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["--horizon", "x"]), /number/);
  assert.throws(() => parseArgs(["--segment", "nope"]), /must be one of/);
  assert.throws(() => parseArgs(["--csv", "--json"]), /one of/);
});

test("run reports unreadable and too-small input as errors, not throws", () => {
  assert.match(run("a,b\n1,2").error, /order|column/i);
  assert.match(run("customer,date,amount\nA,2025-01-01,10\nA,2025-02-01,12\n").error, /customers/i);
});

test("a bad horizon or margin comes back as an error", () => {
  assert.match(run(sampleText(), { horizon: 99 }).error, /horizon/i);
  assert.match(run(sampleText(), { margin: 0 }).error, /margin/i);
});

test("margin scales the predicted value", () => {
  const full = run(sampleText(), { margin: 100 }).result.summary.totalClv;
  const half = run(sampleText(), { margin: 50 }).result.summary.totalClv;
  assert.ok(Math.abs(half / full - 0.5) < 1e-9);
});

test("segment filter keeps only that segment", () => {
  const all = run(sampleText()).result;
  const seg = Object.keys(all.segments)[0];
  const only = run(sampleText(), { segment: seg }).result;
  assert.equal(only.sorted.length, all.segments[seg].customers);
  assert.ok(only.sorted.every((c) => c.segment === seg));
});

test("render prints the headline, segments, findings and a customer table", () => {
  const { result, parsed } = run(sampleText());
  const text = render(result, parsed, { top: 3 });
  assert.match(text, /Predicted value/);
  assert.match(text, /Segments/);
  assert.match(text, /Findings/);
  assert.match(text, /Top 3 by predicted value/);
});

test("the CLI runs on the example, as CSV and as JSON, and fails on a missing file", () => {
  const csv = spawnSync("node", [cli, "--example", "--csv"], { encoding: "utf8" });
  assert.equal(csv.status, 0);
  assert.match(csv.stdout.split("\n")[0], /^customer,repeat_orders,/);
  const json = spawnSync("node", [cli, "--example", "--json", "--horizon", "6"], { encoding: "utf8" });
  assert.equal(json.status, 0);
  assert.equal(JSON.parse(json.stdout).summary.horizonMonths, 6);
  const missing = spawnSync("node", [cli, "/nonexistent.csv"], { encoding: "utf8" });
  assert.equal(missing.status, 2);
  const stdin = spawnSync("node", [cli, "-"], { input: sampleText(), encoding: "utf8" });
  assert.equal(stdin.status, 0);
});

test("--cac adds an acquisition payback line", () => {
  assert.equal(parseArgs(["--cac", "30", "x.csv"]).cac, 30);
  const { result, parsed } = run(sampleText(), { cac: 30, margin: 45 });
  assert.match(render(result, parsed, { cac: 30 }), /Acquisition\s+\$30\.00 paid pays back/);
  assert.ok(!/Acquisition/.test(render(result, parsed, {})));
});
