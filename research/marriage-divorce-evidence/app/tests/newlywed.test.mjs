// Parity: the JS engine must reproduce scikit-learn's per-interval divorce probabilities for the
// Los Angeles newlywed couples bundle (exported by
// reproducibility/newlywed_la_karney/train_models.py), and its out-of-distribution score.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, explainTree, oodScore } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, dir)));
const bundle = load('newlywed_la_couples.json');
const vectors = load('newlywed_la_couples_testvectors.json');

test('newlywed_la_couples: every model matches Python to 1e-9', () => {
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

test('newlywed_la_couples: out-of-distribution score matches Python', () => {
  vectors.rows.forEach((row, i) => {
    const { d2 } = oodScore(bundle.ood, row);
    assert.ok(Math.abs(d2 - vectors.ood_d2[i]) <= 1e-7 * Math.max(1, vectors.ood_d2[i]), `row ${i}: js ${d2} vs python ${vectors.ood_d2[i]}`);
  });
});

test('newlywed_la_couples: metadata the app needs', () => {
  assert.equal(bundle.outcome, 'probability_per_period');
  assert.equal(bundle.periods.length, 9);
  assert.equal(bundle.training.couples, 368);
  assert.equal(bundle.training.events, 145);
  assert.equal(bundle.training.events, Object.values(bundle.training.events_by_period).reduce((a, b) => a + b, 0));
  assert.ok(bundle.weights.startsWith('none'));
  assert.ok(bundle.constant_rate > 0 && bundle.constant_rate < 1);
  const base = bundle.models.find((m) => m.key === 'period_only');
  assert.ok(base && base.kind === 'logistic_glm');
  for (const m of bundle.models) {
    const h = m.heldout;
    assert.ok(h.c_index_ci[0] <= h.c_index && h.c_index <= h.c_index_ci[1], `${m.key} C-index outside its CI`);
    assert.equal(h.calibration_12y_quintiles.length, 5);
  }
  // Observer-coded inputs carry a clearly labelled self-report proxy.
  for (const c of ['H_Positivity', 'W_Positivity', 'H_Negativity', 'W_Negativity', 'H_Effective', 'W_Effective']) {
    const spec = bundle.inputs[c];
    assert.ok(spec.measured_by.includes('trained observers'), c);
    assert.ok(spec.self_report_proxy.caveat.startsWith('APPROXIMATION'), c);
    const vals = Object.values(spec.self_report_proxy.answers);
    for (let i = 1; i < vals.length; i++) assert.ok(vals[i] >= vals[i - 1], `${c} proxy answers must be ordered`);
  }
  // Cumulative survival from per-interval probabilities is a product, decreasing over intervals.
  const row = { ...vectors.rows[0] };
  let s = 1;
  for (const p of bundle.periods) {
    const ind = Object.fromEntries(bundle.periods.slice(1).map((q) => [`period_${q.period}`, q.period === p.period ? 1 : 0]));
    const next = s * (1 - predict(base, { ...row, ...ind, period: p.period }));
    assert.ok(next < s);
    s = next;
  }
  // Population reference in the shape app/population.js reads: horizons in years, p1..p99 per
  // horizon, aggregate cells of at least 50 couples, quantiles ordered.
  const ref = bundle.population_reference;
  assert.deepEqual(ref.horizons, [2.34, 4.15, 8.77, 12.04]);
  const cells = [ref.overall, ...Object.values(ref.subgroups).flatMap((s) => Object.values(s))];
  assert.equal(cells.length, 6);
  for (const c of cells) {
    assert.ok(c.n >= 50 && c.small_cell === c.n < 100);
    ref.horizons.forEach((_, j) => {
      for (let k = 2; k <= 99; k++) assert.ok(c.quantiles[`p${k}`][j] >= c.quantiles[`p${k - 1}`][j] - 1e-12, `p${k} must be >= p${k - 1}`);
    });
    for (let k = 1; k <= 99; k++) {
      const v = c.quantiles[`p${k}`];
      for (let j = 1; j < v.length; j++) assert.ok(v[j] >= v[j - 1] - 1e-12, 'cumulative risk cannot fall with the horizon');
    }
  }
  assert.equal(ref.overall.n, 368);
});
