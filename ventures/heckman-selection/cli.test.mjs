import { test } from "node:test";
import assert from "node:assert/strict";
import { run, parseArgs, csvCell, HELP } from "./cli.mjs";
import { EXAMPLE_CSV } from "./example-data.mjs";

const SPEC = ["--outcome", "log_wage", "--regressors", "educ,exper,exper_sq,region", "--selection", "kids_under6,kids_6_18,other_income"];

test("--example prints the reading, the three outcome columns, the selection equation and the rho tests", () => {
  const r = run(["--example"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^1213 of 2000 rows \(60\.7%\) have an observed log_wage\./);
  assert.match(r.out, /educ: 0\.0840 \(maximum likelihood, SE 0\.0057/);
  assert.match(r.out, /OLS \(selected\)\s+Two-step\s+Max\. likelihood/);
  assert.match(r.out, /Likelihood ratio \(MLE\)\s+19\.101/);
  assert.match(r.out, /Exclusion restrictions: kids_under6, kids_6_18, other_income\./);
});

test("stdin without a selection indicator, two-step lead, JSON out", () => {
  const r = run(["-", ...SPEC, "--estimator", "twostep", "--json"], EXAMPLE_CSV);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.n1, 1213);
  assert.equal(j.lead, "twostep");
  assert.match(j.summary, /heckman two-step/);
  assert.equal(j.probit.histogram.selected.reduce((a, b) => a + b, 0), 1213);
});

test("--csv prints every model's rows; clustered errors via flags", () => {
  const r = run(["--example", "--csv", "--se=clustered"]);
  assert.equal(r.code, 0);
  const lines = r.out.split("\n");
  assert.equal(lines[0], "model,equation,term,coef,se,z,p_value,ci_low,ci_high");
  assert.equal(lines.length, 1 + 7 + 8 + 10 + 7 + 10 + 3);
});

test("bad options exit 2, bad data exit 1", () => {
  assert.equal(run(["--se", "hac"]).code, 2);
  assert.equal(run(["--estimator", "probit"]).code, 2);
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["--outcome"]).code, 2);
  assert.equal(run(["--alpha", "0.9"]).code, 2);
  const r = run(["-", "--outcome", "log_wage", "--regressors", "missing"], EXAMPLE_CSV);
  assert.equal(r.code, 1);
  assert.match(r.err, /No column named "missing"/);
  assert.match(HELP, /Greene/);
  assert.equal(parseArgs(["--selection-only"]).union, false);
});

test("csv cells are guarded against formula injection", () => {
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-0.5"), "-0.5");
});
