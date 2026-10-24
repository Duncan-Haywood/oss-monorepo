// Parity: the JS engine must reproduce scikit-learn's predictions for every exported model.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('nlsy79_couples.json', dir)));
const vectors = JSON.parse(readFileSync(new URL('nlsy79_couples_testvectors.json', dir)));
let checked = 0;
for (const model of bundle.models) {
  const expected = vectors.predictions[model.key];
  vectors.rows.forEach((row, i) => {
    const got = predict(model, row);
    const rel = Math.abs(got - expected[i]) / expected[i];
    assert.ok(rel < 1e-9, `${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
    const c = contributions(model, row);
    if (c) {
      const eta = c.intercept + Object.values(c.terms).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(Math.exp(eta) - got) / got < 1e-12, 'contributions must sum to the prediction');
    }
    checked++;
  });
}
console.log(`engine parity ok: ${checked} predictions across ${bundle.models.length} models`);
