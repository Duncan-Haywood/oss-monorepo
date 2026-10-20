import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseArgs, run, render } from "./cli.mjs";
import { sampleText } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;

test("parseArgs reads flags and rejects bad ones", () => {
  const o = parseArgs(["--period", "month", "--lead", "45", "--service", "97", "--keep-partial", "--csv", "f.csv"]);
  assert.deepEqual([o.period, o.lead, o.service, o.partial, o.csv, o.file], ["month", 45, 97, "keep", true, "f.csv"]);
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["--lead", "x"]), /number/);
  assert.throws(() => parseArgs(["--period", "day"]), /week or month/);
  assert.throws(() => parseArgs(["--csv", "--json"]), /one of/);
});

test("run reports unreadable and too-short input as errors, not throws", () => {
  assert.match(run("a,b\n1,2").error, /date column/i);
  assert.match(run("date,sku,quantity\n2025-01-01,A,3\n2025-01-08,A,4\n").error, /at least 12/);
});

test("a bad lead time or service level comes back as an error", () => {
  assert.match(run(sampleText(), { period: "month", lead: 0 }).error, /lead time/i);
  assert.match(run(sampleText(), { period: "month", service: 20 }).error, /service level/i);
});

test("a higher service level raises total safety stock", () => {
  const lo = run(sampleText(), { period: "month", lead: 60, service: 90 }).result.summary.totalSafetyStock;
  const hi = run(sampleText(), { period: "month", lead: 60, service: 99 }).result.summary.totalSafetyStock;
  assert.ok(hi > lo * 1.3, `${hi} vs ${lo}`);
});

test("render prints the headline, findings and a SKU table", () => {
  const { result, parsed } = run(sampleText(), { period: "month", lead: 60 });
  const text = render(result, parsed, { top: 3 });
  assert.match(text, /unseen back-test points/);
  assert.match(text, /Findings/);
  assert.match(text, /Top 3 SKUs by volume/);
});

test("the CLI runs on the example, as CSV and as JSON, and fails on a missing file", () => {
  const csv = spawnSync("node", [cli, "--example", "--csv"], { encoding: "utf8" });
  assert.equal(csv.status, 0);
  assert.match(csv.stdout.split("\n")[0], /^sku,abc,xyz,/);
  assert.equal(csv.stdout.trim().split("\n").length, 21);
  const json = spawnSync("node", [cli, "--example", "--json"], { encoding: "utf8" });
  assert.equal(json.status, 0);
  assert.equal(JSON.parse(json.stdout).summary.skus, 20);
  const missing = spawnSync("node", [cli, "/nonexistent.csv"], { encoding: "utf8" });
  assert.equal(missing.status, 2);
  const stdin = spawnSync("node", [cli, "--period", "month", "-"], { input: sampleText(), encoding: "utf8" });
  assert.equal(stdin.status, 0);
  assert.match(stdin.stdout, /SKU-/);
});
