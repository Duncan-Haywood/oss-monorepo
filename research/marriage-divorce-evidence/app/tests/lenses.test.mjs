// Lens manifest, lens summaries, shareable-scenario encoding and suggestion uncertainty.
import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lensSummary, encodeScenario, decodeScenario, selfChanges, idealPartners, explain, nsfgRow, refusals, lensNotes, project as proj2, coupleChanges, scoringModels, isBaseline, coupleRate, adapterFor } from '../couple.js';
import { predict } from '../engine.js';

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

// ---- NSFG 2002 lens adapter (first marriages, the wife's report) ----
const nsfg = JSON.parse(readFileSync(new URL('nsfg2002_first_marriage.json', dir)));
const nsfgEntry = manifest.lenses.find((l) => l.file === 'nsfg2002_first_marriage.json');
assert.equal(lensSummary(nsfg, nsfgEntry).scorable, true);
assert.equal(adapterFor(nsfg).id, 'nsfg2002_first_marriage');
assert.equal(adapterFor(bundle).id, 'nlsy79_couples');

const w = { sex: 'Woman', age: 27, raceEth: 'White', intactFamily: 'Yes', priorMarriage: false };
const h = { sex: 'Man', age: 29, raceEth: 'Hispanic', priorChildren: 'Yes', priorMarriage: true };
const c0 = { yearsMarried: 0, cohabitedFirst: 'Yes', currentYear: 2026 };
// Row mapping is order-free (who is "you" does not matter) and follows the bundle's inputs.
const r = nsfgRow(nsfg, h, w, c0, 3);
assert.deepEqual(r, nsfgRow(nsfg, w, h, c0, 3));
assert.equal(r.marriage_years, 3);
assert.equal(r.wife_age_at_marriage, 27);
assert.equal(r.husband_age_at_marriage, 29);
assert.equal(r.wedding_year, nsfg.support.wedding_year[1], 'held at the latest wedding year in the data');
assert.equal(r.husband_married_before, 'Yes');
assert.equal(r.husband_prior_children, 'Yes');
assert.equal(r.same_race_ethnicity, 'Different');
assert.equal(r.cohabited_first, 'Yes');
assert.equal(nsfgRow(nsfg, w, h, { ...c0, yearsMarried: 10 }, 0).wife_age_at_marriage, 17);
assert.equal(nsfgRow(nsfg, w, h, { yearsMarried: 30, currentYear: 2026 }, 0).wedding_year, 1996);
assert.equal(nsfgRow(nsfg, w, h, {}, 0).cohabited_first, 'Unknown');
assert.equal(nsfgRow(nsfg, w, { ...h, raceEth: '' }, c0, 0).same_race_ethnicity, 'Unknown');
assert.ok(lensNotes(nsfg, w, h, c0)[0].includes('2002'));
assert.equal(lensNotes(nsfg, w, h, { ...c0, yearsMarried: 30 }).length, 0);

// One perspective: the couple's rate is the model's prediction on the wife's row.
const m0 = nsfg.models.find((m) => m.key === 'additive_spline');
assert.equal(coupleRate(nsfg, m0, w, h, c0, 2), predict(m0, nsfgRow(nsfg, w, h, c0, 2)));

// Refusals: same-sex, wife married before, wedding ages outside the data, missing required inputs.
assert.equal(refusals(nsfg, w, h, c0).length, 0);
assert.ok(refusals(nsfg, w, { ...h, sex: 'Woman' }, c0).length);
assert.ok(refusals(nsfg, { ...w, priorMarriage: true }, h, c0).some((x) => x.includes('first marriages')));
assert.ok(refusals(nsfg, { ...w, age: 45 }, h, c0).some((x) => x.includes('wife’s age')));
assert.ok(refusals(nsfg, w, { ...h, age: 16 }, c0).some((x) => x.includes('husband’s age')));
assert.ok(refusals(nsfg, { ...w, raceEth: '' }, h, c0).some((x) => x.includes('race-ethnicity')));
assert.ok(refusals(nsfg, { ...w, intactFamily: '' }, h, c0).some((x) => x.includes('both parents')));
// The husband's earlier marriage is an input, not a refusal.
assert.equal(refusals(nsfg, w, { ...h, priorMarriage: true }, c0).length, 0);
// NLSY79 refusals are unchanged by the NSFG-only inputs.
assert.equal(refusals(bundle, { ...w, age: 45, raceEth: '' }, h, c0).length, 0);

// The duration-only curve is a baseline: shown, but not averaged.
assert.deepEqual(scoringModels(nsfg).map((m) => m.key), ['additive_spline', 'tree_depth3']);
assert.ok(nsfg.models.some(isBaseline));
assert.equal(scoringModels(bundle).length, 5);
const pn = proj2(nsfg, w, h, c0, 30);
assert.deepEqual(Object.keys(pn[0].survival).sort(), ['additive_spline', 'tree_depth3']);
assert.ok(pn[23].inSupport && !pn[24].inSupport, 'year 25 is beyond the 0–23 completed years in the data');
for (let i = 1; i < pn.length; i++) assert.ok(pn[i].meanSurvival < pn[i - 1].meanSurvival);

// Tree explanations come back one per perspective.
assert.equal(explain(nsfg, nsfg.models.find((m) => m.kind === 'tree'), w, h, c0).tree.length, 1);
assert.equal(explain(bundle, bundle.models.find((m) => m.kind === 'tree'), a, b, couple).tree.length, 2);

// Couple-level changes: cohabitation and wedding timing; none for people already married.
const cc = coupleChanges(nsfg, w, h, { ...c0, cohabitedFirst: 'Unknown' });
assert.ok(cc.some((o) => o.label.startsWith('Live together')) && cc.some((o) => o.label.startsWith('Do not live')));
assert.ok(cc.some((o) => o.label.startsWith('Marry 2 years later')));
assert.ok(!coupleChanges(nsfg, w, h, { ...c0, yearsMarried: 3 }).some((o) => o.label.startsWith('Marry')));
for (const o of cc) assert.ok(o.models === 2 && o.lo <= o.delta + 1e-15 && o.delta <= o.hi + 1e-15);
// Changes that would push the wife outside the data are dropped, not scored.
assert.ok(!coupleChanges(nsfg, { ...w, age: 37 }, h, c0).some((o) => o.label.startsWith('Marry 5')));
assert.equal(selfChanges(nsfg, 'a', w, h, c0).length, 0);
assert.equal(coupleChanges(bundle, a, b, couple).length, 0);

// Partner search on this lens varies age, earlier marriage and children, and skips unscorable partners.
const ip = idealPartners(nsfg, w, h, c0);
assert.equal(ip.considered, 7 * 2 * 2);
assert.equal(ip.models, 2);
assert.ok(ip.best[0].description.startsWith('age '));
assert.ok(idealPartners(nsfg, { ...w, age: 21 }, h, c0).considered < 28, 'partners under 17 at the wedding are skipped');

// Scenario links carry the NSFG inputs.
const sc = decodeScenario(encodeScenario({ 'a.raceEth': 'Black', 'b.priorChildren': 'Yes', 'a.intactFamily': 'No', cohabitedFirst: 'No', 'a.raceEth2': 'x' }));
assert.deepEqual(sc, { 'a.raceEth': 'Black', 'b.priorChildren': 'Yes', 'a.intactFamily': 'No', cohabitedFirst: 'No' });
console.log(`nsfg lens ok; 27/29 couple, cohabited, husband married before with children: ${(100 * pn[9].meanSurvival).toFixed(1)}% no break-up by year 10 (models ${(100 * pn[9].minSurvival).toFixed(1)}–${(100 * pn[9].maxSurvival).toFixed(1)}%)`);
