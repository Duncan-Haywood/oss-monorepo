import { test } from "node:test";
import assert from "node:assert/strict";
import { run, parseArgs, csvCell, HELP } from "./cli.mjs";
import { EXAMPLE_CSV } from "./example-data.mjs";

test("--example prints the reading, the model, the estimates and balance", () => {
  const r = run(["--example"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Estimated average treatment effect/);
  assert.match(r.out, /ATE Doubly robust \(AIPW\)\s+0\.8856/);
  assert.match(r.out, /Raw|Difference in means/);
  assert.match(r.out, /Balance under the ATE weights/);
  assert.match(r.out, /prior_earnings/);
});

test("stdin, ATT, no replacement, JSON out", () => {
  const r = run(["-", "--treatment", "trained", "--outcome", "earnings_after", "--covariates", "age,education_years,married,unemployed_last_year,prior_earnings", "--estimand", "att", "--no-replace", "--json"], EXAMPLE_CSV);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.options.estimand, "att");
  assert.equal(j.options.replace, false);
  assert.ok(Math.abs(j.estimates.att.ipw.estimate - 1.488754574) < 1e-6);
});

test("--csv prints the estimates table; --scores one row per unit", () => {
  const r = run(["--example", "--csv"]);
  assert.equal(r.code, 0);
  const lines = r.out.split("\n");
  assert.equal(lines[0], "estimand,method,estimate,se,ci_low,ci_high,p_value,mean_control,mean_treated,error");
  assert.equal(lines.length, 11);
  const s = run(["--example", "--scores"]);
  assert.equal(s.out.split("\n").length, 2001);
});

test("bad options exit 2, bad data exit 1", () => {
  assert.equal(run(["--estimand", "late"]).code, 2);
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["--caliper"]).code, 2);
  const r = run(["-", "--treatment", "missing", "--outcome", "earnings_after", "--covariates", "age"], EXAMPLE_CSV);
  assert.equal(r.code, 1);
  assert.match(r.err, /No column named "missing"/);
  assert.match(HELP, /Rosenbaum/);
  assert.equal(parseArgs(["--caliper=0.1"]).caliper, 0.1);
});

test("csv cells are guarded against formula injection", () => {
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-0.5"), "-0.5");
});
