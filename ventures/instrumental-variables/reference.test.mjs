// The engine against linearmodels 7.1 (eval/reference.json, made by eval/reference.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, buildDesign, invert, cross, kClass, limlKappa, firstStage, sargan, hansenJ, exogeneityTests, controlFunctionTest, andersonRubinStat, andersonRubinSet } from "./engine.mjs";

const here = new URL(".", import.meta.url);
const ref = JSON.parse(readFileSync(new URL("eval/reference.json", here), "utf8"));
const { records } = parseCsv(readFileSync(new URL(ref.data, here), "utf8"));
// the two-endogenous case needs reference.py's constructed age column
for (const r of records) r.age = String(Number(r.education_years) + Number(r.experience) + 6 + (Number(r.person) % 3));
const rel = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);
const vec = (a, b, tol, what) => { assert.equal(a.length, b.length, what); a.forEach((v, i) => rel(v, b[i], tol, `${what}[${i}]`)); };

for (const c of ref.cases) {
  const d = buildDesign(records, { outcome: ref.outcome, endogenous: c.endog, instruments: c.instr, exogenous: c.exog, cluster: ref.cluster });
  const ZZinv = invert(cross(d.Z, d.Z));
  for (const f of c.fits) {
    const opts = { se: f.se, clusters: d.clusters, debiased: f.debiased, alpha: 0.05 };
    const label = `${c.name}, ${f.se}${f.debiased ? " debiased" : ""}`;
    test(`${label}: OLS, 2SLS, LIML and Fuller coefficients and SEs match linearmodels`, () => {
      const kL = limlKappa(d, ZZinv);
      rel(kL, f.kappa_liml, 1e-11, "LIML kappa");
      const kF = kL - 1 / (d.n - d.kz);
      rel(kF, f.kappa_fuller, 1e-11, "Fuller kappa");
      const fits = {
        ols: kClass({ y: d.y, X: d.X, Z: d.X, k: 0, ...opts }),
        tsls: kClass({ y: d.y, X: d.X, Z: d.Z, k: 1, ZZinv, ...opts }),
        liml: kClass({ y: d.y, X: d.X, Z: d.Z, k: kL, ZZinv, ...opts }),
        fuller: kClass({ y: d.y, X: d.X, Z: d.Z, k: kF, ZZinv, ...opts }),
      };
      for (const [m, fit] of Object.entries(fits)) {
        assert.deepEqual(d.xNames, f[m].names);
        vec(fit.beta, f[m].params, 1e-9, `${m} params`);
        vec(fit.se, f[m].se, 1e-8, `${m} se`);
      }
    });
    test(`${label}: first-stage R2, partial R2, F and coefficients match`, () => {
      const fs = firstStage(d, opts);
      fs.forEach((x, j) => {
        const R = f.first_stage[x.variable];
        rel(x.r2, R.rsquared, 1e-10, "r2");
        rel(x.partialR2, R["partial.rsquared"], 1e-10, "partial r2");
        // linearmodels reports the F for unadjusted errors and the Wald statistic otherwise
        rel(f.se === "unadjusted" ? x.F : x.wald, R["f.stat"], 1e-8, "first-stage F / Wald");
        const coefs = f.first_stage_coefs[x.variable];
        const ex = d.exog.length;
        x.instruments.forEach((ins, a) => { rel(ins.coef, coefs.params[ex + a], 1e-9, "fs coef"); rel(ins.se, coefs.se[ex + a], 1e-8, "fs se"); });
      });
    });
    test(`${label}: Sargan, Hansen J, Durbin, Wu-Hausman and the control-function test match`, () => {
      const tsls = kClass({ y: d.y, X: d.X, Z: d.Z, k: 1, ZZinv, ...opts });
      if (f.sargan !== undefined) rel(sargan(d, tsls.e, ZZinv).stat, f.sargan, 1e-9, "Sargan");
      else assert.equal(sargan(d, tsls.e, ZZinv), null);
      if (f.hansen_j !== undefined) {
        const j = hansenJ(d, tsls, opts);
        rel(j.stat, f.hansen_j, 1e-7, "Hansen J");
        vec(j.gmmBeta, f.gmm_params, 1e-8, "GMM params");
      }
      const [du, wh] = exogeneityTests(d, tsls.e, ZZinv);
      rel(du.stat, f.durbin, 1e-9, "Durbin");
      rel(wh.stat, f.wu_hausman, 1e-9, "Wu-Hausman");
      rel(controlFunctionTest(d, opts, ZZinv).stat, f.wooldridge_regression, 1e-8, "control function");
    });
  }
  if (c.anderson_rubin) {
    for (const [se, R] of Object.entries(c.anderson_rubin)) {
      test(`${c.name}, ${se}: Anderson-Rubin statistics and set endpoints match linearmodels OLS + brentq`, () => {
        const opts = { se, clusters: d.clusters, debiased: false };
        for (const [b0, v] of Object.entries(R.at)) rel(andersonRubinStat(d, Number(b0), opts).stat, v, 1e-8, `AR(${b0})`);
        const tsls = kClass({ y: d.y, X: d.X, Z: d.Z, k: 1, ZZinv, se: "unadjusted" });
        const set = andersonRubinSet(d, tsls, opts, 0.05);
        rel(set.crit, R.crit, 1e-9, "critical value");
        assert.ok(!R.inside_at_grid_edges[0] && !R.inside_at_grid_edges[1], "reference set is bounded");
        assert.equal(set.kind, "interval");
        vec(set.intervals[0], R.endpoints, 1e-8, "AR endpoints");
      });
    }
  }
}
