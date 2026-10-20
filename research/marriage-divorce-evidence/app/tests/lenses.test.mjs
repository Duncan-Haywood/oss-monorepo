// Lens manifest, lens summaries, shareable-scenario encoding and suggestion uncertainty.
import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lensSummary, encodeScenario, decodeScenario, selfChanges, idealPartners, explain, nsfgRow, refusals, lensNotes, project as proj2, coupleChanges, scoringModels, isBaseline, coupleRate, adapterFor, lensView, LENS_POPULATION, excludeReason, shareOod, typicality, lifelong } from '../couple.js';
import { project as indProject, personRow } from '../individuals.js';
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
assert.equal(refusals(bundle, { ...a, raceEth: '', intactFamily: '' }, b, couple).length, 0);
// Inputs not given are neutral in the distance (not counted as unusual), and say so.
assert.ok(typicality(bundle, { ...w, age: 45 }, h, c0).neutralised.includes('husband_school'));

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

// ---- NLSY79 individuals lens: each partner's own traits, via individuals.js ----
const indRaw = JSON.parse(readFileSync(new URL('nlsy79_individuals.json', dir)));
const ind = lensView(indRaw);
assert.equal(ind.population_key, LENS_POPULATION.nlsy79_individuals);
assert.equal(ind.population_key, 'currently_married_only');
assert.ok(Array.isArray(ind.models) && ind.models.length === 4 && ind.constant_rate > 0);
assert.equal(lensView(bundle), bundle, 'single-population bundles pass through');
const indSum = lensSummary(indRaw, manifest.lenses.find((l) => l.file === 'nlsy79_individuals.json'));
assert.equal(indSum.scorable, true);
assert.equal(indSum.training.events, 854);
assert.equal(indSum.best.improvement, 1.945); // additive Poisson, currently married, ml_individuals
assert.ok(indSum.population.includes('currently married'));
// Parity with workstream B's own projection in individuals.js, model by model and year by year.
const pi = proj2(ind, a, b, couple, 30);
const pb = indProject(indRaw, a, b, couple, { horizon: 30 });
for (let k = 0; k < 30; k++) {
  for (const m of ind.models) {
    assert.ok(Math.abs(pi[k].rates[m.key] - pb[k].rates[m.key]) < 1e-15, `rate ${m.key} year ${k}`);
    assert.ok(Math.abs(pi[k].survival[m.key] - pb[k].survival[m.key]) < 1e-12);
  }
  assert.equal(pi[k].inSupport, pb[k].inSupport);
}
assert.equal(coupleRate(ind, ind.models[0], a, b, couple, 0), (predict(ind.models[0], personRow(indRaw, a, 110000, 0)) + predict(ind.models[0], personRow(indRaw, b, 110000, 0))) / 2);
assert.ok(refusals(ind, a, { ...b, sex: 'Man' }, couple).length > 0);
assert.equal(refusals(ind, a, b, couple).length, 0);
const ich = selfChanges(ind, 'a', a, b, couple);
assert.ok(ich.some((o) => o.label === 'Complete a graduate degree'));
assert.ok(ich.every((o) => o.models === 4));
const icc = coupleChanges(ind, a, b, couple);
assert.deepEqual(icc.map((o) => o.label).sort(), ['Family income +25%', 'Family income −25%']);
const iip = idealPartners(ind, a, b, couple);
assert.equal(iip.considered, 5 * 4 * 3);
assert.equal(explain(ind, ind.models.find((m) => m.kind === 'tree'), a, b, couple).tree.length, 2);
console.log(`individuals lens ok; default test couple ${(100 * pi[9].meanSurvival).toFixed(1)}% no divorce by year 10 (models ${(100 * pi[9].minSurvival).toFixed(1)}–${(100 * pi[9].maxSurvival).toFixed(1)}%); ${iip.tied} of ${iip.considered} partner profiles tie with the top`);

// ---- NSFG classical family (workstream B) through the NSFG adapter, and abstention ----
const famRaw = JSON.parse(readFileSync(new URL('nsfg2002_family.json', dir)));
const fam = lensView(famRaw);
assert.equal(adapterFor(fam).id, 'nsfg2002_first_marriage');
assert.equal(lensSummary(fam, manifest.lenses.find((l) => l.file === 'nsfg2002_family.json')).scorable, true);
// Naive Bayes is kept out of averages with a reason; the other three families are averaged.
assert.deepEqual(scoringModels(fam).map((m) => m.key), ['logistic_hazard', 'random_forest', 'gradient_boosting']);
assert.ok(excludeReason(fam.models.find((m) => m.kind === 'naive_bayes')).includes('overconfident'));
assert.equal(excludeReason(scoringModels(fam)[0]), null);
const pf = proj2(fam, w, h, c0, 10);
for (const m of scoringModels(fam)) assert.ok(pf[9].survival[m.key] > 0 && pf[9].survival[m.key] < 1);
// The family and the first-marriage bundle agree to within a few points on the same couple.
assert.ok(Math.abs(pf[9].meanSurvival - pn[9].meanSurvival) < 0.1);
// Explanations carry each model's scale.
assert.equal(explain(fam, fam.models.find((m) => m.kind === 'forest'), w, h, c0).scale, 'rate');
assert.equal(explain(fam, fam.models.find((m) => m.kind === 'logistic_hazard'), w, h, c0).scale, 'hazard_log_odds');
assert.equal(explain(nsfg, m0, w, h, c0).scale, 'log_rate');

// Abstention: B's out-of-distribution percentile, shared with the first-marriage bundle.
const shared = shareOod([{ ...nsfg }, fam, { ...bundle }]);
assert.equal(shared[0].ood, fam.ood, 'first-marriage bundle borrows the family OOD spec');
assert.equal(shared[2].ood, bundle.ood, 'the NLSY79 couples bundle keeps its own spec');
const nsfgO = shared[0];
const typical = typicality(nsfgO, w, h, c0);
assert.ok(typical.percentile < 99 && !typical.abstain);
assert.ok(lensNotes(nsfgO, w, h, c0).some((n) => n.startsWith('Typicality')));
assert.equal(refusals(nsfgO, w, h, c0).length, 0);
// A wife of 17 and husband of 50 on the wedding day are each inside the per-input ranges,
// but together unusual enough that the lens abstains.
const odd = [{ ...w, age: 17 }, { ...h, age: 50 }];
assert.equal(refusals(nsfg, ...odd, c0).length, 0, 'range checks alone accept it');
const t2 = typicality(nsfgO, ...odd, c0);
assert.ok(t2.abstain, `percentile ${t2.percentile}`);
assert.ok(refusals(nsfgO, ...odd, c0).some((x) => x.includes('abstains')));
// NLSY79 couples: its own couple-interval OOD spec, scored on both perspectives' rows.
const tn = typicality(bundle, a, b, couple);
assert.equal(tn.perspectives, 2);
assert.ok(tn.percentile < 99 && !tn.abstain);
assert.equal(typicality(ind, a, b, couple), null, 'no spec, no score');
console.log(`nsfg family ok: ${(100 * pf[9].meanSurvival).toFixed(1)}% vs ${(100 * pn[9].meanSurvival).toFixed(1)}% (first-marriage bundle) by year 10; typical couple at the ${typical.percentile.toFixed(0)}th percentile, 17/50 at the ${t2.percentile.toFixed(1)}th (abstains)`);

// ---- Lifelong estimate with competing mortality (workstream A's mortality.js) ----
const mtable = JSON.parse(readFileSync(new URL('../data/us_mortality_wpp2024.json', import.meta.url)));
const cy = { ...couple, currentYear: 2026 };
const life = lifelong(bundle, mtable, a, b, cy, 40);
assert.deepEqual(Object.keys(life.per).sort(), scoringModels(bundle).map((m) => m.key).sort());
for (const r of Object.values(life.per)) {
  assert.equal(r.years, 40);
  assert.ok(Math.abs(r.p_divorce + r.p_widowhood + r.p_still_married - 1) < 1e-12, 'the three ends add to 1');
}
for (const k of ['divorce', 'widowhood', 'stillMarried']) assert.ok(life[k].min <= life[k].mean && life[k].mean <= life[k].max);
// With zero mortality it reduces exactly to today's no-divorce projection.
const zero = { ...mtable, mxM: mtable.mxM.map((r) => r.map(() => 0)), mxF: mtable.mxF.map((r) => r.map(() => 0)) };
const z = lifelong(bundle, zero, a, b, cy, 40);
const p40 = proj2(bundle, a, b, cy, 40)[39];
for (const m of scoringModels(bundle)) {
  assert.ok(Math.abs(z.per[m.key].p_still_married - p40.survival[m.key]) < 1e-12);
  assert.equal(z.per[m.key].p_widowhood, 0);
}
// Mortality only takes away from "still married"; it can only lower the divorce share.
assert.ok(life.divorce.mean < z.divorce.mean && life.stillMarried.mean < z.stillMarried.mean);
// Same machinery for every scorable lens.
assert.equal(Object.keys(lifelong(nsfgO, mtable, w, h, c0, 30).per).length, 2);
console.log(`lifelong ok: default couple over 40 years: ${(100 * life.widowhood.mean).toFixed(1)}% end only at a death (models ${(100 * life.widowhood.min).toFixed(1)}–${(100 * life.widowhood.max).toFixed(1)}), ${(100 * life.divorce.mean).toFixed(1)}% in divorce, ${(100 * life.stillMarried.mean).toFixed(1)}% still married with both alive`);
