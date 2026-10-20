// In-browser trainer (train/fit.js) against scikit-learn 1.7.2 on the same extract and folds
// (train/sklearn_reference.json, written by train/tools/sklearn_reference.py). Takes ~40 s: it runs
// the full five-fold comparison, boosting at the Python setting of 250 rounds.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { strict as assert } from 'node:assert';
import * as F from '../train/fit.js';

const dir = new URL('../train/', import.meta.url);
const doc = JSON.parse(gunzipSync(readFileSync(new URL('nsfg_pooled_women.json.gz', dir))));
const ref = JSON.parse(readFileSync(new URL('sklearn_reference.json', dir)));
const bundle = JSON.parse(readFileSync(new URL('../models/nsfg_pooled_first_marriage.json', import.meta.url)));

// The extract: the lens's sample, pre-wedding inputs only, with its licence recorded.
assert.equal(doc.n, bundle.training.respondents);
assert.equal(doc.events, bundle.training.events);
assert.match(doc.licence, /17 U\.S\.C\. 105/);
assert.match(doc.licence, /identity/);
const D = F.decode(doc);
const R = F.intervals(D);
assert.equal(R.n, bundle.training.intervals);
assert.equal(R.n, ref.n_intervals);
const glmBundle = bundle.models.find((m) => m.key === 'additive_spline');
assert.deepEqual(D.catNames, glmBundle.categorical.columns);
assert.deepEqual(D.catNames.map((n) => D.levels[n]), glmBundle.categorical.categories);
assert.deepEqual(['marriage_years', ...D.numNames], glmBundle.numeric.columns);
for (const f of [0, 1, 2, 3, 4]) {
  const people = D.fold.filter((x) => x === f).length;
  assert.ok(Math.abs(people - D.n / 5) <= 1, `fold ${f} has ${people} women`);
}

// GLM: the same coefficients as scikit-learn's PoissonRegressor (newton-cholesky), to 1e-6.
const COEF_TOL = 1e-6;
function sameGLM(js, py, label) {
  assert.deepEqual(js.featureNames, py.feature_names, `${label}: feature names`);
  const close = (a, b, tol, what) => a.forEach((v, j) => assert.ok(Math.abs(v - b[j]) <= tol, `${label} ${what}[${j}]: ${v} vs ${b[j]}`));
  close(js.impute, py.impute.slice(1), 1e-12, 'impute');
  close([js.durKnots, ...js.knots].flat(), py.knots.flat(), 1e-9, 'knots');
  close(js.mean, py.scale_mean, 1e-9, 'scaler mean');
  close(js.sd, py.scale_sd, 1e-9, 'scaler sd');
  close(js.coef, py.coef, COEF_TOL, 'coef');
  assert.ok(Math.abs(js.intercept - py.intercept) <= COEF_TOL, `${label} intercept`);
  return Math.max(...js.coef.map((v, j) => Math.abs(v - py.coef[j])), Math.abs(js.intercept - py.intercept));
}
const train0 = F.rowsWhere(D, R, (f) => f !== 0);
const d0 = sameGLM(F.fitGLM(D, R, train0, F.SETTINGS.additive_spline), ref.glm_fold0, 'fold 0');
const all = Int32Array.from({ length: R.n }, (_, r) => r);
const glmAll = F.fitGLM(D, R, all, F.SETTINGS.additive_spline);
const dAll = sameGLM(glmAll, ref.glm_all, 'all data');

// Scoring a person with the trained GLM agrees with the shipped bundle's model (fitted by
// scikit-learn on the same marriages), through the app's own engine.
const { predict } = await import('../engine.js');
for (const i of [0, 1234, 20000]) {
  const [nv, cv] = F.personInputs(D, i);
  const row = Object.fromEntries([['marriage_years', 3], ...D.numNames.map((n, j) => [n, Number.isNaN(nv[j]) ? null : nv[j]]),
    ...D.catNames.map((n, j) => [n, D.levels[n][cv[j]]])]);
  const js = F.rates(glmAll, nv, cv, [3], D)[0];
  const py = predict(glmBundle, row);
  assert.ok(Math.abs(js / py - 1) < 1e-5, `person ${i}: ${js} vs shipped ${py}`);
}

// Held-out gains, C and O/E over the five folds. Tolerances: GLMs and the tree 0.001 points
// of deviance gain and 0.0005 in C (they are the same algorithms); boosting 0.15 points and
// 0.003 in C (histogram binning and summation order differ slightly from scikit-learn's).
const TOL = { constant: [1e-9, 0], duration_only: [1e-3, 5e-4], additive_spline: [1e-3, 5e-4], tree_depth4: [1e-3, 5e-4], gradient_boosting: [0.15, 3e-3] };
const t0 = Date.now();
const cv = F.crossValidate(D, R, F.KINDS);
const lines = [];
for (const k of F.KINDS) {
  const js = cv[k], py = ref.models[k];
  const [tg, tc] = TOL[k];
  assert.ok(Math.abs(js.deviance_gain_percent - py.deviance_gain_percent) <= tg, `${k} gain ${js.deviance_gain_percent} vs ${py.deviance_gain_percent}`);
  if (py.harrell_c != null) assert.ok(Math.abs(js.harrell_c - py.harrell_c) <= tc, `${k} C ${js.harrell_c} vs ${py.harrell_c}`);
  assert.ok(Math.abs(js.observed_expected - py.observed_expected) <= Math.max(tg / 10, 1e-6), `${k} O/E`);
  lines.push(`${k}: ${js.deviance_gain_percent.toFixed(3)}% vs ${py.deviance_gain_percent.toFixed(3)}%, C ${js.harrell_c?.toFixed(4) ?? '-'} vs ${py.harrell_c?.toFixed(4) ?? '-'}`);
}
// and the extract reproduces the shipped lens's held-out gains (5.688% GLM, 6.289% boosting)
for (const m of [...bundle.models, ...bundle.extra_models]) {
  if (cv[m.key]) assert.ok(Math.abs(cv[m.key].deviance_gain_percent - m.heldout.deviance_improvement_percent) <= TOL[m.key][0] + 0.01, `${m.key} vs shipped`);
}
const cal = cv.additive_spline.calibration;
assert.equal(cal.length, 10);
assert.ok(cal[9].observed > 5 * cal[0].observed, 'top tenth should dissolve far more often than the bottom');
console.log(`train: GLM coefficients within ${d0.toExponential(1)} (fold 0) and ${dAll.toExponential(1)} (all data) of scikit-learn; held out (${((Date.now() - t0) / 1000).toFixed(0)} s): ${lines.join('; ')}`);
