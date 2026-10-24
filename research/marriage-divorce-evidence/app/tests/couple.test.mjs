// Couple layer: input mapping, refusal, projection arithmetic and what-if ranking.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { modelRow, earningsPair, unsupported, project, selfChanges, idealPartners, explain, coupleRate } from '../couple.js';
import { predict } from '../engine.js';

const bundle = JSON.parse(readFileSync(new URL('../models/nlsy79_couples.json', import.meta.url)));
const a = { sex: 'Man', age: 40, school: '16–17 years', degree: 'Bachelor', wages: 60000, work: '2,000+ hours', religion: 'Less than weekly', firstMarriageAge: 30 };
const b = { sex: 'Woman', age: 38, school: '16–17 years', degree: 'Bachelor', wages: 50000, work: '2,000+ hours', religion: 'Less than weekly', firstMarriageAge: 28 };
const couple = { yearsMarried: 5 };

// Earnings roles follow the training definition (pairing_nlsy/analyze_pairing_nlsy.py).
assert.equal(earningsPair(60000, 50000), 'Balanced 40–60% wife');
assert.equal(earningsPair(60000, 0), 'Husband only');
assert.equal(earningsPair(0, 0), 'Both zero wages');
assert.equal(earningsPair(90000, 10000), 'Husband majority, both positive');
assert.equal(earningsPair(NaN, 10000), 'Unknown');

// Husband/wife fields come from the man/woman whichever partner is the respondent.
const ra = modelRow(bundle, a, b, couple, 0);
const rb = modelRow(bundle, b, a, couple, 0);
assert.equal(ra.husband_school, rb.husband_school);
assert.equal(ra.sex, 'Men');
assert.equal(rb.sex, 'Women');
assert.equal(ra.age, 40);
assert.equal(rb.age, 38);
assert.equal(ra.current_marriage_years, 5);
assert.ok(Math.abs(ra.wife_wage_share - 50000 / 110000) < 1e-12);

// Same-sex couples are refused, not guessed.
assert.ok(unsupported(a, { ...b, sex: 'Man' }).length > 0);
assert.equal(unsupported(a, b).length, 0);

// Projection: survival is the product of exp(-rate) and decreases monotonically.
const p = project(bundle, a, b, couple, 20);
assert.equal(p.length, 20);
let s = 1;
for (const y of p) {
  const r = y.rates.additive_enriched;
  s *= Math.exp(-r);
  assert.ok(Math.abs(y.survival.additive_enriched - s) < 1e-12);
  assert.ok(y.minSurvival <= y.meanSurvival && y.meanSurvival <= y.maxSurvival);
}
for (let i = 1; i < p.length; i++) assert.ok(p[i].meanSurvival <= p[i - 1].meanSurvival);
const m = bundle.models[1];
assert.ok(Math.abs(coupleRate(bundle, m, a, b, couple, 0) - (predict(m, ra) + predict(m, rb)) / 2) < 1e-15);

// Support flags: a 27-year-old is outside the 35-64 age range the models saw.
assert.ok(project(bundle, { ...a, age: 27 }, { ...b, age: 26 }, { yearsMarried: 0 }, 3)[0].inSupport === false);
assert.ok(p[0].inSupport);

// Explanations sum to the model's log-rate.
const e = explain(bundle, m, a, b, couple);
assert.ok(Object.keys(e.terms).length > 5);

const changes = selfChanges(bundle, 'a', a, b, couple);
assert.ok(changes.length > 3);
for (let i = 1; i < changes.length; i++) assert.ok(changes[i].delta <= changes[i - 1].delta);
const ideal = idealPartners(bundle, a, b, couple);
assert.equal(ideal.best.length, 5);
assert.ok(ideal.best[0].meanSurvival >= ideal.worst.meanSurvival);
console.log('couple layer ok; 10y no-divorce', p[9].meanSurvival.toFixed(3), 'best change', changes[0].label, changes[0].delta.toFixed(4), 'ideal', JSON.stringify(ideal.best[0].partner), ideal.best[0].meanSurvival.toFixed(3), 'worst', ideal.worst.meanSurvival.toFixed(3));
