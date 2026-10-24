// Parity: the JS engine must reproduce scikit-learn's predictions for the NSFG 2002
// first-marriage bundle (exported by reproducibility/nsfg2002_first_marriage/train_models.py).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, explainTree } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('nsfg2002_first_marriage.json', dir)));
const vectors = JSON.parse(readFileSync(new URL('nsfg2002_first_marriage_testvectors.json', dir)));

test('nsfg2002 bundle: every model matches Python to 1e-9', () => {
  let checked = 0;
  for (const model of bundle.models) {
    const expected = vectors.predictions[model.key];
    assert.equal(expected.length, vectors.rows.length);
    vectors.rows.forEach((row, i) => {
      const got = predict(model, row);
      const rel = Math.abs(got - expected[i]) / expected[i];
      assert.ok(rel < 1e-9, `${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
      const c = contributions(model, row);
      if (c) {
        const eta = c.intercept + Object.values(c.terms).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(Math.exp(eta) - got) / got < 1e-12, 'contributions must sum to the prediction');
      } else {
        assert.ok(Math.abs(explainTree(model, row).rate - got) < 1e-15);
      }
      checked++;
    });
  }
  assert.equal(checked, bundle.models.length * vectors.rows.length);
});

test('nsfg2002 bundle: metadata the app needs', () => {
  assert.equal(bundle.id, 'nsfg2002_first_marriage');
  assert.ok(bundle.constant_rate > 0 && bundle.constant_rate < 0.2);
  for (const c of ['marriage_years', 'wife_age_at_marriage', 'husband_age_at_marriage', 'wedding_year']) {
    assert.ok(bundle.support[c][0] < bundle.support[c][1], c);
  }
  for (const m of bundle.models) assert.ok(Number.isFinite(m.heldout.deviance_improvement_percent), m.key);
  assert.ok(bundle.abstain.some((s) => s.includes('same-sex')));
});
