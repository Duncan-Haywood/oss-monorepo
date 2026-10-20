// Parity: the JS engine must reproduce scikit-learn's predictions for the NLSY97 cohabitation
// (before the wedding) bundles, exported by reproducibility/nlsy97_cohabitation_to_marriage/train_models.py.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, explainTree } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, dir)));

for (const id of ['nlsy97_cohab_marriage', 'nlsy97_cohab_split']) {
  const bundle = load(`${id}.json`);
  const vectors = load(`${id}_testvectors.json`);

  test(`${id}: every model matches Python to 1e-9`, () => {
    let checked = 0;
    for (const model of bundle.models) {
      const expected = vectors.predictions[model.key];
      assert.equal(expected.length, vectors.rows.length);
      vectors.rows.forEach((row, i) => {
        const got = predict(model, row);
        assert.ok(Math.abs(got - expected[i]) / expected[i] < 1e-9, `${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
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

  test(`${id}: metadata the app needs`, () => {
    assert.equal(bundle.stage, 'before');
    assert.ok(bundle.constant_rate > 0 && bundle.constant_rate < 1);
    assert.ok(!Object.keys(bundle.inputs).some((k) => k.startsWith('partner_')), 'partner items leak the outcome');
    const best = Math.max(...bundle.models.map((m) => m.heldout.deviance_improvement_percent));
    assert.ok(best > 0);
  });
}
