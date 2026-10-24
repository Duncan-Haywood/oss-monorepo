// Parity: the JS engine must reproduce scikit-learn for the NLSY79 first-marriage bundle
// (reproducibility/nlsy79_full/train_first_marriage.py), including its out-of-distribution
// score, and the published reference blocks must respect their cell-size rules. Also checks
// the ood block that app/tools/nlsy79_reference.py adds to the NLSY79 couples bundle.
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, explainTree, valueFromContributions, oodScore } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, dir)));
const bundle = load('nlsy79_first_marriage.json');
const vectors = load('nlsy79_first_marriage_testvectors.json');

test('nlsy79 first marriage: every model matches Python to 1e-9', () => {
  let checked = 0;
  for (const model of bundle.models) {
    const expected = vectors.predictions[model.key];
    assert.equal(expected.length, vectors.rows.length, model.key);
    vectors.rows.forEach((row, i) => {
      const got = predict(model, row);
      const rel = Math.abs(got - expected[i]) / expected[i];
      assert.ok(rel < 1e-9, `${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
      const c = contributions(model, row);
      if (c) assert.ok(Math.abs(valueFromContributions(c) - got) / got < 1e-9, `${model.key}: contributions must sum to the prediction`);
      else assert.ok(Math.abs(explainTree(model, row).rate - got) < 1e-15);
      checked++;
    });
  }
  assert.equal(checked, bundle.models.length * vectors.rows.length);
});

test('nlsy79 first marriage: ood distances match Python', () => {
  const spec = bundle.ood;
  vectors.rows.forEach((row, i) => {
    const { d2 } = oodScore(spec, row);
    const want = vectors.ood_d2[i];
    assert.ok(Math.abs(d2 - want) <= 1e-9 * Math.max(1, Math.abs(want)), `row ${i}: js ${d2} vs python ${want}`);
  });
  const q = spec.heldout_quantiles;
  for (let k = 1; k < q.d2.length; k++) assert.ok(q.d2[k] >= q.d2[k - 1] && q.p[k] > q.p[k - 1]);
});

test('nlsy79 first marriage: metadata, timing and published cells', () => {
  assert.equal(bundle.id, 'nlsy79_first_marriage');
  assert.ok(bundle.constant_rate > 0 && bundle.constant_rate < 0.2);
  for (const [c, [lo, hi]] of Object.entries(bundle.support)) assert.ok(lo < hi, c);
  for (const m of bundle.models) {
    assert.ok(Number.isFinite(m.heldout.deviance_improvement_percent), m.key);
    assert.ok(m.heldout.ci95[0] <= m.heldout.deviance_improvement_percent + 1e-9, m.key);
  }
  for (const k of ['pre_wedding_round', 'fixed_early', 'spouse', 'cross_round']) assert.ok(bundle.timing[k], k);
  assert.ok(bundle.abstain.some((s) => s.includes('same-sex')));
  const pr = bundle.population_reference;
  assert.equal(pr.quantiles.length, 21);
  for (const cell of pr.cells) {
    assert.ok(cell.n >= 100, `${cell.variable}=${cell.value} has n ${cell.n}`);
    for (const h of pr.horizons_years) {
      const qs = cell[`p${h}`];
      assert.equal(qs.length, pr.quantiles.length);
      for (let k = 1; k < qs.length; k++) assert.ok(qs[k] >= qs[k - 1] && qs[k] >= 0 && qs[k] <= 1);
    }
  }
  for (const t of bundle.partner_distribution.spouse_traits_given_respondent) {
    let total = t.suppressed_share;
    for (const c of t.cells) {
      assert.ok(c.n >= 30);
      total += c.share;
    }
    assert.ok(Math.abs(total - 1) < 1e-3, JSON.stringify(t.given));
  }
});

test('nlsy79 couples: added ood block matches Python', { skip: !existsSync(new URL('nlsy79_couples_reference_testvectors.json', dir)) }, () => {
  const couples = load('nlsy79_couples.json');
  const vec = load('nlsy79_couples_reference_testvectors.json');
  assert.ok(couples.ood && couples.population_reference);
  vec.rows.forEach((row, i) => {
    const { d2 } = oodScore(couples.ood, row);
    assert.ok(Math.abs(d2 - vec.ood_d2[i]) <= 1e-9 * Math.max(1, Math.abs(vec.ood_d2[i])), `row ${i}`);
  });
  for (const cell of couples.population_reference.cells) assert.ok(cell.n >= 100);
});
