// Parity and metadata for the SIPP bundles: retrospective first marriages
// (reproducibility/sipp_marital_history/train_retro.py) and the prospective couple model
// (train_prospective.py). The JS engine must reproduce scikit-learn to 1e-9.
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, valueFromContributions, explainTree } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, dir)));

function parity(bundle, vectors) {
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
  return checked;
}

test('sipp first-marriage bundle: parity, held-out skill and population reference', () => {
  const b = load('sipp_first_marriage.json');
  const n = parity(b, load('sipp_first_marriage_testvectors.json'));
  assert.ok(n >= 5 * 60);
  assert.equal(b.id, 'sipp_first_marriage');
  assert.ok(b.constant_rate > 0.005 && b.constant_rate < 0.1);
  for (const m of b.models) {
    const h = m.heldout;
    assert.ok(h.ci95[0] <= h.deviance_improvement_percent && h.deviance_improvement_percent <= h.ci95[1], m.key);
    if (m.key !== 'duration_only') {
      assert.ok(h.c_index_10y > 0.5 && h.c_index_10y_ci95[0] <= h.c_index_10y && h.c_index_10y <= h.c_index_10y_ci95[1], m.key);
      assert.equal(h.calibration_10y.length, 10);
    }
  }
  const edu = b.models.find((m) => m.key === 'additive_spline_education');
  assert.ok(edu.categorical.columns.includes('education_at_wedding'));
  assert.ok(!b.models.find((m) => m.key === 'additive_spline').categorical.columns.includes('education_at_wedding'));
  // Population reference in the standard shape: horizons, overall, subgroups -> {n, quantiles}.
  const ref = b.population_reference;
  assert.deepEqual(ref.horizons, [5, 10, 20]);
  const check = (cell, name) => {
    assert.equal(Object.keys(cell.quantiles).length, 99, name);
    for (let i = 1; i <= 99; i++) {
      const v = cell.quantiles[`p${i}`];
      assert.equal(v.length, 3, name);
      // Each person's 5-year risk is below their 10- and 20-year risk, so every percentile is too.
      assert.ok(v[0] <= v[1] + 1e-12 && v[1] <= v[2] + 1e-12, name);
      if (i > 1) for (let h = 0; h < 3; h++) assert.ok(v[h] >= cell.quantiles[`p${i - 1}`][h] - 1e-12, name);
    }
  };
  check(ref.overall, 'overall');
  assert.equal(ref.overall.n, b.training.people);
  for (const [v, levels] of Object.entries(ref.subgroups)) {
    for (const [lv, cell] of Object.entries(levels)) {
      assert.ok(cell.n >= 100, `${v}=${lv}`);
      check(cell, `${v}=${lv}`);
    }
  }
  assert.ok(ref.subgroups.education_at_wedding['Bachelor or higher'].quantiles.p50[1] < ref.subgroups.education_at_wedding['High school'].quantiles.p50[1]);
  // The year-0 rate is the first-year hazard; a 10-year projection from it stays a probability.
  const m = b.models.find((x) => x.key === 'additive_spline');
  let cum = 0;
  for (let k = 0; k < 10; k++) cum += predict(m, { marriage_years: k, age_at_marriage: 25, marriage_year: 2005, sex: 'Woman', race_ethnicity: 'White', nativity: 'US-born' });
  const p10 = 1 - Math.exp(-cum);
  assert.ok(p10 > 0.05 && p10 < 0.6, `10-year dissolution ${p10}`);
  console.log(`sipp first marriage ok: ${n} predictions; woman married at 25 in 2005: ${(100 * p10).toFixed(1)}% dissolved by year 10`);
});

test('sipp prospective couples bundle: parity and the wealth comparison', { skip: !existsSync(new URL('sipp_prospective_couples.json', dir)) }, () => {
  const b = load('sipp_prospective_couples.json');
  const n = parity(b, load('sipp_prospective_couples_testvectors.json'));
  assert.equal(b.id, 'sipp_prospective_couples');
  assert.match(b.target, /prospective/);
  const g = b.wealth_gain_over_demographics;
  assert.ok(g.ci95[0] <= g.deviance_percent && g.deviance_percent <= g.ci95[1]);
  for (const m of b.models) assert.equal(m.heldout.calibration.length, 10);
  console.log(`sipp prospective ok: ${n} predictions; wealth over demographics ${g.deviance_percent}% (${g.ci95[0]} to ${g.ci95[1]})`);
});
