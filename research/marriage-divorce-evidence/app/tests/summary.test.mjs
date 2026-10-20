// Summary across lenses (never pooled) and the ACS observed baselines.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lensView, expandLens, lensSummary } from '../couple.js';
import { summariseAll, relevance } from '../summary.js';
import { acsMatches, acsAttributes } from '../baselines.js';

const dir = new URL('../models/', import.meta.url);
const lenses = JSON.parse(readFileSync(new URL('index.json', dir))).lenses.flatMap((entry) => expandLens(lensView(JSON.parse(readFileSync(new URL(entry.file, dir))))).map((bundle) => ({ entry, bundle, summary: lensSummary(bundle, bundle.view_of ? {} : entry) })));
const acs = JSON.parse(readFileSync(new URL('../data/acs_divorce_baselines.json', import.meta.url)));

const you = { sex: 'Woman', age: 28, school: '16–17 years', degree: 'Bachelor', wages: 52000, work: '2,000+ hours', religion: 'Less than weekly', priorMarriage: false, firstMarriageAge: 28, raceEth: 'White', priorChildren: 'No', intactFamily: 'Yes', bornUS: 'Yes', quality: 'Excellent', hapmar: 'Very happy', party: 'Democrat', kidsBefore: '0', priorPartners: '0', enrolled: 'No', motherEdu: 'Some college', motherAgeFirst: '20–24', satSum: 36 };
const partner = { ...you, sex: 'Man', age: 30, firstMarriageAge: 30, degree: 'Some college', school: '13–15 years', quality: 'Good', party: 'Republican', satSum: 33 };
const couple = { yearsMarried: 0, cohabitedFirst: 'Yes', currentYear: 2026, status: 'Married, living together', yearsTogether: 3, howMet: 'Online', childrenHome: 0, place: 'U.S. — South', state: 'TX', expecting: 'No', homeOwner: 'No' };

test('summary: one row per lens, own horizons and skill, a synthesis that pools nothing', () => {
  const s = summariseAll(lenses, you, partner, couple);
  assert.equal(s.rows.length, lenses.length);
  const ok = s.rows.filter((r) => r.status === 'ok');
  assert.ok(ok.length >= 8, `${ok.length} lenses score the filled-in couple`);
  for (const r of ok) {
    assert.ok(r.horizons.length >= 1);
    for (const h of r.horizons) assert.ok(h.min <= h.mean + 1e-12 && h.mean <= h.max + 1e-12, r.id);
    assert.ok(r.skill && Number.isFinite(r.skill.gain), r.id);
  }
  assert.deepEqual(s.rows.find((r) => r.id === 'gss_panel_marriages').horizons.map((h) => h.h), [2]);
  for (const r of s.rows.filter((x) => x.status !== 'ok')) assert.ok(r.reason.length > 10, r.id);
  const text = s.synthesis.lines.join(' ');
  assert.match(text, /never averaged/);
  assert.match(text, /Most relevant to this couple/);
  assert.match(text, /agree|disagree/);
  assert.ok(!/\baverage of the lenses\b|\bpooled estimate\b/i.test(text));
  // Ranking only orders lenses; every scored lens is ranked once.
  assert.equal(s.synthesis.ranked.length, ok.length);
  for (let i = 1; i < s.synthesis.ranked.length; i++) assert.ok(s.synthesis.ranked[i].score <= s.synthesis.ranked[i - 1].score);
  assert.equal(relevance({ status: 'abstain' }), -Infinity);
});

test('ACS baselines: the cells a person matches, most specific first, with intervals', () => {
  const at = acsAttributes(you, couple);
  assert.deepEqual(at, { sex: 'Woman', age_band: '25-29', education: 'Bachelor', race_ethnicity: 'White', nativity: 'US-born', duration_band: '0-2 years', times_married: 'Once', state: 'TX' });
  const m = acsMatches(acs, you, couple);
  assert.ok(m.matches.length > 20);
  assert.equal(m.matches[0].dims.length, 5, 'the state x age x education x duration x times-married cell first');
  for (const x of m.matches) {
    assert.ok(x.lo <= x.per1000 && x.per1000 <= x.hi);
    assert.ok(x.people >= 200);
  }
  assert.ok(m.matches.some((x) => x.dims.join() === 'sex'));
  // Unknown answers are simply not matched on.
  const n = acsMatches(acs, { ...you, raceEth: '', bornUS: '' }, { ...couple, state: '' });
  assert.ok(!n.matches.some((x) => x.dims.includes('state') || x.dims.includes('nativity')));
  assert.deepEqual(n.missing.sort(), ['nativity', 'race_ethnicity', 'state']);
});

test('HCMST skill is the couple group\'s own C-index, not the pooled one', async () => {
  const { skillForCouple } = await import('../summary.js');
  const { readFileSync } = await import('node:fs');
  const bundle = JSON.parse(readFileSync(new URL('../models/hcmst_couples.json', import.meta.url)));
  const married = skillForCouple(bundle, {}, {}, { status: 'Married, living together' });
  const unmarried = skillForCouple(bundle, {}, {}, { status: 'Not married, living together' });
  const unknown = skillForCouple(bundle, {}, {}, {});
  const m = bundle.models.find((x) => x.key === married.key);
  assert.equal(married.c, m.heldout.by_group['Married at wave 1'].c_index);
  assert.equal(unmarried.c, m.heldout.by_group['Unmarried at wave 1'].c_index);
  assert.equal(married.group, 'married couples');
  assert.ok(married.c < married.cPooled);
  assert.equal(unknown.c, m.heldout.c_index);
  assert.equal(unknown.group, undefined);
});
