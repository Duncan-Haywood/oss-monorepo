// Parity: the JS engine must reproduce scikit-learn's predictions for the Canadian GSS Family
// first-marriage bundle (exported by reproducibility/canada_gss_family/train_models.py), its
// explanations must be exact, and its out-of-distribution distances must match Python.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, valueFromContributions, explainTree, oodScore } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('canada_gss_first_marriage.json', dir)));
const vectors = JSON.parse(readFileSync(new URL('canada_gss_first_marriage_testvectors.json', dir)));

test('canada gss bundle: every model matches Python to 1e-9', () => {
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
  const kinds = new Set(bundle.models.map((m) => m.kind));
  for (const k of ['poisson_glm', 'tree', 'boosted']) assert.ok(kinds.has(k), `bundle lacks ${k}`);
});

test('canada gss bundle: out-of-distribution distances match Python', () => {
  vectors.rows.forEach((row, i) => {
    const { d2 } = oodScore(bundle.ood, row);
    const want = vectors.ood_d2[i];
    assert.ok(Math.abs(d2 - want) <= 1e-9 * Math.max(1, Math.abs(want)), `row ${i}: js ${d2} vs python ${want}`);
  });
  const q = bundle.ood.heldout_quantiles;
  for (let k = 1; k < q.d2.length; k++) assert.ok(q.d2[k] >= q.d2[k - 1] && q.p[k] > q.p[k - 1]);
  const typical = oodScore(bundle.ood, { age_at_marriage: 24, wedding_year: 1985, respondent_sex: 'Female', cohabited_first: 'No',
    prior_union: 'No', premarital_birth: 'No', intact_family_15: 'Yes', born_outside_canada: 'No', first_language: 'English', region: 'Ontario' });
  assert.ok(!typical.abstain, `typical profile percentile ${typical.percentile}`);
});

test('canada gss bundle: metadata the app needs', () => {
  assert.equal(bundle.id, 'canada_gss_first_marriage');
  assert.ok(bundle.constant_rate > 0 && bundle.constant_rate < 0.2);
  assert.equal(bundle.app_defaults.survey_cycle, '2017');
  for (const c of ['marriage_years', 'age_at_marriage', 'wedding_year']) assert.ok(bundle.support[c][0] < bundle.support[c][1], c);
  for (const m of bundle.models) {
    const h = m.heldout;
    assert.ok(Number.isFinite(h.deviance_improvement_percent), m.key);
    assert.ok(h.ci95[0] <= h.deviance_improvement_percent && h.deviance_improvement_percent <= h.ci95[1], m.key);
    assert.ok(Number.isFinite(m.out_of_time.deviance_improvement_percent), m.key);
    assert.equal(m.calibration.length, 10, m.key);
  }
  assert.ok(bundle.models.some((m) => m.key === bundle.shipped_model));
  const pr = bundle.population_reference;
  assert.equal(pr.quantiles.length, 21);
  const all = pr.cells.find((c) => c.variable === 'All');
  assert.ok(all && all.n >= 100);
  for (const cell of pr.cells) {
    assert.ok(cell.n >= 100, `${cell.variable}=${cell.value} has n ${cell.n}`);
    for (const k of ['p5', 'p10', 'p20']) {
      for (let i = 1; i < cell[k].length; i++) assert.ok(cell[k][i] >= cell[k][i - 1], `${cell.variable}=${cell.value} ${k} not monotone`);
    }
  }
  assert.ok(bundle.weighted_survival.length > 10);
  assert.ok(bundle.abstain.some((s) => s.includes('previously married')));
  assert.match(bundle.source, /Statistics Canada Open Licence/);
});
