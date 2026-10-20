// Individual lens: input mapping, refusal, projection arithmetic, explanations, what-ifs.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { personRow, incomeQuartile, familyIncome, unsupported, project, explain, selfChanges, population } from '../individuals.js';
import { predict } from '../engine.js';

const bundle = JSON.parse(readFileSync(new URL('../models/nlsy79_individuals.json', import.meta.url)));
const a = { sex: 'Man', age: 40, degree: 'PhD', wages: 60000, work: '2,000+ hours', religion: 'Less than weekly', firstMarriageAge: 30 };
const b = { sex: 'Woman', age: 38, degree: 'Bachelor', wages: 50000, work: '1–1,999 hours', religion: 'Never', firstMarriageAge: '' };
const couple = { yearsMarried: 5 };

// Mapping follows annual_nlsy: graduate degrees pooled, family income as a 2020-wave quartile.
const cuts = bundle.income_cutpoints['2020'];
assert.equal(incomeQuartile(bundle, cuts[0]), 'Q1');
assert.equal(incomeQuartile(bundle, cuts[0] + 1), 'Q2');
assert.equal(incomeQuartile(bundle, cuts[2] + 1), 'Q4');
assert.equal(incomeQuartile(bundle, NaN), 'Unknown');
assert.equal(familyIncome(a, b, couple), 110000);
assert.equal(familyIncome(a, b, { familyIncome: 70000 }), 70000);
const ra = personRow(bundle, a, 110000, 3);
assert.equal(ra.education_model, 'Graduate');
assert.equal(ra.age, 43);
assert.equal(ra.sex, 'Men');
assert.equal(ra.income_quartile, 'Q3');
assert.equal(personRow(bundle, b, 110000).first_marriage_age, null);

// Refusals: same-sex couples; separated partner in the currently-married population.
const married = population(bundle);
assert.equal(unsupported(married, a, b).length, 0);
assert.equal(unsupported(married, a, { ...b, sex: 'Man' }).length, 1);
assert.equal(unsupported(married, a, { ...b, separated: true }).length, 1);
assert.equal(unsupported(population(bundle, 'legally_married_including_separated'), a, { ...b, separated: true }).length, 0);

// Projection: couple rate is the mean of both partners' own rates; survival multiplies.
const years = project(bundle, a, b, couple, { horizon: 30 });
const m0 = married.models[0];
const expect0 = (predict(m0, personRow(bundle, a, 110000, 0)) + predict(m0, personRow(bundle, b, 110000, 0))) / 2;
assert.ok(Math.abs(years[0].rates[m0.key] - expect0) < 1e-15);
let s = 1;
for (const y of years.slice(0, 10)) s *= Math.exp(-y.rates[m0.key]);
assert.ok(Math.abs(years[9].survival[m0.key] - s) < 1e-12);
assert.equal(years[0].year, 6);
assert.ok(years[0].inSupport);
assert.ok(!years[29].inSupport, 'ages past 64 are flagged as outside training support');
for (const y of years) assert.ok(y.minSurvival <= y.meanSurvival && y.meanSurvival <= y.maxSurvival);

// Explanations are exact: contributions reproduce the rate; tree leaves carry support counts.
for (const m of married.models) {
  const e = explain(bundle, m, a, 110000);
  const rate = predict(m, personRow(bundle, a, 110000));
  if (m.kind === 'tree') {
    assert.equal(e.tree.rate, rate);
    assert.ok(e.tree.support.respondents > 0);
  } else {
    const eta = e.intercept + e.terms.reduce((x, [, v]) => x + v, 0);
    assert.ok(Math.abs(Math.exp(eta) - rate) / rate < 1e-12);
  }
}

const changes = selfChanges(bundle, 'b', a, b, couple);
assert.ok(changes.length >= 4);
for (const c of changes) assert.ok(c.agree >= 0 && c.agree <= c.models);
console.log(`individual lens ok; 10y no-divorce ${years[9].meanSurvival.toFixed(3)} (range ${years[9].minSurvival.toFixed(3)}–${years[9].maxSurvival.toFixed(3)}); top change ${changes[0].label} ${changes[0].delta.toFixed(4)} (${changes[0].agree}/${changes[0].models} agree)`);
