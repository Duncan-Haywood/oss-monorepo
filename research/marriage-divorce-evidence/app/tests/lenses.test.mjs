// Lens manifest, lens summaries, shareable-scenario encoding and suggestion uncertainty.
import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lensSummary, encodeScenario, decodeScenario, selfChanges, idealPartners } from '../couple.js';

const dir = new URL('../models/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('index.json', dir)));

// Every bundle in models/ is listed in the manifest, and every listed file exists and parses.
const bundles = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json' && !f.endsWith('_testvectors.json'));
const listed = manifest.lenses.map((l) => l.file);
for (const f of bundles) assert.ok(listed.includes(f), `models/${f} is not listed in models/index.json`);
assert.equal(new Set(listed).size, listed.length, 'duplicate manifest entry');
for (const entry of manifest.lenses) {
  const b = JSON.parse(readFileSync(new URL(entry.file, dir)));
  const s = lensSummary(b, entry);
  assert.ok(s.label && s.population && s.target, `${entry.file}: lens needs a label, population and target`);
}

const bundle = JSON.parse(readFileSync(new URL('nlsy79_couples.json', dir)));
const s = lensSummary(bundle, manifest.lenses[0]);
assert.equal(s.scorable, true);
assert.equal(s.models, 5);
assert.equal(s.best.improvement, 3.402); // additive enriched, ml_couples/heldout_model_comparison.csv
assert.equal(s.training.events, 726);
// A bundle with an unknown adapter is listed but not scored.
assert.equal(lensSummary({ id: 'other', source: 'x', target: 'y', models: [] }, {}).scorable, false);
assert.equal(lensSummary({ ...bundle, id: 'gss' }, { adapter: 'gss' }).scorable, false);

// Scenarios round-trip through the URL fragment.
const fields = { 'a.sex': 'Woman', 'a.age': '36', 'a.school': '16–17 years', 'a.degree': 'Bachelor', 'a.wages': '55000', 'a.priorMarriage': true, 'a.firstMarriageAge': '', 'b.sex': 'Man', 'b.religion': 'Never', yearsMarried: '3', horizon: '30', lens: 'nlsy79_couples' };
const hash = encodeScenario(fields);
assert.ok(hash.startsWith('#'));
const back = decodeScenario(hash);
assert.equal(back['a.sex'], 'Woman');
assert.equal(back['a.school'], '16–17 years');
assert.equal(back['a.priorMarriage'], '1');
assert.equal(back['a.wages'], '55000');
assert.equal(back.horizon, '30');
assert.equal(back.lens, 'nlsy79_couples');
assert.ok(!('a.firstMarriageAge' in back), 'blank fields are omitted');
// Unknown fields, disallowed values and out-of-range numbers are dropped.
const bad = decodeScenario('#a.sex=Robot&a.age=500&b.age=40&evil=%3Cscript%3E&a.degree=PhD&lens=..%2Fx&c.age=3&horizon=7');
assert.deepEqual(bad, { 'b.age': '40', 'a.degree': 'PhD' });
assert.deepEqual(decodeScenario(''), {});
assert.deepEqual(decodeScenario(undefined), {});

// Suggestions carry the model range and an agreement count consistent with it.
const a = { sex: 'Man', age: 40, school: '16–17 years', degree: 'Bachelor', wages: 60000, work: '2,000+ hours', religion: 'Less than weekly', firstMarriageAge: 30 };
const b = { sex: 'Woman', age: 38, school: '16–17 years', degree: 'Bachelor', wages: 50000, work: '2,000+ hours', religion: 'Less than weekly', firstMarriageAge: 28 };
const couple = { yearsMarried: 5 };
for (const o of selfChanges(bundle, 'b', a, b, couple)) {
  assert.ok(o.lo <= o.delta + 1e-15 && o.delta <= o.hi + 1e-15);
  assert.ok(o.agree >= 0 && o.agree <= o.models);
  if (o.lo > 0) assert.equal(o.agree, o.models);
}
const ideal = idealPartners(bundle, a, b, couple);
assert.equal(ideal.considered, 5 * 5 * 6);
assert.ok(ideal.tied >= 1 && ideal.tied <= ideal.considered);
assert.ok(ideal.best[0].beats >= 0 && ideal.best[0].beats <= 5);
assert.ok(ideal.current.minSurvival <= ideal.current.meanSurvival);
console.log(`lenses ok; ${listed.length} lens(es); ${ideal.tied} of ${ideal.considered} partner profiles overlap the top one's model range`);
assert.equal(ideal.perModelTop.length, 5);
assert.ok(ideal.distinctTops >= 1 && ideal.distinctTops <= 5);
for (const t of ideal.perModelTop) assert.ok(t.survival >= ideal.best[0].minSurvival - 1e-12);
console.log('per-model top partner profiles:', ideal.distinctTops, 'distinct;', ideal.perModelTop.map((t) => `${t.model}: ${t.partner.age}/${t.partner.degree}/$${t.partner.wages}`).join('; '));
