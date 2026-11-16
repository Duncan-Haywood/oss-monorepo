import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const cli = (args, input) => spawnSync(process.execPath, [here("./cli.mjs"), ...args], { input, encoding: "utf8" });

test("--help prints usage, the citations and the Bulletin 17C line", () => {
  const r = cli(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /An Introduction to Statistical Modeling of Extreme Values/);
  assert.match(r.stdout, /Bulletin 17C/);
  assert.equal(HELP, run(["--help"]).out);
});

test("a file of annual peaks gives the GEV table with profile intervals", () => {
  const r = cli([here("./data/potomac-annual-peaks.csv"), "--periods", "10,100"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /GEV on 96 annual maxima of "peak_cfs"/);
  assert.match(r.stdout, /\n\s+100\s+411,617\s+321,492 to 621,207/);
  assert.match(r.stdout, /Gumbel: location 100,938/);
});

test("stdin, --json and POT options work on a daily series", () => {
  const csv = readDaily();
  const j = JSON.parse(cli(["--json", "--year-start", "10", "--run-length", "7", "--no-profile", "--periods", "100"], csv).stdout);
  assert.equal(j.pot.nClusters, 51);
  assert.equal(j.block.nYears, 20);
  assert.equal(j.input.method, "both");
  const t = cli(["-", "--threshold=60000", "--no-profile", "--no-trend", "--method", "pot"], csv);
  assert.equal(t.status, 0, t.stdout);
  assert.match(t.stdout, /Peaks over 60,000/);
  assert.doesNotMatch(t.stdout, /GEV on/);
});

test("errors exit non-zero with a readable message", () => {
  const bad = cli([here("./data/potomac-annual-peaks.csv"), "--value", "nope"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /no column named "nope"/);
  assert.equal(run(["--bogus"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["--threshold", "abc"]).code, 2);
  assert.throws(() => parseArgs(["--periods"]), /needs a value/);
  assert.deepEqual(parseArgs(["d.csv", "--periods=2,100", "--json"]).returnPeriods, [2, 100]);
});

import { readFileSync } from "node:fs";
function readDaily() { return readFileSync(here("./data/potomac-daily-flow.csv"), "utf8"); }
