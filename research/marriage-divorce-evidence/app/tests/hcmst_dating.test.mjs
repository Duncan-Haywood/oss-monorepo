// Parity: the JS engine must reproduce scikit-learn's predictions for the two HCMST
// before-the-wedding bundles (exported by reproducibility/hcmst_dating_to_marriage/train_models.py).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, explainTree } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, dir)));

for (const id of ['hcmst_dating_marriage', 'hcmst_dating_breakup']) {
  const bundle = load(`${id}.json`);
  const vectors = load(`${id}_testvectors.json`);

  test(`${id}: every model matches Python to 1e-9`, () => {
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

  test(`${id}: metadata the app needs`, () => {
    assert.equal(bundle.outcome, 'probability');
    assert.equal(bundle.stage, 'before');
    assert.equal(bundle.periods.length, 5);
    assert.ok(bundle.constant_probability > 0 && bundle.constant_probability < 1);
    assert.ok(bundle.models.some((m) => m.kind === 'logistic_glm'));
    const best = Math.max(...bundle.models.map((m) => m.heldout.logloss_improvement_percent));
    assert.ok(best > 0, 'the best model beats the constant rate held out');
  });
}
