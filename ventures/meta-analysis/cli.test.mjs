import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const cli = (args, input) => spawnSync(process.execPath, [here("./cli.mjs"), ...args], { input, encoding: "utf8" });

test("--help prints usage, the layouts and the citations", () => {
  const r = cli(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /generic-ci/);
  assert.match(r.stdout, /Meta-analysis in clinical trials/);
  assert.match(r.stdout, /not medical/);
  assert.equal(HELP, run(["--help"]).out);
});

test("the bundled trials give the REML answer, every estimator and the meta-regression", () => {
  const r = cli([here("./data/bcg-vaccine-trials.csv"), "--moderator", "ablat"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Pooled risk ratio: 0\.489 \(95% CI 0\.344 to 0\.696, p < 0\.0001\)/);
  assert.match(r.stdout, /\n  REML\s+0\.3132\s+92\.2%/);
  assert.match(r.stdout, /\n  DL\s+0\.3088/);
  assert.match(r.stdout, /slope\s+-0\.0291/);
  assert.match(r.stdout, /R-squared 75\.6%/);
});

test("stdin, --json, --measure, --method and --columns work", () => {
  const csv = readFileSync(here("./data/bcg-vaccine-trials.csv"), "utf8");
  const j = JSON.parse(cli(["--json", "--measure", "OR", "--method", "DL", "--no-loo"], csv).stdout);
  assert.equal(j.input.measure, "OR");
  assert.equal(j.input.method, "DL");
  assert.equal(j.leaveOneOut, null);
  assert.equal(j.k, 13);
  const renamed = csv.replace("tpos,tneg,cpos,cneg", "vacc_tb,vacc_ok,ctrl_tb,ctrl_ok");
  const t = cli(["-", "--layout", "cells", "--columns", "ai=vacc_tb,bi=vacc_ok,ci=ctrl_tb,di=ctrl_ok"], renamed);
  assert.equal(t.status, 0, t.stdout);
  assert.match(t.stdout, /Pooled risk ratio: 0\.489/);
});

test("errors exit non-zero with a readable message", () => {
  const bad = cli([here("./data/bcg-vaccine-trials.csv"), "--moderator", "nope"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /no moderator column named "nope"/);
  assert.equal(run(["--bogus"]).code, 2);
  assert.equal(run([], "").code, 2);
  assert.equal(run(["--confidence", "abc"]).code, 2);
  assert.throws(() => parseArgs(["--method"]), /needs a value/);
  assert.throws(() => parseArgs(["--columns", "ai"]), /ROLE=COLUMN/);
  assert.deepEqual(parseArgs(["d.csv", "--columns=ai=x,bi=y"]).columns, { ai: "x", bi: "y" });
});
