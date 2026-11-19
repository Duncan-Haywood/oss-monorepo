// The engine against statsmodels 0.15 and scipy (eval/reference.json, made by eval/reference.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, buildDesign, probit, olsSelected, twoStep, heckmanMLE, heckmanLogLik, analyze } from "./engine.mjs";

const here = new URL(".", import.meta.url);
const ref = JSON.parse(readFileSync(new URL("eval/reference.json", here), "utf8"));
const csv = readFileSync(new URL(ref.data, here), "utf8");
const { records } = parseCsv(csv);
const rel = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);
const vec = (a, b, tol, what) => { assert.equal(a.length, b.length, what); a.forEach((v, i) => rel(v, b[i], tol, `${what}[${i}]`)); };
const se = (cov) => cov.map((r, i) => Math.sqrt(r[i]));

for (const c of ref.cases) {
  const d = buildDesign(records, { outcome: ref.outcome, regressors: c.regressors, selection: c.selection, selected: ref.selected, cluster: ref.cluster });
  const pr = probit(d.Z, d.s);
  const two = twoStep(d, pr);
  test(`${c.name}: design columns, probit and the two-step estimator match statsmodels`, () => {
    assert.deepEqual(d.xNames, c.x_names);
    assert.deepEqual(d.zNames, c.z_names);
    vec(pr.gamma, c.probit.params, 1e-9, "probit params");
    vec(se(pr.cov), c.probit.se, 1e-8, "probit se");
    rel(pr.ll, c.probit.llf, 1e-11, "probit log L");
    rel(pr.ll0, c.probit.llnull, 1e-9, "probit null log L"); // statsmodels fits the null model iteratively; ours is closed form
    vec(two.beta, c.twostep.params, 1e-8, "two-step params");
    vec(se(two.cov), c.twostep.se, 1e-7, "two-step Heckman-Greene se");
    rel(two.sigma, c.twostep.sigma, 1e-8, "two-step sigma");
    rel(two.rho, c.twostep.rho, 1e-8, "two-step rho");
    rel(two.lamTest.stat, c.twostep.lambda_t, 1e-7, "lambda t");
    rel(two.lamR2, c.twostep.lambda_r2, 1e-9, "lambda R2");
  });
  for (const s of ["conventional", "robust", "clustered"]) {
    test(`${c.name}, ${s}: OLS on the selected rows matches statsmodels`, () => {
      const o = olsSelected(d, { se: s });
      vec(o.beta, c.ols[s].params, 1e-9, "OLS params");
      vec(se(o.cov), c.ols[s].se, 1e-8, "OLS se");
    });
  }
  test(`${c.name}: maximum likelihood matches scipy + statsmodels numerical derivatives (all three covariances)`, () => {
    const ols = olsSelected(d);
    for (const s of ["conventional", "robust", "clustered"]) {
      const m = heckmanMLE(d, { pr, two, ols, se: s });
      assert.ok(m.converged, "converged");
      vec(m.theta, c.mle.params, 1e-7, "MLE params");
      rel(m.ll, c.mle.llf, 1e-11, "MLE log L");
      rel(m.llIndep, c.mle.ll_indep, 1e-11, "independent log L");
      vec(se(m.cov), c.mle.se[s], 2e-5, `MLE se (${s})`);
      // the engine's optimum is at least as good as the reference's
      assert.ok(m.ll >= c.mle.llf - 1e-9);
      assert.ok(Math.max(...heckmanLogLik(d, m.theta).grad.map(Math.abs)) < 1e-5, "gradient at the optimum");
    }
  });
}

test("analyze() reports the same numbers it was checked on", () => {
  const c = ref.cases[0];
  const r = analyze({ csv, outcome: ref.outcome, regressors: c.regressors.join(","), selection: c.selection.join(","), selected: ref.selected });
  vec(r.models.twostep.terms.map((t) => t.coef), c.twostep.params, 1e-8, "two-step");
  vec(r.models.mle.terms.map((t) => t.se), c.mle.se.conventional.slice(0, c.x_names.length), 2e-5, "MLE se");
  rel(Math.atanh(r.models.mle.rho.coef), c.mle.params[c.x_names.length + c.z_names.length], 2e-6, "atanh rho");
});
