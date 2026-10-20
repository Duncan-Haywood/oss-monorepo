// Parity: the JS engine must reproduce scikit-learn's predictions for the NLSY79
// individual-level bundle (two populations x four models), including the imputer's
// missing-value indicator, spline extrapolation and unseen categories.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, explainTree } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('nlsy79_individuals.json', dir)));
const vectors = JSON.parse(readFileSync(new URL('nlsy79_individuals_testvectors.json', dir)));
let checked = 0;
for (const pop of bundle.populations) {
  for (const model of pop.models) {
    const expected = vectors.predictions[`${pop.key}/${model.key}`];
    assert.ok(expected, `missing test vectors for ${pop.key}/${model.key}`);
    vectors.rows.forEach((row, i) => {
      const got = predict(model, row);
      const rel = Math.abs(got - expected[i]) / expected[i];
      assert.ok(rel < 1e-9, `${pop.key}/${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
      const c = contributions(model, row);
      if (c) {
        const eta = c.intercept + Object.values(c.terms).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(Math.exp(eta) - got) / got < 1e-12, 'contributions must sum to the prediction');
      } else {
        const t = explainTree(model, row);
        assert.equal(t.rate, got);
        assert.ok(model.leaf_support[String(t.leaf)], 'every reachable leaf has saved support counts');
      }
      checked++;
    });
  }
}

// Tree splits on age are reported in years, matching ml_individuals/*_paths.json (49.5, 52.5).
const tree = bundle.populations[0].models.find((m) => m.key === 'tree_depth2');
const steps = explainTree(tree, { age: 51, first_marriage_age: 25, sex: 'Men', education_model: 'Bachelor' }).steps;
assert.ok(Math.abs(steps[0].rawThreshold - 49.5) < 1e-3, `root split ${steps[0].rawThreshold}`);
assert.ok(Math.abs(steps[1].rawThreshold - 52.5) < 1e-3, `second split ${steps[1].rawThreshold}`);
console.log(`individual engine parity ok: ${checked} predictions across ${bundle.populations.length} populations`);
