// Couple-view glue for the literature layer and the NCHS baselines: fragment round-trip and
// validation, which questions each lens asks, the answers passed to adjust(), NCHS row matching.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { FACTORS, LENS_MODELS, adjust } from '../literature.js';
import { encodeLiterature, decodeLiterature, LIT_SENSITIVE, literatureQuestions, answersFor, baseFromYears, nchsMatches, disruption, LIT_CHOICES } from '../literature-ui.js';
import { decodeScenario } from '../couple.js';
import { readHashExtras } from '../compare-ui.js';

const evidence = JSON.parse(readFileSync(new URL('../data/literature_evidence.json', import.meta.url)));
const nchs = JSON.parse(readFileSync(new URL('../data/nchs_disruption_tables.json', import.meta.url)));
const index = JSON.parse(readFileSync(new URL('../models/index.json', import.meta.url)));

const wife = { sex: 'Woman', age: 27, degree: 'Bachelor', raceEth: 'White', intactFamily: 'Yes', priorMarriage: false, priorChildren: 'No' };
const husband = { sex: 'Man', age: 29, degree: 'Some college', raceEth: 'White', intactFamily: 'No', priorMarriage: false, priorChildren: 'No' };

test('fragment round-trip keeps known, valid answers in a canonical form', () => {
  const answers = { depression: 'yes', neuroticism_wife: '0.5', destructive_conflict_wife: '2.5', prior_cohabitations_other_partners: '2', alcohol_problem: 'no' };
  const all = { includeSensitive: true };
  const enc = encodeLiterature(answers, all);
  assert.match(enc, /^lit\./);
  assert.deepEqual(decodeLiterature('#' + enc, all), answers);
  // equal numeric spellings are canonicalised
  assert.deepEqual(decodeLiterature('#lit.neuroticism_wife=0.50&lit.destructive_conflict_wife=3.0', all), { neuroticism_wife: '0.5', destructive_conflict_wife: '3' });
  // Conflict, depression, alcohol and neuroticism never go into, or come out of, a link.
  assert.equal(encodeLiterature(answers), 'lit.prior_cohabitations_other_partners=2');
  assert.deepEqual(decodeLiterature('#' + enc), { prior_cohabitations_other_partners: '2' });
  for (const k of LIT_SENSITIVE) assert.ok(!encodeLiterature({ [k]: answers[k] ?? '1' }).includes(k), k);
});

test('decoding drops unknown keys, out-of-range or malformed values and profile-derived factors', () => {
  const bad = '#lit.unknown=1&lit.depression=maybe&lit.neuroticism_wife=3&lit.destructive_conflict_wife=1.7'
    + '&lit.prior_cohabitations_other_partners=-1&lit.parental_divorce_wife=no&lit.__proto__=1&lit.religiosity_match=yes&lit.alcohol_problem=<script>';
  assert.deepEqual(decodeLiterature(bad), {});
  assert.equal(encodeLiterature({ bogus: 'yes', depression: 'perhaps', parental_divorce_husband: 'no' }), '');
  assert.equal(encodeLiterature({}), '');
  assert.deepEqual(decodeLiterature(''), {});
});

test('literature answers share the fragment without disturbing the scenario or the view', () => {
  const hash = '#a.sex=Woman&a.age=27&lens=nsfg2002_first_marriage&view=dashboard&' + encodeLiterature({ prior_cohabitations_other_partners: '1', depression: 'yes' });
  const sc = decodeScenario(hash);
  assert.equal(sc['a.age'], '27');
  assert.ok(!Object.keys(sc).some((k) => k.startsWith('lit.')));
  assert.equal(readHashExtras(hash), 'dashboard');
  assert.deepEqual(decodeLiterature(hash), { prior_cohabitations_other_partners: '1' });
});

test('every allowed choice is inside the factor range literature.js validates', () => {
  for (const [key, f] of Object.entries(FACTORS)) {
    if (!f.range) continue;
    for (const c of LIT_CHOICES[f.kind]) assert.ok(Number(c) >= f.range[0] && Number(c) <= f.range[1], `${key} ${c}`);
  }
});

test('factors a lens already models are never asked, for every scorable lens', () => {
  const scorable = index.lenses.filter((l) => l.adapter).map((l) => l.adapter);
  assert.ok(scorable.length >= 3);
  for (const lens of scorable) {
    assert.ok(lens in LENS_MODELS, `${lens} must be listed in LENS_MODELS`);
    const { ask, profile, notAsked } = literatureQuestions(lens, evidence);
    const shown = new Set([...ask, ...profile].map((q) => q.key));
    for (const k of LENS_MODELS[lens]) {
      assert.ok(!shown.has(k), `${lens} asks ${k}`);
      assert.ok(notAsked.some((q) => q.key === k), `${lens}: ${k} should be listed as not asked`);
    }
    const modelled = notAsked.filter((q) => q.status === 'modelled').map((q) => q.key).sort();
    assert.deepEqual(modelled, LENS_MODELS[lens].filter((k) => FACTORS[k]).sort());
  }
  // NSFG 2002 models the wife's family of origin: only the husband's is taken from the profile.
  const ns = literatureQuestions('nsfg2002_first_marriage', evidence);
  assert.deepEqual(ns.profile.map((q) => q.key), ['parental_divorce_husband']);
  assert.ok(ns.ask.some((q) => q.key === 'nonreligious_spouse'));
  // NLSY79 models religion, so that question is not asked there.
  assert.ok(!literatureQuestions('nlsy79_couples', evidence).ask.some((q) => q.key === 'nonreligious_spouse'));
});

test('withheld and unverified evidence is listed with its reason, not asked', () => {
  const q = literatureQuestions('nlsy79_couples', evidence);
  const hus = q.notAsked.find((x) => x.key === 'destructive_conflict_husband');
  assert.equal(hus.status, 'withheld');
  assert.match(hus.reason, /Non-proportional/);
  assert.equal(q.notAsked.find((x) => x.key === 'religiosity_match').status, 'modelled');
  assert.equal(literatureQuestions('nsfg2002_first_marriage', evidence).notAsked.find((x) => x.key === 'religiosity_match').status, 'refused');
  const unknown = literatureQuestions('no_such_lens', evidence);
  assert.equal(unknown.ask.length, 0);
  assert.ok(unknown.notAsked.every((x) => x.reason === 'unknown lens'));
});

test('answers passed to adjust(): set answers only, numbers as numbers, family of origin from the profiles', () => {
  const ans = answersFor('nsfg2002_first_marriage', evidence, { depression: 'yes', neuroticism_husband: '1', destructive_conflict_husband: '4', bogus: 'x' }, wife, husband);
  assert.deepEqual(ans, { depression: 'yes', neuroticism_husband: 1, parental_divorce_husband: 'no' });
  // NLSY79 does not model either partner's family of origin: both come from the profiles.
  const n = answersFor('nlsy79_couples', evidence, { nonreligious_spouse: 'yes' }, husband, wife);
  assert.deepEqual(n, { parental_divorce_wife: 'yes', parental_divorce_husband: 'no' });
});

test('the lens projection feeds adjust() unchanged when nothing is answered', () => {
  const years = Array.from({ length: 20 }, (_, i) => ({ meanSurvival: Math.pow(0.97, i + 1) }));
  const base = baseFromYears(years);
  const out = adjust({ base, lens: 'nlsy79_couples', answers: {}, seed: 1 }, evidence);
  assert.ok(Math.abs(out.horizons[10].adjusted.median - (1 - Math.pow(0.97, 10))) < 1e-12);
  const up = adjust({ base, lens: 'nlsy79_couples', answers: answersFor('nlsy79_couples', evidence, { depression: 'yes' }, wife, husband), seed: 1 }, evidence);
  // depression applied, the husband's non-intact family applied: risk rises
  assert.deepEqual(up.applied.map((x) => x.factor).sort(), ['depression', 'parental_divorce_husband']);
  assert.ok(up.horizons[10].adjusted.median > out.horizons[10].adjusted.median);
});

test('NCHS rows matching a first-marriage couple, with disruption = 1 - survival', () => {
  const m = nchsMatches(nchs, wife, husband, { yearsMarried: 0, cohabitedFirst: 'Yes' });
  const find = (table, section, label, sex) => m.matches.find((r) => r.table === table && r.section === section && r.label === label && (!sex || r.sex === sex));
  // Bramlett & Mosher Table 21: wife married at 27, so "25 and over"; 10-year disruption printed.
  const age21 = find('Table 21', 'Age at marriage', '25 and over');
  assert.ok(age21 && age21.cells['10y'].p > 0 && age21.cells['20y'] === null);
  // Copen Table 5: survival printed, shown as disruption with the same SE.
  const t5row = nchs.tables.find((t) => t.table === 'Table 5').rows.find((r) => r.section === 'Age at first marriage' && r.label === '25 years and over');
  const age5 = find('Table 5', 'Age at first marriage', '25 years and over');
  assert.equal(age5.cells['10y'].p, Math.round((1 - t5row.survival['10y'].survival) * 1000) / 1000);
  assert.equal(age5.cells['10y'].se, t5row.survival['10y'].se);
  assert.equal(t5row.survival['20y'], null); // printed "*"
  assert.deepEqual(age5.cells['20y'], { p: null, se: null, unreliable: true });
  assert.ok(find('Table 21', 'Education', 'More than HS'));
  assert.ok(find('Table 5', 'Education', 'Bachelor’s degree'));
  assert.ok(find('Table 6', 'Education', 'Some college, no bachelor’s degree'));
  assert.ok(find('Table 6', 'Parental living arrangements at age 14', 'Other'));
  assert.ok(find('Table 21', 'Cohabited before marriage', 'Did'));
  assert.equal(m.matches.filter((r) => r.table === 'Table 7' && r.sex === 'Women' && r.section.startsWith('Cohabited')).length, 2);
  assert.ok(find('Table 21', 'Age difference', 'He is 0–4 years older'));
  assert.ok(find('Table 21', 'Race difference', 'Same race'));
  assert.ok(find('Table 7', 'First husband ever married before this marriage', 'No', 'Women'));
  assert.ok(!m.matches.some((r) => r.table === 'Table 41'));
  for (const r of m.matches) assert.ok(r.survey === 'NSFG 1995' || r.survey === 'NSFG 2006–2010');
});

test('NCHS: a previously married wife gets the second-marriage table, a same-sex couple none', () => {
  const m = nchsMatches(nchs, { ...wife, priorMarriage: true, age: 40 }, { ...husband, priorMarriage: true, age: 42 }, { yearsMarried: 0, cohabitedFirst: 'Unknown' });
  assert.ok(m.matches.length > 0);
  assert.ok(m.matches.every((r) => r.table === 'Table 41'));
  assert.ok(m.matches.some((r) => r.section === 'Age at remarriage' && r.label === '25 and over'));
  assert.ok(m.notes.length >= 2);
  const same = nchsMatches(nchs, wife, { ...wife, age: 30 }, { yearsMarried: 0 });
  assert.equal(same.matches.length, 0);
  assert.equal(nchsMatches(null, wife, husband, {}).matches.length, 0);
});

test('NCHS: unreliable "*" cells stay unreliable, never zero', () => {
  let starred = 0;
  for (const t of nchs.tables) {
    for (const r of t.rows) {
      const c = disruption(t, r);
      for (const v of Object.values(c)) {
        if (v && v.unreliable) { starred++; assert.equal(v.p, null); }
        if (v && v.p !== null) assert.ok(v.p >= 0 && v.p <= 1);
      }
    }
  }
  assert.ok(starred > 0);
});
