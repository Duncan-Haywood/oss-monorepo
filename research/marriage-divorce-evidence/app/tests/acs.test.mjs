// Parity and metadata: the ACS one-year divorce bundle (reproducibility/acs_pums_multiyear/train_models.py)
// and the published baselines (baselines.py). The JS engine must reproduce scikit-learn to 1e-9.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, valueFromContributions, explainTree } from '../engine.js';

const models = new URL('../models/', import.meta.url);
const data = new URL('../data/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('acs_one_year_divorce.json', models)));
const vectors = JSON.parse(readFileSync(new URL('acs_one_year_divorce_testvectors.json', models)));
const baselines = JSON.parse(readFileSync(new URL('acs_divorce_baselines.json', data)));

test('acs bundle: every model matches Python to 1e-9 and explanations reproduce it', () => {
  const kinds = new Set(bundle.models.map((m) => m.kind));
  for (const k of ['logistic_glm', 'poisson_glm', 'tree', 'boosted']) assert.ok(kinds.has(k), `bundle lacks ${k}`);
  let checked = 0;
  for (const model of bundle.models) {
    const expected = vectors.predictions[model.key];
    assert.equal(expected.length, vectors.rows.length, model.key);
    vectors.rows.forEach((row, i) => {
      const got = predict(model, row);
      assert.ok(Math.abs(got - expected[i]) / expected[i] < 1e-9, `${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
      const c = contributions(model, row);
      if (c) assert.ok(Math.abs(valueFromContributions(c) - got) / got < 1e-12, `${model.key} row ${i}: contributions`);
      else assert.ok(Math.abs(explainTree(model, row).rate - got) < 1e-15);
      checked++;
    });
  }
  assert.equal(checked, bundle.models.length * vectors.rows.length);
});

test('acs bundle: labelled cross-sectional, with held-out skill and intervals', () => {
  assert.equal(bundle.id, 'acs_one_year_divorce');
  assert.match(bundle.target, /CROSS-SECTIONAL/);
  assert.match(bundle.timing, /AFTER any divorce/);
  assert.ok(bundle.constant_rate > 0.005 && bundle.constant_rate < 0.03);
  for (const m of bundle.models) {
    const h = m.heldout;
    assert.ok(h.ci95[0] <= h.deviance_improvement_percent && h.deviance_improvement_percent <= h.ci95[1], m.key);
    assert.ok(h.auc_ci95[0] <= h.auc && h.auc <= h.auc_ci95[1] && h.auc > 0.5, m.key);
    assert.equal(h.calibration.length, 10);
    assert.equal(h.inputs_measured_after_event, m.key.endsWith('_post'));
  }
  // An unseen state adds nothing (one-hot ignore), so it scores like the reference state.
  const m = bundle.models.find((x) => x.key === 'logistic_additive');
  const row = vectors.rows[3];
  const ref = m.categorical.categories[m.categorical.columns.indexOf('state')][0];
  assert.equal(predict(m, { ...row, state: 'ZZ' }), predict(m, { ...row, state: ref }));
});

test('acs baselines: CIs bracket estimates, cells meet the minimum, risk percentiles are ordered', () => {
  const o = baselines.overall;
  assert.ok(o.ci95[0] <= o.per_1000 && o.per_1000 <= o.ci95[1]);
  assert.ok(o.per_1000 > 5 && o.per_1000 < 30);
  assert.ok(baselines.year_series.some((s) => s.year === 2020 && s.experimental_weights));
  assert.ok(!baselines.pooled_years.includes(2020));
  let cells = 0;
  for (const [dims, block] of Object.entries(baselines.cells)) {
    const n = dims.split('|').length;
    for (const [values, people, , rate, lo, hi] of block.rows) {
      assert.equal(values.length, n, dims);
      assert.ok(people >= baselines.min_unweighted_people, `${dims} ${values}`);
      assert.ok(lo <= rate + 1e-9 && rate <= hi + 1e-9, `${dims} ${values}`);
      assert.ok(rate < 200, `${dims} ${values}: ${rate} per 1,000 is not a plausible baseline`);
      cells++;
    }
  }
  assert.ok(cells > 100);
  // Population reference in the standard shape (horizons, overall, subgroups), also in the bundle.
  for (const r of [baselines.model_predicted_risk, bundle.population_reference]) {
    assert.deepEqual(r.horizons, [1]);
    const check = (cell, name) => {
      assert.equal(Object.keys(cell.quantiles).length, 99, name);
      for (let i = 2; i <= 99; i++) assert.ok(cell.quantiles[`p${i}`][0] >= cell.quantiles[`p${i - 1}`][0] - 1e-12, name);
      assert.ok(cell.quantiles.p50[0] > 0 && cell.quantiles.p99[0] < 1, name);
    };
    check(r.overall, 'overall');
    for (const [v, levels] of Object.entries(r.subgroups)) {
      for (const [lv, cell] of Object.entries(levels)) {
        assert.ok(cell.n >= 200, `${v}=${lv}`);
        check(cell, `${v}=${lv}`);
      }
    }
  }
  console.log(`acs ok: ${cells} baseline cells; overall ${o.per_1000} per 1,000 (${o.ci95[0]}–${o.ci95[1]})`);
});
