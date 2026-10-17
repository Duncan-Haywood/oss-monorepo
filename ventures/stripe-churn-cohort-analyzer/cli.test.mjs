import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs, run, render } from "./cli.mjs";
import { sampleCsv } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;

test("parseArgs reads flags and rejects bad ones", () => {
  const o = parseArgs(["--months", "3", "--cohorts", "--max-churn", "4.5", "f.csv"]);
  assert.deepEqual([o.months, o.cohorts, o.maxChurn, o.file], [3, true, 4.5, "f.csv"]);
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["--max-churn", "x"]), /number/);
});

test("run flags churn over the threshold and not under it", () => {
  const churn = run(sampleCsv()).result.summary.logoChurn * 100;
  assert.equal(run(sampleCsv(), { maxChurn: churn + 1 }).over, false);
  assert.equal(run(sampleCsv(), { maxChurn: churn - 0.5 }).over, true);
});

test("run reports an unreadable file instead of throwing", () => {
  assert.match(run("a,b\n1,2").error, /start/i);
});

test("render prints the waterfall, findings and optional cohorts", () => {
  const { result, skipped } = run(sampleCsv());
  const plain = render(result, skipped, { months: 4 });
  assert.match(plain, /Logo churn \/ month/);
  assert.match(plain, /Findings/);
  assert.doesNotMatch(plain, /Cohort logo retention/);
  assert.match(render(result, skipped, { cohorts: true }), /Cohort logo retention/);
});

test("the executable prints --example output, honours --json and exit codes", () => {
  assert.match(execFileSync("node", [cli, "--example"], { encoding: "utf8" }), /MRR now/);
  const json = JSON.parse(execFileSync("node", [cli, "--example", "--json"], { encoding: "utf8" }));
  assert.ok(json.summary.currentMrr > 0);
  assert.equal(spawnSync("node", [cli, "--example", "--max-churn", "0.01"]).status, 1);
  assert.equal(spawnSync("node", [cli, "/nonexistent.csv"]).status, 2);
});

test("stdin works with -", () => {
  const r = spawnSync("node", [cli, "-"], { input: sampleCsv(), encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Revenue LTV/);
});

test("--what-if prints the churn-reduction projection and parses its value", async () => {
  const { parseArgs, run, render } = await import("./cli.mjs");
  const { sampleCsv } = await import("./calc.mjs");
  const opts = parseArgs(["--what-if", "1.5", "--example"]);
  assert.equal(opts.whatIf, 1.5);
  const { result, skipped, subs } = run(sampleCsv(), opts);
  assert.match(render(result, skipped, { ...opts, subs }), /What if monthly churn fell 1.5 point/);
});
