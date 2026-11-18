// The engine against statsmodels 0.15.0's TreatmentEffect (eval/reference.json, made by eval/reference.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, buildDesign, logit, ipw, regressionAdjustment, aipw } from "./engine.mjs";

const here = new URL(".", import.meta.url);
const ref = JSON.parse(readFileSync(new URL("eval/reference.json", here), "utf8"));
const { records } = parseCsv(readFileSync(new URL(ref.data, here), "utf8"));
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) < tol, `${what}: ${a} vs ${b}`);

for (const c of ref.cases) {
  const { X, d, y } = buildDesign(records, { treatment: ref.treatment, outcome: ref.outcome, covariates: c.covariates });
  const fit = logit(X, d);
  test(`${c.name}: logistic coefficients and standard errors match statsmodels Logit`, () => {
    fit.beta.forEach((b, i) => close(b, c.logit.params[i], 1e-10, `beta ${i}`));
    fit.se.forEach((s, i) => close(s, c.logit.bse[i], 1e-8, `se ${i}`));
  });
  const runs = {
    ipw_ate: () => ipw({ X, d, y, estimand: "ate", fit }), ipw_att: () => ipw({ X, d, y, estimand: "att", fit }), ipw_atc: () => ipw({ X, d, y, estimand: "atc", fit }),
    ra_ate: () => regressionAdjustment({ X, d, y, estimand: "ate" }), ra_att: () => regressionAdjustment({ X, d, y, estimand: "att" }), ra_atc: () => regressionAdjustment({ X, d, y, estimand: "atc" }),
    aipw_ate: () => aipw({ X, d, y, fit }),
  };
  for (const [key, fn] of Object.entries(runs)) {
    test(`${c.name}: ${key} estimate, potential-outcome means and sandwich SEs match statsmodels`, () => {
      const r = fn(), R = c[key];
      close(r.estimate, R.ATE.coef, 1e-9, "effect");
      close(r.pom0, R.POM0.coef, 1e-9, "POM0");
      close(r.pom1, R.POM1.coef, 1e-9, "POM1");
      close(r.se, R.ATE.se, 1e-6, "effect SE");
      close(r.pom0Se, R.POM0.se, 1e-6, "POM0 SE");
      close(r.pom1Se, R.POM1.se, 1e-6, "POM1 SE");
    });
  }
}
