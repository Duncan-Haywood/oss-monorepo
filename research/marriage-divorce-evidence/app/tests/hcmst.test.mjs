// Parity: the JS engine must reproduce scikit-learn's per-period break-up probabilities for the
// HCMST couples bundle (exported by reproducibility/hcmst/train_models.py), and its
// out-of-distribution score.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, explainTree, oodScore } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, dir)));
const bundle = load('hcmst_couples.json');
const vectors = load('hcmst_couples_testvectors.json');

test('hcmst_couples: every model matches Python to 1e-9', () => {
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

test('hcmst_couples: out-of-distribution score matches Python', () => {
  vectors.rows.forEach((row, i) => {
    const { d2 } = oodScore(bundle.ood, row);
    assert.ok(Math.abs(d2 - vectors.ood_d2[i]) <= 1e-7 * Math.max(1, vectors.ood_d2[i]), `row ${i}: js ${d2} vs python ${vectors.ood_d2[i]}`);
  });
});

test('hcmst_couples: metadata the app needs', () => {
  assert.equal(bundle.outcome, 'probability_per_period');
  assert.equal(bundle.periods.length, 5);
  assert.equal(bundle.training.couples, 3009);
  assert.equal(bundle.training.events, Object.values(bundle.training.events_by_period).reduce((a, b) => a + b, 0));
  assert.ok(bundle.constant_rate > 0 && bundle.constant_rate < 1);
  const base = bundle.models.find((m) => m.key === 'period_only');
  assert.ok(base && base.kind === 'logistic_glm');
  for (const m of bundle.models) {
    const h = m.heldout;
    assert.ok(h.c_index_ci[0] <= h.c_index && h.c_index <= h.c_index_ci[1], m.key);
  }
  // Cumulative survival from per-period probabilities is a product, decreasing over periods.
  const row = { ...vectors.rows[0] };
  let s = 1;
  for (const p of bundle.periods) {
    const next = s * (1 - predict(base, { ...row, period: p.period }));
    assert.ok(next < s);
    s = next;
  }
  // Population reference: aggregate cells only, each with at least 50 couples.
  const ref = bundle.population_reference;
  for (const cells of Object.values(ref.models)) {
    for (const c of cells) {
      assert.ok(c.n >= 50 && c.small_cell === c.n < 100, `${c.dimension}/${c.group}`);
      for (const h of Object.keys(ref.horizons)) {
        const q = ref.quantiles.map((k) => c[h][k]).filter((v) => v !== null);
        for (let i = 1; i < q.length; i++) assert.ok(q[i] >= q[i - 1] - 1e-12, `${c.group} ${h} quantiles must be ordered`);
      }
    }
  }
});
