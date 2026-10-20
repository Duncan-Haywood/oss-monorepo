// Stage: "Before the wedding" (default) uses only lenses whose clock starts at the wedding and
// whose inputs are fixed by then; married-couple lenses sit behind "Already married".
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lensView, expandLens, lensSummary, lensStage, lensesForStage, defaultLens, STAGES, encodeScenario, decodeScenario, refusals, project } from '../couple.js';

const dir = new URL('../models/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('index.json', dir))).lenses;
const lenses = manifest.flatMap((entry) => expandLens(lensView(JSON.parse(readFileSync(new URL(entry.file, dir)))))
  .map((b) => ({ entry, bundle: b, summary: lensSummary(b, b.view_of ? {} : entry) })));
const ids = (stage) => lensesForStage(lenses, stage).map((l) => l.summary.id);

test('every lens belongs to exactly one stage', () => {
  for (const l of lenses) assert.ok(STAGES.includes(lensStage(l.bundle)), l.summary.id);
  assert.equal(ids('before').length + ids('married').length, lenses.length);
});

test('before the wedding: first-marriage lenses that start at the wedding', () => {
  const before = ids('before');
  for (const id of ['nsfg_pooled_first_marriage', 'nlsy97_first_marriage', 'nlsy79_first_marriage', 'sipp_first_marriage', 'canada_gss_first_marriage', 'nsfg2002_first_marriage']) {
    if (lenses.some((l) => l.summary.id === id)) assert.ok(before.includes(id), id);
  }
  // A derived view (both-sexes NSFG) follows its parent bundle.
  if (lenses.some((l) => l.summary.id === 'nsfg_pooled_both_sexes')) assert.ok(before.includes('nsfg_pooled_both_sexes'));
  // Married-couple lenses, panels of married people and non-divorce outcomes are not in it.
  for (const id of ['nlsy79_couples', 'nlsy79_individuals', 'gss_panel_marriages', 'hcmst_couples', 'newlywed_la_couples', 'sipp_prospective_couples', 'acs_one_year_divorce', 'fair_redbook1974', 'fair_pt1969']) {
    assert.ok(!before.includes(id), id);
  }
  // A bundle can declare its stage.
  assert.equal(lensStage({ id: 'anything', stage: 'before' }), 'before');
  assert.equal(lensStage({ id: 'nsfg_pooled_first_marriage', stage: 'married' }), 'married');
});

test('default lenses', () => {
  const d = defaultLens(lenses, 'before');
  assert.equal(lensStage(d.bundle), 'before');
  assert.ok(d.summary.scorable);
  assert.equal(d.summary.id, lenses.some((l) => l.summary.id === 'prewedding_harmonized' && l.summary.scorable) ? 'prewedding_harmonized' : 'nsfg_pooled_first_marriage');
  assert.equal(defaultLens(lenses, 'married').summary.id, 'nlsy79_couples');
});

test('the stage travels in the link, and nothing else is accepted', () => {
  assert.equal(decodeScenario(encodeScenario({ stage: 'married', lens: 'nlsy79_couples' })).stage, 'married');
  assert.equal(decodeScenario('#stage=before').stage, 'before');
  assert.equal(decodeScenario('#stage=divorced').stage, undefined);
});

test('a typical engaged couple is scored by the pre-wedding lenses from the wedding day', () => {
  // Every pre-wedding answer the form asks, as a person would fill it in.
  const pre = { priorMarriage: false, priorChildren: 'No', intactFamily: 'Yes', raceEth: 'White', bornUS: 'Yes', kidsBefore: '0', priorPartners: '0', enrolled: 'No', religionRaised: 'Catholic', attendDetail: 'Less than monthly', motherEdu: 'Some college', motherAgeFirst: '20–24' };
  const a = { ...pre, sex: 'Woman', age: 28, school: '16–17 years', degree: 'Bachelor', wages: 52000, work: '2,000+ hours', religion: 'Less than weekly', firstMarriageAge: 28 };
  const b = { ...pre, sex: 'Man', age: 30, school: '16–17 years', degree: 'Bachelor', wages: 60000, work: '2,000+ hours', religion: 'Less than weekly', firstMarriageAge: 30 };
  const couple = { yearsMarried: 0, cohabitedFirst: 'Yes', currentYear: 2026, place: 'U.S. — Midwest', state: 'OH', expecting: 'No', cohabMonths: '12' };
  const scored = lensesForStage(lenses, 'before').filter((l) => l.summary.scorable && !refusals(l.bundle, a, b, couple).length);
  assert.ok(scored.length >= 6, `only ${scored.length} pre-wedding lenses scored the couple`);
  for (const l of scored) {
    const y = project(l.bundle, a, b, couple, 1)[0];
    assert.equal(y.year, 1, `${l.summary.id} starts at the wedding`);
  }
  // The only pre-wedding lens that may refuse this U.S. couple is Canada's (no Canadian region).
  const refused = lensesForStage(lenses, 'before').filter((l) => l.summary.scorable && refusals(l.bundle, a, b, couple).length).map((l) => l.summary.id);
  assert.deepEqual(refused.filter((id) => id !== 'canada_gss_first_marriage'), [], refused.join(', '));
});
