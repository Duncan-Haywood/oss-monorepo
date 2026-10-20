// Parity: the JS engine must reproduce scikit-learn's predictions for the GSS panel bundle
// (exported by reproducibility/gss_panel/train_models.py): logistic GLMs with spline numerics and
// missing indicators, and a tree. The target is a 2-year probability, not an annual rate.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, explainTree } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, dir)));
const bundle = load('gss_panel_marriages.json');
const vectors = load('gss_panel_marriages_testvectors.json');

test('gss_panel_marriages: every model matches Python to 1e-9', () => {
  let checked = 0;
  for (const model of bundle.models) {
    const expected = vectors.predictions[model.key];
    assert.equal(expected.length, vectors.rows.length);
    vectors.rows.forEach((row, i) => {
      const got = predict(model, row);
      assert.ok(got > 0 && got < 1, `${model.key} row ${i}: ${got} is not a probability`);
      assert.ok(Math.abs(got - expected[i]) / expected[i] < 1e-9, `${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
      const c = contributions(model, row);
      if (c) {
        assert.equal(c.scale, 'log_odds');
        const eta = c.intercept + Object.values(c.terms).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(1 / (1 + Math.exp(-eta)) - got) < 1e-12, 'log-odds contributions must sum to the prediction');
      } else {
        assert.ok(Math.abs(explainTree(model, row).rate - got) < 1e-15);
      }
      checked++;
    });
  }
  assert.equal(checked, bundle.models.length * vectors.rows.length);
});

test('gss_panel_marriages: metadata the app needs', () => {
  assert.equal(bundle.outcome, 'probability');
  assert.equal(bundle.horizon_years, 2);
  assert.ok(bundle.target.includes('not an annual rate'));
  assert.ok(bundle.constant_probability > 0 && bundle.constant_probability < 1);
  assert.ok(Math.abs(bundle.constant_rate + Math.log1p(-bundle.constant_probability) / 2) < 1e-12);
  assert.ok(bundle.models.some((m) => m.kind === 'logistic_glm'));
  assert.ok(bundle.models.some((m) => m.numeric && m.numeric.indicator), 'missing-indicator columns are exported');
  for (const m of bundle.models.filter((x) => x.kind === 'logistic_glm')) {
    const h = m.heldout;
    assert.ok(h.logloss_improvement_percent > 0 && h.logloss_improvement_ci95[0] > 0, m.key);
    assert.ok(h.auc_ci95[0] < h.auc && h.auc < h.auc_ci95[1], m.key);
  }
  // HAPMAR gradient: "not too happy" marriages dissolve more often than "very happy" ones.
  const r = Object.fromEntries(bundle.hapmar_rates.map((x) => [x.hapmar, x]));
  assert.ok(r['Not too happy'].weighted_rate > r['Pretty happy'].weighted_rate);
  assert.ok(r['Pretty happy'].weighted_rate > r['Very happy'].weighted_rate);
  assert.ok(r['Not too happy'].ci95[0] > r['Very happy'].ci95[1]);
});

test('gss_panel_marriages: population reference is aggregate and suppresses small cells', () => {
  const ref = bundle.population_reference;
  for (const key of ['horizon_2', 'horizon_4']) {
    const h = ref[key];
    assert.equal(h.quantiles.length, h.overall.values.length);
    const check = (cell) => {
      assert.ok(cell.respondents >= 100);
      for (let i = 1; i < cell.values.length; i++) assert.ok(cell.values[i] >= cell.values[i - 1]);
      for (const v of cell.values) assert.ok(v > 0 && v < 1);
    };
    check(h.overall);
    for (const cells of Object.values(h.subgroups)) for (const cell of Object.values(cells)) check(cell);
    assert.ok(Object.keys(h.subgroups).includes('hapmar'));
  }
});
