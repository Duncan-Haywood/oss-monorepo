// Parity: the JS engine reproduces scikit-learn for the NSFG 2002 classical model family
// (logistic hazard, naive Bayes, random forest, gradient boosting), and every model's
// explanation is exact: its contributions reproduce the prediction.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict, contributions, valueFromContributions } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('nsfg2002_family.json', dir)));
const vectors = JSON.parse(readFileSync(new URL('nsfg2002_family_testvectors.json', dir)));
const kinds = new Set(bundle.models.map((m) => m.kind));
for (const k of ['logistic_hazard', 'naive_bayes', 'forest', 'boosted']) assert.ok(kinds.has(k), `bundle lacks ${k}`);
let checked = 0;
for (const model of bundle.models) {
  const expected = vectors.predictions[model.key];
  vectors.rows.forEach((row, i) => {
    const got = predict(model, row);
    const rel = Math.abs(got - expected[i]) / expected[i];
    assert.ok(rel < 1e-9, `${model.key} row ${i}: js ${got} vs python ${expected[i]}`);
    const c = contributions(model, row);
    assert.ok(Math.abs(valueFromContributions(c) - got) / got < 1e-12, `${model.key} row ${i}: contributions must reproduce the rate`);
    checked++;
  });
}

// Every model reports held-out skill with a person-bootstrap interval and calibration.
for (const m of bundle.models) {
  assert.ok(m.heldout.ci95[0] <= m.heldout.deviance_improvement_percent && m.heldout.deviance_improvement_percent <= m.heldout.ci95[1]);
  assert.equal(m.heldout.calibration.length, 10);
}
assert.equal(bundle.comparison.constant.deviance_improvement_percent, 0);

// An unseen category adds nothing to naive Bayes rather than failing.
const nb = bundle.models.find((m) => m.kind === 'naive_bayes');
const row = vectors.rows[1];
const a = contributions(nb, row);
const b = contributions(nb, { ...row, wife_race_ethnicity: 'Not a category' });
assert.equal(b.terms.wife_race_ethnicity, undefined);
assert.equal(a.terms.marriage_years, b.terms.marriage_years);
console.log(`nsfg2002 family parity ok: ${checked} predictions across ${bundle.models.length} models`);
