// The before-the-wedding lens in the app: workstream B's harmonized NSFG model
// (prewedding_harmonized.json) scored from the form, both partners as the surveyed spouse.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lensView, lensSummary, lensSkill, refusals, lensNotes, coupleRate, project, lensStage, defaultLens, expandLens } from '../couple.js';
import { preweddingRow } from '../lens-adapters.js';
import { predict } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const bundle = lensView(JSON.parse(readFileSync(new URL('prewedding_harmonized.json', dir))));
const m = bundle.models[0];
const pre = { priorMarriage: false, intactFamily: 'Yes', raceEth: 'White', kidsBefore: '0', religionRaised: 'Catholic' };
const a = { ...pre, sex: 'Woman', age: 28 };
const b = { ...pre, sex: 'Man', age: 31, raceEth: 'Hispanic', kidsBefore: '1', religionRaised: 'Baptist', intactFamily: 'No' };
const c = { yearsMarried: 0, cohabitedFirst: 'Yes', currentYear: 2026 };

test('rows: each partner as the surveyed spouse, facts as of the wedding day', () => {
  const ra = preweddingRow(bundle, a, b, c, 3);
  assert.deepEqual(ra, {
    marriage_years: 3, respondent_age: 28, spouse_age: 31, age_gap: 3, wedding_year: bundle.support.wedding_year[1],
    spouse_prior_marriage: 'No', respondent_prior_children: 'No', spouse_prior_children: 'Yes', cohabited_first: 'Yes',
    respondent_race: 'White', spouse_race: 'Hispanic', same_race: 'Different', intact_family: 'Yes', religion_raised: 'Catholic', respondent_sex: 'Woman',
  });
  const rb = preweddingRow(bundle, b, a, c, 3);
  assert.equal(rb.respondent_sex, 'Man');
  assert.equal(rb.age_gap, 3, 'age gap is husband minus wife from either side');
  assert.equal(rb.religion_raised, 'Protestant');
  assert.equal(rb.intact_family, 'No');
  assert.equal(rb.respondent_prior_children, 'Yes');
  // The couple's rate is the mean over the two perspectives.
  assert.equal(coupleRate(bundle, m, a, b, c, 3), (predict(m, ra) + predict(m, rb)) / 2);
});

test('an unanswered input scores like the survey’s most common answer (B’s unknown policy)', () => {
  const unknown = preweddingRow(bundle, a, b, { ...c, cohabitedFirst: '' }, 0);
  assert.equal(unknown.cohabited_first, 'Unknown');
  const mode = { ...unknown, cohabited_first: 'No' };
  assert.equal(predict(m, unknown), predict(m, mode));
  assert.ok(lensNotes(bundle, a, b, { ...c, cohabitedFirst: '' }).some((n) => n.includes('living together first')));
});

test('refusals: same-sex, second marriages, ages outside the data', () => {
  assert.deepEqual(refusals(bundle, a, b, c), []);
  assert.ok(refusals(bundle, a, { ...b, sex: 'Woman' }, c).length);
  assert.ok(refusals(bundle, a, { ...b, priorMarriage: true }, c).some((x) => x.includes('first marriages only')));
  assert.ok(refusals(bundle, { ...a, age: 45 }, b, c).some((x) => x.includes('outside')));
});

test('a before-the-wedding lens, the default one, with B’s held-out skill', () => {
  assert.equal(lensStage(bundle), 'before');
  const s = lensSummary(bundle, {});
  assert.ok(s.scorable);
  const sk = lensSkill(bundle);
  assert.ok(Math.abs(sk.gain - 3.999) < 1e-9 && Math.abs(sk.c - 0.6609) < 1e-9);
  const manifest = JSON.parse(readFileSync(new URL('index.json', dir))).lenses;
  const lenses = manifest.flatMap((e) => expandLens(lensView(JSON.parse(readFileSync(new URL(e.file, dir))))).map((v) => ({ bundle: v, summary: lensSummary(v, v.view_of ? {} : e) })));
  assert.equal(defaultLens(lenses, 'before').summary.id, 'prewedding_harmonized');
});

test('projection from the wedding day stays inside the data for 20 years and is monotone', () => {
  const p = project(bundle, a, b, c, 25);
  assert.ok(p.slice(0, 20).every((y) => y.inSupport));
  for (let i = 1; i < p.length; i++) assert.ok(p[i].meanSurvival < p[i - 1].meanSurvival);
  // Risk rises with a child before the wedding on both sides, holding the rest fixed.
  const p2 = project(bundle, { ...a, kidsBefore: '1' }, b, c, 10);
  assert.ok(p2[9].meanSurvival < p[9].meanSurvival);
});
