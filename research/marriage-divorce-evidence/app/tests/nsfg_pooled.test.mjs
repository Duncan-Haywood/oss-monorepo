// Parity: the JS engine must reproduce scikit-learn for the pooled NSFG 1995-2023 first-marriage
// bundle (reproducibility/nsfg_pooled_first_marriage/train_pooled.py): the women's models, the
// both-sexes models and the out-of-distribution score. Also checks the aggregate-only blocks.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, valueFromContributions, explainTree, oodScore } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('nsfg_pooled_first_marriage.json', dir)));
const vectors = JSON.parse(readFileSync(new URL('nsfg_pooled_first_marriage_testvectors.json', dir)));

function checkModels(models, expectedByKey) {
  let checked = 0;
  for (const model of models) {
    const expected = expectedByKey[model.key];
    assert.equal(expected.length, vectors.rows.length, model.key);
    vectors.rows.forEach((row, i) => {
      const got = predict(model, row);
      const rel = Math.abs(got - expected[i]) / expected[i];
      assert.ok(rel < 1e-9, `${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
      const c = contributions(model, row);
      if (c) assert.ok(Math.abs(valueFromContributions(c) - got) / got < 1e-12, `${model.key} row ${i}: contributions`);
      else assert.ok(Math.abs(explainTree(model, row).rate - got) < 1e-15);
      checked++;
    });
  }
  return checked;
}

test('pooled bundle: every women model matches Python to 1e-9', () => {
  const all = [...bundle.models, ...bundle.extra_models];
  const n = checkModels(all, vectors.predictions);
  assert.equal(n, all.length * vectors.rows.length);
  assert.deepEqual(bundle.scoring_models, bundle.models.filter((m) => m.key !== 'duration_only').map((m) => m.key));
  assert.ok(bundle.models.some((m) => m.kind === 'boosted'), 'gradient boosting exported');
});

test('pooled bundle: every both-sexes model matches Python to 1e-9', () => {
  const n = checkModels(bundle.models_both_sexes, vectors.predictions_both_sexes);
  assert.equal(n, bundle.models_both_sexes.length * vectors.rows.length);
});

test('pooled bundle: out-of-distribution distance matches Python', () => {
  vectors.rows.forEach((row, i) => {
    const { d2 } = oodScore(bundle.ood, row);
    assert.ok(Math.abs(d2 - vectors.ood_d2[i]) <= 1e-9 * Math.max(1, Math.abs(vectors.ood_d2[i])), `row ${i}`);
  });
});

test('pooled bundle: metadata, held-out discrimination and aggregate-only blocks', () => {
  assert.equal(bundle.id, 'nsfg_pooled_first_marriage');
  assert.ok(bundle.constant_rate > 0 && bundle.constant_rate < 0.2);
  for (const c of ['marriage_years', 'wife_age_at_marriage', 'husband_age_at_marriage', 'wedding_year']) {
    assert.ok(bundle.support[c][0] < bundle.support[c][1], c);
  }
  for (const m of bundle.models) {
    const h = m.heldout;
    assert.ok(h.ci95[0] <= h.deviance_improvement_percent && h.deviance_improvement_percent <= h.ci95[1], m.key);
    if (m.key !== 'duration_only') {
      for (const k of ['harrell_c', 'auc5', 'auc10', 'decile_lift']) assert.ok(Number.isFinite(h[k]), `${m.key} ${k}`);
      assert.ok(h.harrell_c > 0.5 && h.harrell_c < 1);
      assert.equal(m.calibration.length, 10);
    }
  }
  assert.ok(bundle.abstain.some((s) => s.includes('same-sex')));
  // Population reference in the shape app/population.js reads: p1..p99, each a list aligned
  // to horizons, monotone in p; no subgroup cell under 100 marriages.
  for (const ref of [bundle.population_reference, bundle.population_reference_both_sexes]) {
    assert.deepEqual(ref.horizons, [5, 10, 20]);
    const cells = [ref.overall, ...Object.values(ref.subgroups).flatMap((s) => Object.values(s))];
    assert.ok(cells.length > 20);
    for (const c of cells) {
      assert.ok(c.n >= 100);
      for (let j = 0; j < 3; j++) {
        for (let k = 2; k <= 99; k++) assert.ok(c.quantiles['p' + k][j] >= c.quantiles['p' + (k - 1)][j]);
      }
      for (let k = 1; k <= 99; k++) assert.ok(c.quantiles['p' + k][0] <= c.quantiles['p' + k][2] + 1e-12, 'risk grows with horizon');
    }
    for (const v of Object.keys(ref.subgroups)) assert.ok(ref.subgroup_defs[v].column, v);
  }
  assert.ok(bundle.population_reference_both_sexes.subgroups.respondent_sex.Male.n >= 100);
  // Partner distribution: listed profiles renormalised to 1; cells and profiles above the floors.
  const pd = bundle.partner_distribution;
  for (const t of [...pd.given_wife, ...pd.given_husband]) {
    assert.ok(t.n >= pd.min_conditioning_cell && t.coverage > 0 && t.coverage <= 1);
    const s = t.profiles.reduce((a, p) => a + p.share, 0);
    assert.ok(Math.abs(s - 1) < 1e-4, JSON.stringify(t.given));
  }
  assert.ok(pd.given_wife.length > 5 && pd.given_husband.length > 5);
});
