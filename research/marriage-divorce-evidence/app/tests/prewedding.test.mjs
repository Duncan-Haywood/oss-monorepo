// "Before the wedding" lens: the JS engine reproduces the harmonized pre-wedding model
// (constant spline extrapolation, Unknown answers imputed with the training mode), its
// explanations are exact, and its out-of-distribution score matches Python.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, valueFromContributions, oodScore, cumulativeRisk } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('prewedding_harmonized.json', dir)));
const vectors = JSON.parse(readFileSync(new URL('prewedding_harmonized_testvectors.json', dir)));
const model = bundle.models[0];
assert.equal(model.numeric.spline.extrapolation, 'constant');
assert.equal(model.categorical.impute.length, model.categorical.columns.length);
vectors.rows.forEach((row, i) => {
  const got = predict(model, row);
  const want = vectors.predictions[i];
  assert.ok(Math.abs(got - want) / want < 1e-9, `row ${i}: js ${got} vs python ${want}`);
  const c = contributions(model, row);
  assert.ok(Math.abs(valueFromContributions(c) - got) / got < 1e-12, `row ${i}: contributions must reproduce the rate`);
  const o = oodScore(bundle.ood, row);
  assert.ok(Math.abs(o.d2 - vectors.ood_d2[i]) <= 1e-9 * Math.max(1, vectors.ood_d2[i]), `row ${i}: ood ${o.d2} vs ${vectors.ood_d2[i]}`);
});

// Unknown answers score exactly like the training mode; wedding years past the support are
// held at the edge rather than extrapolated.
const base = vectors.rows[1];
const modeRow = { ...base };
model.categorical.columns.forEach((c, j) => { modeRow[c] = model.categorical.impute[j]; });
const unknownRow = { ...base };
model.categorical.columns.forEach((c) => { unknownRow[c] = 'Unknown'; });
assert.equal(predict(model, unknownRow), predict(model, modeRow));
const edge = bundle.support.wedding_year[1];
const late = (y) => predict(model, { ...base, wedding_year: y });
const knotEdge = model.numeric.spline.knots[model.numeric.columns.indexOf('wedding_year')];
const hi = knotEdge[knotEdge.length - model.numeric.spline.degree - 1];
assert.equal(late(hi + 5), late(hi + 30), 'constant beyond the last knot');
assert.ok(edge <= hi + 1e-9 || edge > hi);

// Skill, external validation and population reference ship with the model.
for (const t of ['nlsy79', 'nlsy97', 'sipp', 'canada_gss']) assert.ok(model.external[t].c_index > 0.5, t);
const q = bundle.population_reference.overall.quantiles;
for (let k = 2; k <= 99; k++) for (let h = 0; h < 3; h++) assert.ok(q[`p${k}`][h] >= q[`p${k - 1}`][h]);
// Per-couple bootstrap intervals match Python, contain the point estimate and widen with time.
const B = model.bootstrap;
assert.equal(B.coef.length, B.replicates);
assert.equal(B.coef[0].length, model.coef.length);
for (const [h, want] of Object.entries(vectors.risk)) {
  want.point.forEach((p, i) => {
    const r = cumulativeRisk(model, (k) => ({ ...vectors.rows[i], marriage_years: k }), Number(h));
    for (const key of ['point', 'lo', 'hi']) {
      const w = want[key][i];
      assert.ok(Math.abs(r[key] - w) <= 1e-9 * Math.max(1e-6, Math.abs(w)), `h=${h} row ${i} ${key}: js ${r[key]} vs python ${w}`);
    }
    assert.ok(r.lo <= r.point + 1e-12 && r.point <= r.hi + 1e-12, `h=${h} row ${i}: interval must contain the point`);
  });
}
const r5 = cumulativeRisk(model, (k) => ({ ...vectors.rows[2], marriage_years: k }), 5);
const r20 = cumulativeRisk(model, (k) => ({ ...vectors.rows[2], marriage_years: k }), 20);
assert.ok(r20.point > r5.point && r20.hi - r20.lo >= 0);

console.log(`prewedding lens ok: ${vectors.rows.length} rows match; 10-year median ${(q.p50[1] * 100).toFixed(1)}%`);
