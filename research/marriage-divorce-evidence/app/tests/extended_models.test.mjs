// Parity for the 2026-10-20 predictor extensions: every bundle with `models_extended` (richer
// family-of-origin, religion, politics, race, occupation and wealth inputs, exported by each lens's
// reproducibility/<lens>/extended_predictors.py) must be reproduced by the browser engine to 1e-9,
// and its additive explanations must sum to the prediction. These models are not scored by the app
// until the form asks for their new inputs; this test keeps them ready.
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, valueFromContributions } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, dir)));
const bundles = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('_testvectors.json') && f !== 'index.json')
  .map((f) => [f, load(f)]).filter(([, b]) => Array.isArray(b.models_extended));

test('at least the lenses re-fitted on 2026-10-20 carry extended models', () => {
  const ids = bundles.map(([, b]) => b.id);
  for (const id of ['gss_panel_marriages', 'nlsy97_first_marriage', 'nlsy79_first_marriage', 'nsfg_pooled_first_marriage', 'canada_gss_first_marriage', 'sipp_prospective_couples']) assert.ok(ids.includes(id), id);
});

for (const [file, bundle] of bundles) {
  test(`${bundle.id}: extended models match Python to 1e-9`, () => {
    const vec = load(file.replace('.json', '_testvectors.json')).extended;
    assert.ok(vec && vec.rows.length >= 20, 'extended test vectors present');
    let checked = 0;
    for (const model of bundle.models_extended) {
      const expected = vec.predictions[model.key];
      assert.equal(expected.length, vec.rows.length, model.key);
      assert.ok(Array.isArray(model.new_inputs) || model.new_inputs === undefined);
      assert.ok(model.heldout && typeof model.heldout === 'object', model.key);
      vec.rows.forEach((row, i) => {
        const got = predict(model, row);
        assert.ok(Math.abs(got - expected[i]) <= 1e-9 * Math.max(1e-12, Math.abs(expected[i])) + 1e-15,
          `${bundle.id} ${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
        const c = contributions(model, row);
        if (c) {
          const back = valueFromContributions(c);
          assert.ok(Math.abs(back - got) <= 1e-9 * Math.abs(got) + 1e-15, `${model.key} contributions`);
        }
        checked++;
      });
    }
    assert.ok(checked > 0);
  });
}
