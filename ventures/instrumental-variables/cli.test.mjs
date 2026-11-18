import { test } from "node:test";
import assert from "node:assert/strict";
import { run, parseArgs, csvCell, HELP } from "./cli.mjs";
import { EXAMPLE_CSV } from "./example-data.mjs";

const SPEC = ["--outcome", "log_wage", "--endogenous", "education_years", "--instruments", "college_nearby,tuition", "--exogenous", "experience,experience_sq,black,south,urban"];

test("--example prints the reading, the four models, the first stage, tests and the AR set", () => {
  const r = run(["--example"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /2SLS estimate for education_years: 0\.0637/);
  assert.match(r.out, /OLS\s+2SLS\s+LIML\s+Fuller \(a = 1\)/);
  assert.match(r.out, /Rows: 3000 in 150 clusters/);
  assert.match(r.out, /Hansen J\s+2\.185/);
  assert.match(r.out, /Anderson-Rubin 95% set for education_years: \[0\.0186, 0\.1081\]/);
});

test("stdin, robust errors, LIML lead, JSON out", () => {
  const r = run(["-", ...SPEC, "--estimator", "liml", "--json"], EXAMPLE_CSV);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.options.se, "robust");
  assert.equal(j.lead, "liml");
  assert.match(j.summary, /^LIML estimate/);
  assert.ok(Math.abs(j.models["2sls"].terms[6].coef - 0.06368356225817706) < 1e-10);
});

test("--csv prints one row per model and term", () => {
  const r = run(["--example", "--csv"]);
  assert.equal(r.code, 0);
  const lines = r.out.split("\n");
  assert.equal(lines[0], "model,term,coef,se,stat,p_value,ci_low,ci_high");
  assert.equal(lines.length, 1 + 4 * 7);
});

test("bad options exit 2, bad data exit 1", () => {
  assert.equal(run(["--se", "hac"]).code, 2);
  assert.equal(run(["--estimator", "gmm"]).code, 2);
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["--outcome"]).code, 2);
  const r = run(["-", ...SPEC.slice(0, 4), "--instruments", "missing"], EXAMPLE_CSV);
  assert.equal(r.code, 1);
  assert.match(r.err, /No column named "missing"/);
  assert.match(HELP, /Anderson/);
  assert.equal(parseArgs(["--alpha=0.1"]).alpha, 0.1);
  assert.equal(parseArgs(["--debiased"]).debiased, true);
});

test("csv cells are guarded against formula injection", () => {
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-0.5"), "-0.5");
});
