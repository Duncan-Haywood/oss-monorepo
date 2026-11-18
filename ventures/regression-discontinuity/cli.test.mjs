import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run, parseArgs, csvCell, HELP } from "./cli.mjs";

const fuzzy = readFileSync(new URL("eval/fuzzy.csv", import.meta.url), "utf8");

test("--example prints the reading, the estimates and the checks", () => {
  const r = run(["--example"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Estimated jump in the outcome at the cutoff/);
  assert.match(r.out, /Robust\s+0\.0870/);
  assert.match(r.out, /Placebo cutoffs/);
  assert.match(r.out, /prior_share/);
  assert.match(r.out, /McCrary/);
});

test("fuzzy design from stdin, fixed bandwidth, JSON out", () => {
  const r = run(["-", "--running", "score", "--outcome", "outcome", "--treatment", "treated", "--h", "0.4", "--b", "0.6", "--json"], fuzzy);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.bandwidth.chosen, "given");
  assert.ok(Math.abs(j.conventional.estimate - 0.71489) < 1e-5);
  assert.ok(j.firstStage.conventional > 0.3);
});

test("--csv prints the sweep with a header", () => {
  const r = run(["--example", "--csv"]);
  assert.equal(r.code, 0);
  const lines = r.out.split("\n");
  assert.equal(lines[0], "h,estimate,robust_estimate,robust_ci_low,robust_ci_high,observations_in_h");
  assert.equal(lines.length, 10);
});

test("bad options exit 2, bad data exit 1", () => {
  assert.equal(run(["--kernel", "gaussian"]).code, 2);
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["--h"]).code, 2);
  const r = run(["-", "--running", "missing", "--outcome", "outcome"], fuzzy);
  assert.equal(r.code, 1);
  assert.match(r.err, /No column named "missing"/);
  assert.match(HELP, /Calonico/);
  assert.deepEqual(parseArgs(["--cutoff=-2"]).cutoff, -2);
});

test("csv cells are guarded against formula injection", () => {
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-0.5"), "-0.5");
});
