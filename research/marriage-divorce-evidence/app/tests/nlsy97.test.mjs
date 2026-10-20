// Parity: the JS engine must reproduce scikit-learn's predictions for the NLSY97 first-marriage
// bundle (exported by reproducibility/nlsy97_first_marriage/train_models.py), every explanation
// must reproduce its prediction, and the distance-to-data score must match Python.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, valueFromContributions, explainTree, oodScore } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('nlsy97_first_marriage.json', dir)));
const vectors = JSON.parse(readFileSync(new URL('nlsy97_first_marriage_testvectors.json', dir)));

test('nlsy97 bundle: every model matches Python to 1e-9', () => {
  let checked = 0;
  for (const model of bundle.models) {
    const expected = vectors.predictions[model.key];
    assert.equal(expected.length, vectors.rows.length, model.key);
    vectors.rows.forEach((row, i) => {
      const got = predict(model, row);
      const rel = Math.abs(got - expected[i]) / expected[i];
      assert.ok(rel < 1e-9, `${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
      const c = contributions(model, row);
      if (c) {
        assert.ok(Math.abs(valueFromContributions(c) - got) / got < 1e-12, `${model.key} row ${i}: contributions must reproduce the rate`);
      } else {
        assert.ok(Math.abs(explainTree(model, row).rate - got) < 1e-15);
      }
      checked++;
    });
  }
  assert.equal(checked, bundle.models.length * vectors.rows.length);
  for (const k of ['poisson_glm', 'tree', 'boosted']) assert.ok(bundle.models.some((m) => m.kind === k), `bundle lacks ${k}`);
});

test('nlsy97 bundle: distance-to-data score matches Python', () => {
  vectors.rows.forEach((row, i) => {
    const { d2 } = oodScore(bundle.ood, row);
    const want = vectors.ood_d2[i];
    assert.ok(Math.abs(d2 - want) <= 1e-9 * Math.max(1, Math.abs(want)), `row ${i}: js ${d2} vs python ${want}`);
  });
  const q = bundle.ood.heldout_quantiles;
  for (let k = 1; k < q.d2.length; k++) assert.ok(q.d2[k] >= q.d2[k - 1]);
});

test('nlsy97 bundle: held-out skill, references and metadata the app needs', () => {
  assert.equal(bundle.id, 'nlsy97_first_marriage');
  assert.ok(bundle.constant_rate > 0 && bundle.constant_rate < 0.2);
  assert.ok(bundle.models.some((m) => m.key === bundle.best_model));
  for (const m of bundle.models) {
    const h = m.heldout;
    assert.ok(h.ci95[0] <= h.deviance_improvement_percent && h.deviance_improvement_percent <= h.ci95[1], m.key);
    for (const k of ['harrell_c', 'auc_5y', 'auc_10y', 'decile_lift']) {
      assert.ok(Number.isFinite(h[k]), `${m.key} ${k}`);
      assert.ok(h[`${k}_ci95`][0] <= h[k] && h[k] <= h[`${k}_ci95`][1], `${m.key} ${k} outside its interval`);
    }
    assert.equal(h.calibration.length, 10);
  }
  assert.equal(bundle.comparison.constant.deviance_improvement_percent, 0);
  // Population reference (the shape app/population.js reads): p1..p99 per horizon, ordered,
  // and every subgroup cell has >= 100 marriages.
  const ref = bundle.population_reference;
  assert.deepEqual(ref.horizons, [5, 10, 20]);
  const cells = [ref.overall, ...Object.values(ref.subgroups).flatMap((g) => Object.values(g))];
  for (const c of cells) {
    assert.ok(c.n >= 100);
    ref.horizons.forEach((hz, j) => {
      const v = Array.from({ length: 99 }, (_, k) => c.quantiles['p' + (k + 1)][j]);
      for (let k = 1; k < 99; k++) assert.ok(v[k] >= v[k - 1] && v[k] >= 0 && v[k] <= 1, `horizon ${hz}`);
    });
  }
  for (const [k, def] of Object.entries(ref.subgroup_defs)) assert.ok(ref.subgroups[k] && def.column, k);
  // Partner distribution: no row under the cell minimum; shares plus suppressed sum to 1.
  const pd = bundle.partner_distribution;
  for (const [key, rows] of Object.entries(pd)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      assert.ok(r.marriages >= pd.min_cell, key);
      const s = Object.values(r.shares).reduce((a, b) => a + b, 0) + r.suppressed_share;
      assert.ok(Math.abs(s - 1) < 2e-3, `${key} ${r.respondent} sums to ${s}`);
    }
  }
  assert.ok(bundle.abstain.some((s) => s.includes('same-sex')));
});
