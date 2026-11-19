import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, buildDesign, parseCsv, logNormCdf, logNormSf, mills, normsf, heckmanLogLik, probit, olsSelected, twoStep, heckmanMLE, PAPERS } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";

const close = (a, b, tol, what = "") => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what} ${a} vs ${b}`);

test("normal tails: log Phi stays finite and accurate far out, and the Mills ratio tends to -t", () => {
  // Phi(-10) = 7.619853024160527e-24 (standard tables); log of it
  close(logNormCdf(-10), Math.log(7.619853024160527e-24), 1e-13, "log Phi(-10)");
  close(Math.exp(logNormSf(3)), normsf(3), 1e-13, "sf(3) both ways");
  close(Math.exp(logNormSf(2.5)), normsf(2.5), 1e-13, "sf(2.5) both ways");
  assert.ok(Number.isFinite(logNormCdf(-60)));
  close(logNormCdf(-60), -1800.0 - Math.log(60) - 0.5 * Math.log(2 * Math.PI) + Math.log1p(-1 / 3600 + 3 / 3600 ** 2), 1e-9, "asymptotic log Phi(-60)");
  close(mills(-40) / 40, 1, 1e-3, "mills(-40) ~ 40");
  close(mills(0), Math.sqrt(2 / Math.PI), 1e-14, "mills(0)");
  assert.ok(mills(9) < 1e-17);
});

test("the analytic gradient agrees with finite differences of the log-likelihood", () => {
  const d = buildDesign(parseCsv(EXAMPLE_CSV).records, { outcome: "log_wage", regressors: "educ,exper", selection: "kids_under6,other_income", selected: "works" });
  const th = [1, 0.08, 0.03, -0.5, 0.1, 0.05, -0.8, -0.01, 0.4, Math.log(0.5)];
  const { grad, scores } = heckmanLogLik(d, th, { scores: true });
  for (let j = 0; j < th.length; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(th[j]));
    const up = th.slice(), dn = th.slice(); up[j] += h; dn[j] -= h;
    const fd = (heckmanLogLik(d, up).ll - heckmanLogLik(d, dn).ll) / (2 * h);
    close(grad[j], fd, 1e-5, `d/dtheta[${j}]`);
    close(scores.reduce((a, g) => a + g[j], 0), grad[j], 1e-12, `scores sum [${j}]`);
  }
});

test("the example: correction moves educ towards the true 0.085 and finds rho > 0", () => {
  const r = analyze({ ...EXAMPLE_SPEC, csv: EXAMPLE_CSV });
  assert.equal(r.n, 2000);
  assert.equal(r.n1, 1213);
  const i = r.spec.xNames.indexOf("educ");
  close(r.models.ols.terms[i].coef, 0.0745, 1e-3);
  assert.ok(Math.abs(r.models.mle.terms[i].coef - 0.085) < Math.abs(r.models.ols.terms[i].coef - 0.085));
  assert.ok(r.models.mle.terms[i].ci[0] < 0.085 && 0.085 < r.models.mle.terms[i].ci[1]);
  assert.ok(r.models.mle.rho.ci[0] < 0.6 && 0.6 < r.models.mle.rho.ci[1]);
  assert.ok(r.models.mle.tests.lr.p < 0.001);
  assert.deepEqual(r.spec.exclusions, ["kids_under6", "kids_6_18", "other_income"]);
  assert.match(r.summary, /^1213 of 2000 rows \(60\.7%\) have an observed log_wage\./);
  assert.match(r.summary, /favourably selected/);
  assert.ok(r.models.mle.converged);
  // the selection equation includes the regressors as well as the exclusions
  assert.equal(r.spec.zNames.length, 1 + 3 + 3 + 3);
});

test("without --selected, blank outcomes mark unselected rows", () => {
  const { records } = parseCsv(EXAMPLE_CSV);
  const a = buildDesign(records, { outcome: "log_wage", regressors: "educ", selection: "kids_under6" });
  const b = buildDesign(records, { outcome: "log_wage", regressors: "educ", selection: "kids_under6", selected: "works" });
  assert.deepEqual(a.s, b.s);
  assert.equal(a.n1, 1213);
});

test("two-step agrees with maximum likelihood when rho is near 0, and the tests do not reject", () => {
  // draw a small data set with independent errors
  let seed = 7;
  const u = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const nrm = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  const rows = ["y,x,z"];
  for (let i = 0; i < 1500; i++) {
    const x = nrm(), z = nrm(), s = 0.3 + 0.5 * x + 0.8 * z + nrm() > 0;
    rows.push(`${s ? (1 + 0.5 * x + 0.7 * nrm()).toFixed(5) : ""},${x.toFixed(5)},${z.toFixed(5)}`);
  }
  const r = analyze({ csv: rows.join("\n"), outcome: "y", regressors: "x", selection: "z" });
  close(r.models.mle.terms[1].coef, 0.5, 0.1);
  assert.ok(Math.abs(r.models.mle.rho.coef) < 0.25);
  assert.ok(r.models.mle.tests.lr.p > 0.01);
  assert.match(r.summary, /do not reject rho = 0/);
  close(r.models.twostep.terms[1].coef, r.models.mle.terms[1].coef, 0.05);
});

test("warnings: no exclusion restriction, text columns, dropped rows", () => {
  const lines = EXAMPLE_CSV.trim().split("\n");
  lines[5] = lines[5].replace(/,(\d+),(\d+),(\d+),/, ",$1,,$3,"); // blank exper in one row
  const r = analyze({ csv: lines.join("\n"), outcome: "log_wage", selected: "works", regressors: "educ,exper,exper_sq", selection: "" });
  assert.ok(r.notes.some((n) => /identified only by the normal distribution's shape/.test(n)));
  assert.ok(r.notes.some((n) => /1 row with a missing/.test(n)));
  assert.match(r.summary, /no exclusion restriction/);
  assert.equal(r.n, 1999);
});

test("robust and clustered errors change the standard errors but not the estimates", () => {
  const base = analyze({ ...EXAMPLE_SPEC, csv: EXAMPLE_CSV });
  const cl = analyze({ ...EXAMPLE_SPEC, csv: EXAMPLE_CSV, se: "clustered" });
  assert.equal(cl.clusters, 80);
  close(cl.models.mle.terms[1].coef, base.models.mle.terms[1].coef, 1e-9);
  assert.notEqual(cl.models.mle.terms[1].se, base.models.mle.terms[1].se);
  assert.equal(cl.models.twostep.terms[1].se, base.models.twostep.terms[1].se);
  assert.ok(cl.notes.some((n) => /two-step standard errors are the conventional/.test(n)));
  assert.equal(analyze({ ...EXAMPLE_SPEC, csv: EXAMPLE_CSV, estimator: "twostep" }).lead, "twostep");
});

test("input errors are explained", () => {
  const csv = EXAMPLE_CSV;
  assert.throws(() => analyze({ csv, outcome: "nope", regressors: "educ" }), /No column named "nope"/);
  assert.throws(() => analyze({ csv, outcome: "log_wage", regressors: "log_wage" }), /cannot also be a regressor/);
  assert.throws(() => analyze({ csv, outcome: "log_wage", regressors: "educ", selected: "region" }), /must be 0 or 1/);
  assert.throws(() => analyze({ csv, outcome: "log_wage", regressors: "educ", se: "hac" }), /se must be/);
  assert.throws(() => analyze({ csv, outcome: "log_wage", regressors: "educ", se: "clustered" }), /cluster column/);
  assert.throws(() => analyze({ csv: "y,x\n1,2\n3,4\n5,7\n", outcome: "y", regressors: "x" }), /Every row has an observed outcome/);
  assert.throws(() => analyze({ csv: "y,x\n,2\n,4\n", outcome: "y", regressors: "x" }), /No row has an observed outcome/);
  assert.throws(() => analyze({ csv: "y,x\nabc,2\n,4\n", outcome: "y", regressors: "x" }), /not a number/);
  assert.throws(() => analyze({ csv, outcome: "log_wage", regressors: "educ", alpha: 0.7 }), /alpha/);
});

test("perfect prediction of selection is reported, not looped on", () => {
  const rows = ["y,x,z"];
  for (let i = 0; i < 200; i++) { const z = i % 2; rows.push(`${z ? (1 + (i % 7) / 10).toFixed(2) : ""},${(i % 5) / 4},${z}`); }
  assert.throws(() => analyze({ csv: rows.join("\n"), outcome: "y", regressors: "x", selection: "z" }), /predicts selection perfectly/);
});

test("every paper has a DOI, what was implemented and the deviations", () => {
  assert.ok(PAPERS.length >= 6);
  for (const p of PAPERS) { assert.match(p.url, /^https:\/\/doi\.org\//); assert.ok(p.implemented.length > 40); assert.ok(p.deviations.length > 3); }
});

test("estimators run on a pre-built design (the agent entry points)", () => {
  const d = buildDesign(parseCsv(EXAMPLE_CSV).records, { outcome: "log_wage", regressors: "educ", selection: "kids_under6", selected: "works" });
  const pr = probit(d.Z, d.s), ols = olsSelected(d), two = twoStep(d, pr), m = heckmanMLE(d, { pr, two, ols });
  assert.ok(m.ll > m.llIndep);
  assert.equal(two.beta.length, 3);
});
