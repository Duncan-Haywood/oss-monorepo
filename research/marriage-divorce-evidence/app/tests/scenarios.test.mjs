// Compare scenarios: list operations, vary-one-thing, the per-lens comparison (diff vs baseline,
// model agreement, never pooled), privacy of links/CSV/storage, import validation and the cap.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lensView, expandLens, lensSummary, shareOod, scoringModels, primaryHorizon, lensHorizons } from '../couple.js';
import { summariseLens } from '../summary.js';
import { parseCsv } from '../batch.js';
import {
  MAX_SCENARIOS, MAX_VARY, CSV_HEADER, cleanFields, cleanLit, inputsFromFields, addScenario, duplicateScenario, renameScenario, deleteScenario, moveScenario, updateScenario,
  autoName, varyOne, VARY_FIELDS, summariseScenarios, cellAt, diffVsBaseline, lensComparison, defaultLenses, comparisonCsv, exportJson, importJson,
  encodeScenarioLink, decodeScenarioLink, isSensitive, fieldSpec, verdictText, probLowerFromDraws,
} from '../scenarios.js';
import { LIT_SENSITIVE } from '../literature-ui.js';

const dir = new URL('../models/', import.meta.url);
const lenses = JSON.parse(readFileSync(new URL('index.json', dir))).lenses.flatMap((entry) => expandLens(lensView(JSON.parse(readFileSync(new URL(entry.file, dir))))).map((bundle) => ({ entry, bundle, summary: lensSummary(bundle, bundle.view_of ? {} : entry) })));
shareOod(lenses.map((l) => l.bundle));
const YEAR = 2026;

// A filled-in form, as app.js's formFields() reads it (strings, a boolean checkbox, blanks).
const FORM = {
  'a.sex': 'Woman', 'a.age': '28', 'a.school': '16–17 years', 'a.degree': 'Bachelor', 'a.wages': '52000', 'a.work': '2,000+ hours', 'a.religion': 'Less than weekly', 'a.priorMarriage': false, 'a.firstMarriageAge': '',
  'a.priorChildren': 'No', 'a.intactFamily': 'Yes', 'a.raceEth': 'White', 'a.bornUS': 'Yes', 'a.quality': 'Excellent', 'a.hapmar': 'Very happy', 'a.party': 'Democrat', 'a.kidsBefore': '0', 'a.priorPartners': '0', 'a.enrolled': 'No', 'a.motherEdu': 'Some college', 'a.motherAgeFirst': '20–24',
  'b.sex': 'Man', 'b.age': '30', 'b.school': '13–15 years', 'b.degree': 'Some college', 'b.wages': '60000', 'b.work': '2,000+ hours', 'b.religion': 'Never', 'b.priorMarriage': false, 'b.firstMarriageAge': '',
  'b.priorChildren': 'No', 'b.intactFamily': 'Yes', 'b.raceEth': 'White', 'b.quality': 'Good', 'b.hapmar': 'Very happy', 'b.party': 'Republican',
  yearsMarried: '0', familyIncome: '', cohabitedFirst: 'Yes', horizon: '40', status: 'Married, living together', yearsTogether: '3', howMet: 'Online', childrenHome: '0', place: 'U.S. — South', state: 'TX', expecting: 'No', homeOwner: 'No',
  lens: 'nlsy79_couples',
};
const SENSITIVE_FORM = { 'a.substance': 'Yes', 'b.abuse': 'Yes', 'a.lowMood': 'No', 'b.ace': 'Yes', 'a.hostTo1': 'Often', 'a.hostBy2': 'Once or twice' };
const fields = cleanFields(FORM).fields;

test('a form round-trips: cleaned fields give the same model inputs as the form itself', () => {
  assert.equal(fields.lens, undefined, 'the lens select is not part of a scenario');
  assert.equal(fields['a.priorMarriage'], undefined, 'an unticked box is left out');
  assert.equal(fields.familyIncome, undefined, 'blank answers are left out');
  const x = inputsFromFields(FORM, { currentYear: YEAR });
  const y = inputsFromFields(fields, { currentYear: YEAR });
  assert.deepEqual(y, x);
  assert.equal(x.a.firstMarriageAge, 28, 'derived like the form');
  assert.ok(Number.isNaN(inputsFromFields({ ...fields, 'a.wages': '' }).a.wages));
  // Sensitive answers are kept in memory and still reach the scorers (hostility sum, flags).
  const full = cleanFields({ ...FORM, ...SENSITIVE_FORM }).fields;
  assert.equal(full['a.substance'], 'Yes');
  assert.equal(inputsFromFields(full).a.substance, 'Yes');
  // Out-of-range or unknown values are dropped and listed when capturing the form.
  const bad = cleanFields({ ...FORM, 'a.age': '140', 'a.degree': 'Wizard' });
  assert.equal(bad.fields['a.age'], undefined);
  assert.equal(bad.errors.length, 2);
});

test('save, rename, duplicate, delete, reorder and update', () => {
  let list = [];
  let r = addScenario(list, { fields });
  list = r.list;
  assert.equal(r.scenario.name, 'Scenario 1');
  assert.equal(autoName(list), 'Scenario 2');
  r = addScenario(list, { name: '  Later wedding\n', fields: { ...fields, 'a.age': '33' } });
  list = r.list;
  assert.equal(r.scenario.name, 'Later wedding', 'names are cleaned');
  assert.notEqual(list[0].id, list[1].id);
  r = duplicateScenario(list, list[0].id);
  list = r.list;
  assert.deepEqual(list.map((s) => s.name), ['Scenario 1', 'Scenario 1 (copy)', 'Later wedding']);
  assert.deepEqual(list[1].fields, list[0].fields);
  assert.notEqual(list[1].fields, list[0].fields, 'a copy, not a shared object');
  list = renameScenario(list, list[1].id, 'Later wedding');
  assert.equal(list[1].name, 'Later wedding (2)', 'names stay unique');
  list = renameScenario(list, list[1].id, '   ');
  assert.equal(list[1].name, 'Later wedding (2)', 'a blank rename is ignored');
  const ids = list.map((s) => s.id);
  assert.deepEqual(moveScenario(list, ids[2], -1).map((s) => s.id), [ids[0], ids[2], ids[1]]);
  assert.equal(moveScenario(list, ids[0], -1), list, 'the first cannot move up');
  assert.deepEqual(deleteScenario(list, ids[1]).map((s) => s.id), [ids[0], ids[2]]);
  const up = updateScenario(list, ids[0], { fields: { ...fields, cohabitedFirst: 'No' }, lit: { depression: 'yes' } });
  assert.equal(up[0].fields.cohabitedFirst, 'No');
  assert.equal(list[0].fields.cohabitedFirst, 'Yes', 'the old list is untouched');
});

test(`the cap: at most ${MAX_SCENARIOS} scenarios, with a clear message`, () => {
  let list = [];
  for (let i = 0; i < MAX_SCENARIOS; i++) list = addScenario(list, { fields }).list;
  assert.equal(list.length, MAX_SCENARIOS);
  const r = addScenario(list, { fields });
  assert.equal(r.list, list);
  assert.match(r.error, /50 scenarios, the most this page keeps/);
  assert.match(duplicateScenario(list, list[0].id).error, /most this page keeps/);
  assert.equal(varyOne({ name: 'x', fields }, 'a.degree', { existing: MAX_SCENARIOS }).scenarios.length, 0);
});

test('vary one thing: one copy per other allowed value, labelled and capped', () => {
  const base = { name: 'Us', fields, lit: { depression: 'no' } };
  const v = varyOne(base, 'a.degree');
  assert.equal(v.scenarios.length, 7, 'eight degrees minus the one already chosen');
  assert.ok(v.skipped.some((s) => s.value === 'Bachelor' && /as in the starting/.test(s.reason)));
  for (const s of v.scenarios) {
    const changed = Object.keys({ ...s.fields, ...fields }).filter((k) => s.fields[k] !== fields[k]);
    assert.deepEqual(changed, ['a.degree'], 'only the varied field changes');
    assert.match(s.name, /^Us · Your highest degree: /);
    assert.deepEqual(s.lit, base.lit);
  }
  // Age at the wedding moves the age today (years married fixed) and stays inside 16–100.
  const m = varyOne({ name: 'Us', fields: { ...fields, yearsMarried: '5', 'a.age': '33' } }, 'a.marriageAge');
  assert.deepEqual(m.scenarios.map((s) => s.fields['a.age']), ['23', '25', '27', '30', '35', '40', '45'], '28 is the current age at the wedding');
  // Years married keeps both ages at the wedding.
  const y = varyOne(base, 'yearsMarried');
  for (const s of y.scenarios) assert.equal(Number(s.fields['a.age']) - Number(s.fields.yearsMarried || 0), 28);
  // Blank is a value for "not sure".
  const c = varyOne(base, 'cohabitedFirst');
  assert.deepEqual(c.scenarios.map((s) => s.fields.cohabitedFirst), ['No', undefined]);
  assert.match(c.scenarios[1].name, /Not sure/);
  // Capped per click and by the room left.
  assert.equal(varyOne(base, 'howMet').scenarios.length, 7);
  assert.equal(varyOne(base, 'howMet', { cap: 3 }).scenarios.length, 3);
  assert.equal(varyOne(base, 'howMet', { existing: MAX_SCENARIOS - 2 }).scenarios.length, 2);
  assert.ok(varyOne(base, 'howMet', { existing: MAX_SCENARIOS - 2 }).skipped.some((s) => /50-scenario limit/.test(s.reason)));
  // Every variable field has values, and none is sensitive.
  // Age, timing and family background are marked fixed (never offered as a change to make).
  for (const k of ['a.marriageAge', 'b.marriageAge', 'yearsMarried', 'a.intactFamily', 'b.intactFamily', 'a.priorMarriage']) assert.equal(VARY_FIELDS.find((f) => f.key === k).fixed, true, k);
  assert.ok(!VARY_FIELDS.some((f) => /raceEth|\.sex$|\.age$/.test(f.key)), 'race, sex and age today are never varied');
  for (const f of VARY_FIELDS) {
    assert.ok(!isSensitive(f.key), f.key);
    const out = varyOne(base, f.key);
    assert.ok(out.scenarios.length + out.skipped.length >= 2, f.key);
    assert.ok(out.scenarios.length <= MAX_VARY);
  }
  assert.ok(varyOne(base, 'a.substance').error);
});

// Three scenarios that differ only in relationship quality, compared in HCMST (which models it)
// and NLSY79 couples (which does not).
const scen = [];
{
  let list = [];
  for (const [name, q] of [['Excellent', 'Excellent'], ['Fair', 'Fair'], ['Poor', 'Poor or very poor']]) list = addScenario(list, { name, fields: { ...fields, 'a.quality': q, 'b.quality': q } }).list;
  scen.push(...list);
}
const ids = ['hcmst_couples', 'nlsy79_couples', 'nsfg2002_first_marriage'];
const sums = summariseScenarios(lenses, scen, ids, { currentYear: YEAR });

test('the comparison reuses summary.js and diffs within one lens against the baseline', () => {
  const hc = lenses.find((l) => l.summary.id === 'hcmst_couples');
  const c = lensComparison(hc, sums.hcmst_couples, scen, { baselineId: scen[0].id });
  assert.equal(c.horizon, primaryHorizon(hc.bundle));
  assert.equal(c.rows.length, 3);
  assert.equal(c.rows[0].baseline, true);
  assert.equal(c.rows[0].diff, null);
  // Same numbers as the summary across lenses for the same couple.
  const x = inputsFromFields(scen[1].fields, { currentYear: YEAR });
  const direct = summariseLens(hc, x.a, x.b, x.couple).horizons.find((h) => h.h === c.horizon);
  assert.ok(Math.abs(c.rows[1].risk - (1 - direct.mean)) < 1e-12);
  assert.ok(c.rows[1].riskMin <= c.rows[1].risk + 1e-12 && c.rows[1].risk <= c.rows[1].riskMax + 1e-12);
  // Worse relationship quality raises HCMST's break-up risk, and the models agree.
  const d = c.rows[2].diff;
  assert.ok(d.points > 0 && d.ratio > 1, JSON.stringify(d));
  assert.equal(d.direction, 1);
  assert.equal(d.models, scoringModels(hc.bundle).length);
  // Paired: HCMST's third model does not read relationship quality, the other two move up by
  // several points each, so a strict majority agrees (not "cannot tell apart").
  assert.equal(d.verdict, 'majority', verdictText(d));
  assert.deepEqual([d.k, d.n, d.flat], [2, 3, 1]);
  assert.equal(d.cannotTell, false);
  assert.match(verdictText(d), /^Most models agree \(2 of 3\): higher risk by \d+\.\d–\d+\.\d points; 1 does not move$/);
  assert.equal(d.probLower, null, 'no lens publishes posterior draws yet');
  assert.ok(Math.abs(d.points - (c.rows[2].risk - c.rows[0].risk)) < 1e-15);
  assert.ok(Math.abs(d.ratio - c.rows[2].risk / c.rows[0].risk) < 1e-12);
  // NLSY79 couples does not read relationship quality: no change, every model unchanged.
  const nl = lenses.find((l) => l.summary.id === 'nlsy79_couples');
  const n = lensComparison(nl, sums.nlsy79_couples, scen, { baselineId: scen[0].id });
  for (const r of n.rows.slice(1)) {
    assert.equal(r.diff.verdict, 'tiny');
    assert.equal(r.diff.flat, r.diff.models);
    assert.equal(r.diff.cannotTell, true);
    assert.equal(verdictText(r.diff), 'No difference: none of the 5 models move');
  }
  // A different baseline flips the sign.
  const c2 = lensComparison(hc, sums.hcmst_couples, scen, { baselineId: scen[2].id });
  assert.ok(c2.rows[0].diff.points < 0);
  assert.equal(c2.baselineIndex, 2);
});

test('the paired rule: each model’s own difference decides agree, majority, split or too small', () => {
  const base = { status: 'ok', risk: 0.2, perModel: { m1: 0.2, m2: 0.2, m3: 0.2, m4: 0.2 } };
  const opt = (...ds) => ({ status: 'ok', risk: 0.2 + ds.reduce((t, x) => t + x, 0) / ds.length, perModel: Object.fromEntries(ds.map((x, i) => [`m${i + 1}`, 0.2 + x])) });
  // All agree, every move at least 1 point.
  let d = diffVsBaseline(opt(0.03, 0.05, 0.02, 0.04), base);
  assert.deepEqual([d.verdict, d.direction, d.k, d.n, d.cannotTell], ['agree', 1, 4, 4, false]);
  assert.equal(verdictText(d), 'Models agree: higher risk by 2.0–5.0 points (4 of 4)');
  assert.ok(Math.abs(d.points - 0.035) < 1e-12 && Math.abs(d.lo - 0.02) < 1e-12 && Math.abs(d.hi - 0.05) < 1e-12);
  assert.ok(Math.abs(d.ratio - 0.235 / 0.2) < 1e-12);
  d = diffVsBaseline(opt(-0.03, -0.05, -0.02, -0.04), base);
  assert.equal(verdictText(d), 'Models agree: lower risk by 2.0–5.0 points (4 of 4)');
  // Majority: 3 of 4 lower, median move at least 1 point.
  d = diffVsBaseline(opt(-0.03, -0.02, -0.04, 0.01), base);
  assert.deepEqual([d.verdict, d.direction, d.k, d.against], ['majority', -1, 3, 1]);
  assert.equal(verdictText(d), 'Most models agree (3 of 4): lower risk by 2.0–4.0 points; 1 moves the other way');
  // All the same way but one move under a point: a majority, not "agree".
  assert.equal(diffVsBaseline(opt(0.03, 0.002, 0.04, 0.05), base).verdict, 'majority');
  // Split: no strict majority on the direction.
  d = diffVsBaseline(opt(0.05, 0.04, -0.03, -0.06), base);
  assert.deepEqual([d.verdict, d.cannotTell], ['split', true]);
  assert.equal(verdictText(d), 'Cannot tell apart: models disagree on the direction (2 higher, 2 lower, of 4)');
  // All tiny: every move under 1 point, even if they all agree.
  d = diffVsBaseline(opt(0.004, 0.009, 0.001, 0.006), base);
  assert.deepEqual([d.verdict, d.cannotTell], ['tiny', true]);
  assert.equal(verdictText(d), 'Cannot tell apart: too small to matter (under 1 point)');
  // A majority whose median move is under a point is too small as well.
  assert.equal(diffVsBaseline(opt(0.004, 0.006, 0.05, -0.02), base).verdict, 'tiny');
  assert.equal(diffVsBaseline({ status: 'abstain' }, base), null);
  assert.equal(diffVsBaseline(opt(0.03), { status: 'abstain' }), null);
  // Posterior draws plug in as the probability the option is lower.
  assert.equal(probLowerFromDraws([0.1, 0.3, 0.2, 0.15], [0.2, 0.2, 0.2, 0.2]), 0.5);
  assert.equal(probLowerFromDraws([0.1], [0.2, 0.3]), null);
  d = diffVsBaseline({ ...opt(-0.03, -0.02, -0.04, -0.05), draws: [0.1, 0.15, 0.25] }, { ...base, draws: [0.2, 0.2, 0.2] });
  assert.ok(Math.abs(d.probLower - 2 / 3) < 1e-12);
});

test('refusals and missing horizons are cells with a reason, never a number', () => {
  const nsfg = lenses.find((l) => l.summary.id === 'nsfg2002_first_marriage');
  const married = addScenario(scen, { name: 'Wife married before', fields: { ...fields, 'a.priorMarriage': '1', 'a.firstMarriageAge': '22' } }).list;
  const s = summariseScenarios(lenses, married, ['nsfg2002_first_marriage'], { currentYear: YEAR });
  const c = lensComparison(nsfg, s.nsfg2002_first_marriage, married, { baselineId: married[0].id });
  const last = c.rows[c.rows.length - 1];
  assert.equal(last.status, 'abstain');
  assert.ok(last.reason.length > 10);
  assert.equal(last.risk, undefined);
  assert.equal(last.diff, null);
  const gss = lenses.find((l) => l.summary.id === 'gss_panel_marriages');
  const g = summariseLens(gss, inputsFromFields(fields).a, inputsFromFields(fields).b, inputsFromFields(fields).couple);
  assert.equal(cellAt(g, 10).status, 'no_horizon');
  // Out-of-data years are flagged on the cell.
  const old = cellAt(summariseLens(lenses.find((l) => l.summary.id === 'nlsy79_couples'), ...Object.values(inputsFromFields(fields)).slice(0, 3)), 10);
  assert.equal(old.inSupport, false, 'a 28/30 couple is younger than NLSY79’s 35–64');
});

test('never pooled: every number belongs to one lens, and no cross-lens column exists', () => {
  const csv = parseCsv(comparisonCsv(lenses, scen, sums, { baselineId: scen[0].id }));
  assert.deepEqual(csv[0], CSV_HEADER);
  assert.ok(!CSV_HEADER.some((h) => /pool|average_across|all_lenses|combined/.test(h)));
  const lensCol = CSV_HEADER.indexOf('lens');
  const rows = csv.slice(1);
  assert.deepEqual([...new Set(rows.map((r) => r[lensCol]))].sort(), [...ids].sort());
  // One row per scenario x lens x horizon of that lens.
  const expect = ids.reduce((t, id) => t + 3 * lensHorizons(lenses.find((l) => l.summary.id === id).bundle).length, 0);
  assert.equal(rows.length, expect);
  // Each ok row's number is that lens's own number at that horizon.
  const hc = lenses.find((l) => l.summary.id === 'hcmst_couples');
  for (const r of rows.filter((x) => x[lensCol] === 'hcmst_couples' && x[4] === 'ok')) {
    const i = scen.findIndex((s) => s.name === r[0]);
    const c = cellAt(sums.hcmst_couples[i], Number(r[3]));
    assert.equal(r[5], c.risk.toFixed(4));
  }
  assert.ok(lenses.find((l) => l.summary.id === 'hcmst_couples') === hc);
});

test('the CSV and the link never carry sensitive answers; the JSON only when asked', () => {
  const full = cleanFields({ ...FORM, ...SENSITIVE_FORM }).fields;
  const lit = { depression: 'yes', alcohol_problem: 'no', destructive_conflict_wife: '3', destructive_conflict_husband: '2', neuroticism_wife: '1', neuroticism_husband: '-0.5', prior_cohabitations_other_partners: '1' };
  const list = addScenario([], { name: 'Private', fields: full, lit }).list;
  // Link: only the existing link whitelist.
  const link = encodeScenarioLink(list, list[0].id);
  const keys = new URLSearchParams(link.slice(1)).getAll('sc').flatMap((v) => [...new URLSearchParams(v).keys()]);
  assert.ok(keys.includes('a.age') && keys.includes('place'));
  for (const k of keys) assert.ok(!isSensitive(k), k);
  for (const k of ['a.substance', 'b.abuse', 'a.lowMood', 'b.ace', 'a.hostTo1', 'a.hostBy2']) assert.ok(!keys.includes(k) && !link.includes(encodeURIComponent(k)), k);
  const back = decodeScenarioLink(link);
  assert.equal(back.scenarios.length, 1);
  assert.equal(back.scenarios[0].name, 'Private');
  assert.deepEqual(back.scenarios[0].fields, cleanFields(full, { includeSensitive: false }).fields);
  assert.deepEqual(back.scenarios[0].lit, { prior_cohabitations_other_partners: '1' }, 'conflict, depression, alcohol and neuroticism stay out of links');
  for (const k of LIT_SENSITIVE) assert.ok(!link.includes(k), k);
  const craftedLit = '#sc=' + encodeURIComponent('n=X&lit.depression=yes&lit.neuroticism_wife=1&lit.prior_cohabitations_other_partners=2');
  assert.deepEqual(decodeScenarioLink(craftedLit).scenarios[0].lit, { prior_cohabitations_other_partners: '2' });
  // A crafted link cannot smuggle sensitive or unknown fields in.
  const crafted = '#sc=' + encodeURIComponent('n=X&a.abuse=Yes&a.hostTo1=Often&evil=1&a.age=30&lens=hcmst_couples');
  const d = decodeScenarioLink(crafted);
  assert.deepEqual(d.scenarios[0].fields, { 'a.age': '30' });
  // CSV: no answers at all.
  const s = summariseScenarios(lenses, list, ['hcmst_couples'], { currentYear: YEAR });
  const csv = comparisonCsv(lenses, list, s, { baselineId: list[0].id });
  assert.ok(!/Often|Once or twice|substance|abuse|hostTo/.test(csv));
  // JSON: sensitive only with the tick.
  const plain = exportJson(list, list[0].id);
  assert.equal(plain.includes_sensitive_answers, false);
  assert.ok(!Object.keys(plain.scenarios[0].fields).some(isSensitive));
  assert.deepEqual(plain.scenarios[0].literature, { prior_cohabitations_other_partners: '1' }, 'browser storage and plain JSON omit them');
  assert.ok(!/depression|alcohol|neuroticism|destructive/.test(csv));
  const withSens = exportJson(list, list[0].id, { includeSensitive: true });
  assert.equal(withSens.scenarios[0].fields['a.substance'], 'Yes');
  assert.equal(withSens.scenarios[0].fields['a.hostTo1'], 'Often');
  assert.deepEqual(withSens.scenarios[0].literature, lit, 'all of them with the tick');
  assert.deepEqual(importJson(JSON.stringify(withSens)).scenarios[0].lit, lit);
});

test('JSON export/import round-trips and rejects unknown fields or values', () => {
  const full = cleanFields({ ...FORM, ...SENSITIVE_FORM }).fields;
  let list = addScenario([], { name: 'A', fields: full, lit: { neuroticism_wife: '0.5' } }).list;
  list = addScenario(list, { name: 'B', fields }).list;
  const doc = exportJson(list, list[1].id, { includeSensitive: true, selection: { lenses: ['hcmst_couples'], horizons: { hcmst_couples: 2 } } });
  const r = importJson(JSON.stringify(doc));
  assert.equal(r.fatal, undefined, JSON.stringify(r.errors));
  assert.deepEqual(r.scenarios.map((s) => s.name), ['A', 'B']);
  assert.deepEqual(r.scenarios[0].fields, full);
  assert.deepEqual(r.scenarios[0].lit, { neuroticism_wife: '0.5' }, 'kept: this file was exported with sensitive answers');
  assert.equal(r.baseline, 1);
  assert.deepEqual(r.selection.lenses, ['hcmst_couples']);
  const bad = (mut) => { const d = JSON.parse(JSON.stringify(doc)); mut(d); return importJson(JSON.stringify(d)); };
  assert.match(bad((d) => { d.scenarios[0].fields['a.evil'] = 'x'; }).errors.join(), /unknown field “a.evil”/);
  assert.match(bad((d) => { d.scenarios[0].fields['a.degree'] = 'Wizard'; }).errors.join(), /not an allowed value/);
  assert.match(bad((d) => { d.scenarios[0].fields['a.age'] = 300; }).errors.join(), /not an allowed value/);
  assert.match(bad((d) => { d.scenarios[0].fields['a.satSum'] = 20; }).errors.join(), /unknown field/);
  assert.match(bad((d) => { d.scenarios[0].script = '<x>'; }).errors.join(), /unknown key “script”/);
  assert.match(bad((d) => { d.extra = 1; }).errors.join(), /unknown key “extra”/);
  assert.match(bad((d) => { d.scenarios[0].literature = { made_up: 'yes' }; }).errors.join(), /literature/);
  assert.match(bad((d) => { d.format = 'other'; }).errors.join(), /format/);
  assert.match(bad((d) => { d.baseline = 9; }).errors.join(), /baseline/);
  assert.match(bad((d) => { d.selection = { lenses: ['../x'] }; }).errors.join(), /selection/);
  for (const m of [(d) => { d.scenarios[0].fields['a.evil'] = 'x'; }, (d) => { d.extra = 1; }]) assert.ok(bad(m).fatal && !bad(m).scenarios, 'nothing half-imported');
  assert.ok(importJson('not json').fatal);
  assert.ok(importJson('[]').fatal);
  // The cap applies on import: the excess is counted, not silently lost.
  const many = { ...doc, baseline: 0, scenarios: Array.from({ length: 60 }, (_, i) => ({ name: `S${i}`, fields })) };
  const m = importJson(JSON.stringify(many));
  assert.equal(m.scenarios.length, MAX_SCENARIOS);
  assert.equal(m.dropped, 10);
  assert.equal(importJson(JSON.stringify(many), { room: 5 }).scenarios.length, 5);
  // Field specs: sensitive items are allowed in a file, derived sums are not fields.
  assert.ok(fieldSpec('a.hostTo7'));
  assert.equal(fieldSpec('a.hostSum'), undefined);
  assert.equal(cleanLit({ depression: 'maybe' }, { strict: true }).errors.length, 1);
});

test('default lenses follow summary.js relevance for the baseline', () => {
  const d = defaultLenses(lenses, scen[0], { currentYear: YEAR, n: 3 });
  assert.equal(d.length, 3);
  const all = lenses.filter((l) => l.summary.scorable).map((l) => l.summary.id);
  for (const id of d) assert.ok(all.includes(id));
  const { a, b, couple } = inputsFromFields(scen[0].fields, { currentYear: YEAR });
  const ok = lenses.map((l) => summariseLens(l, a, b, couple)).filter((r) => r.status === 'ok').map((r) => r.id);
  for (const id of d) assert.ok(ok.includes(id), `${id} scores the baseline`);
});

test('a share link of 50 scenarios decodes to 50, and more are capped', () => {
  let list = [];
  for (let i = 0; i < MAX_SCENARIOS; i++) list = addScenario(list, { fields: { ...fields, 'a.age': String(20 + i) } }).list;
  const d = decodeScenarioLink(encodeScenarioLink(list, list[3].id));
  assert.equal(d.scenarios.length, MAX_SCENARIOS);
  assert.equal(d.baseline, 3);
  assert.equal(d.scenarios[10].fields['a.age'], '30');
  const extra = encodeScenarioLink(list, list[0].id) + '&sc=' + encodeURIComponent('n=more&a.age=40');
  assert.equal(decodeScenarioLink(extra).dropped, 1);
  assert.equal(decodeScenarioLink('#a.age=30'), null, 'an ordinary scenario link is not a list');
  // Later scenarios travel as changes from the first, including answers taken away.
  const v = varyOne({ name: 'Us', fields }, 'cohabitedFirst').scenarios;
  const two = [addScenario([], { name: 'Us', fields }).list[0], ...v.map((s, i) => ({ ...s, id: 'v' + i }))];
  const back = decodeScenarioLink(encodeScenarioLink(two, two[0].id));
  assert.deepEqual(back.scenarios.map((s) => s.fields), two.map((s) => s.fields));
  assert.ok(encodeScenarioLink(list, list[0].id).length < 12000, 'fifty one-field variations stay a few kilobytes');
  // A change list cannot add a sensitive or unknown answer either.
  const sneaky = '#sc=' + encodeURIComponent('n=A&a.age=30') + '&sc=' + encodeURIComponent('n=B&a.abuse=Yes&a.hostBy1=Often&x=1');
  assert.deepEqual(decodeScenarioLink(sneaky).scenarios[1].fields, { 'a.age': '30' });
});
