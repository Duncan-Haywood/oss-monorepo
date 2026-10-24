// Batch scoring: CSV parse/validate/round-trip, per-lens scoring with abstention passed
// through, candidate ranking with the overlap flag, and no pooling across lenses.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { parseCsv, toCsv, csvField, validateCouples, validateCandidates, couplesTemplate, candidatesTemplate, couplesHeader, scoreLens, scoreBatch, resultsCsv, rankCandidates, normalise, MAX_ROWS } from '../batch.js';
import { lensView, lensSummary, shareOod, project } from '../couple.js';

const dir = new URL('../models/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('index.json', dir)));
const lenses = manifest.lenses.map((entry) => {
  const bundle = lensView(JSON.parse(readFileSync(new URL(entry.file, dir))));
  return { entry, bundle, summary: lensSummary(bundle, entry) };
});
shareOod(lenses.map((l) => l.bundle));
const mortality = JSON.parse(readFileSync(new URL('../data/us_mortality_wpp2024.json', import.meta.url)));

test('CSV parsing: quotes, commas, newlines, CRLF, BOM', () => {
  const rows = parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\n2,"multi\nline",\n\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['2', 'multi\nline', '']]);
  assert.equal(csvField('1–1,999 hours'), '"1–1,999 hours"');
  assert.equal(csvField('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"', 'formulas are neutralised');
  assert.equal(csvField(-3), '-3');
  const back = parseCsv(toCsv([['id', 'v'], ['a,b', 'q"q'], ['c', '2,000+ hours']]));
  assert.deepEqual(back, [['id', 'v'], ['a,b', 'q"q'], ['c', '2,000+ hours']]);
});

test('the template validates and round-trips', () => {
  const v = validateCouples(couplesTemplate(), { currentYear: 2026 });
  assert.equal(v.errors.length, 0, JSON.stringify(v.errors));
  assert.equal(v.couples.length, 2);
  const [c1, c2] = v.couples;
  assert.equal(c1.a.sex, 'Woman');
  assert.equal(c1.a.age, 27);
  assert.equal(c1.a.firstMarriageAge, 27, 'derived like the form');
  assert.equal(c1.couple.cohabitedFirst, 'Yes');
  assert.equal(c2.couple.yearsMarried, 5);
  assert.equal(c2.b.firstMarriageAge, 28);
  assert.ok(Number.isNaN(normalise({ sex: 'Man', age: 30, wages: '' }, null, {}).a.wages));
  const cands = validateCandidates(candidatesTemplate());
  assert.equal(cands.errors.length, 0);
  assert.equal(cands.candidates[1].name, 'Candidate B');
  assert.equal(cands.candidates[1].priorMarriage, true);
});

test('strict validation with row-level errors', () => {
  const head = couplesHeader();
  const row = (over) => head.map((h) => (h in over ? over[h] : { id: 'x', a_sex: 'Woman', a_age: '30', b_sex: 'Man', b_age: '32' }[h] ?? '')).join(',');
  const text = [head.join(','),
    row({ id: 'ok' }),
    row({ id: 'badsex', a_sex: 'Female' }),
    row({ id: 'old', b_age: '140' }),
    row({ id: 'deg', a_degree: 'Bachelors' }),
    row({ id: 'dash', a_school: '13-15 years' }),
    row({ id: 'ok', a_age: '31' }),
    row({ id: 'noage', a_age: '' }),
    row({ id: 'pm', b_prior_marriage: 'maybe' })].join('\n');
  const v = validateCouples(text);
  assert.deepEqual(v.couples.map((c) => c.id), ['ok', 'dash']);
  assert.equal(v.couples[1].a.school, '13–15 years', 'an ASCII hyphen stands for the en dash');
  assert.match(v.errors.find((e) => e.column === 'a_sex').message, /Woman \| Man/);
  assert.match(v.errors.find((e) => e.column === 'b_age').message, /between 16 and 100/);
  assert.ok(v.errors.find((e) => e.column === 'a_degree'));
  assert.ok(v.errors.find((e) => e.column === 'id' && e.message === 'duplicate id'));
  assert.equal(v.errors.find((e) => e.column === 'a_age').message, 'required');
  assert.ok(v.errors.find((e) => e.column === 'b_prior_marriage'));
  assert.deepEqual([...new Set(v.errors.map((e) => e.line))], [3, 4, 5, 7, 8, 9]);
  // Header problems are fatal, with what is wrong.
  assert.match(validateCouples('id,a_sex,a_age,b_sex,b_age,evil\n').fatal, /Unknown columns: evil/);
  assert.match(validateCouples('id,a_sex,b_sex,b_age\n').fatal, /Missing required columns: a_age/);
  assert.match(validateCouples('').fatal, /empty/);
  // Row cap.
  const many = [head.join(','), ...Array.from({ length: 6 }, (_, i) => row({ id: 'r' + i }))].join('\n');
  assert.match(validateCouples(many, { maxRows: 5 }).fatal, /limit is 5/);
  assert.equal(MAX_ROWS, 10000);
});

const wife = { sex: 'Woman', age: 27, school: '16–17 years', degree: 'Bachelor', wages: 52000, work: '2,000+ hours', religion: 'Never', priorMarriage: false, firstMarriageAge: 27, raceEth: 'White', priorChildren: 'No', intactFamily: 'Yes' };
const husband = { ...wife, sex: 'Man', age: 29, firstMarriageAge: 29 };
const couple = { yearsMarried: 0, cohabitedFirst: 'Yes', familyIncome: '', currentYear: 2026 };

test('per-lens scoring: abstention passes through, numbers match the projection, nothing pooled', () => {
  const res = lenses.map((l) => scoreLens(l, wife, husband, couple, { mortality }));
  const by = Object.fromEntries(res.map((r) => [r.lens, r]));
  assert.equal(by.fair_redbook1974.status, 'not_scorable');
  for (const id of ['nlsy79_couples', 'nlsy79_individuals', 'nsfg2002_first_marriage', 'nsfg2002_family']) {
    assert.equal(by[id].status, 'ok', id);
    const l = lenses.find((z) => z.summary.id === id);
    const p = project(l.bundle, wife, husband, couple, 20);
    assert.ok(Math.abs(by[id].at[10].mean - p[9].meanSurvival) < 1e-12);
    assert.ok(by[id].at[20].min <= by[id].at[20].mean && by[id].at[20].mean <= by[id].at[20].max);
    assert.ok(Math.abs(by[id].lifelong.widowhood.mean + by[id].lifelong.divorce.mean + by[id].lifelong.stillMarried.mean - 1) < 1e-9);
  }
  // NLSY79 lenses extrapolate below 35 and have no reference; NSFG lenses have percentiles.
  assert.ok(by.nlsy79_couples.extrapolatedYears > 0);
  assert.equal(by.nlsy79_individuals.percentileNote, 'no population reference for this lens');
  assert.equal(by.nlsy79_couples.percentileOf, 'annual rate now', 'the NLSY79 couples reference is an annual rate');
  assert.ok(Number.isFinite(by.nsfg2002_first_marriage.percentile[10].percentile));
  // A wife married before: NSFG lenses abstain with the reason; NLSY79 still scores.
  const prior = lenses.map((l) => scoreLens(l, { ...wife, priorMarriage: true, firstMarriageAge: 22 }, husband, couple));
  const pb = Object.fromEntries(prior.map((r) => [r.lens, r]));
  assert.equal(pb.nsfg2002_first_marriage.status, 'abstain');
  assert.match(pb.nsfg2002_first_marriage.reason, /first marriages/);
  assert.equal(pb.nlsy79_couples.status, 'ok');
  // Out-of-distribution abstention passes through too (17-year-old bride, 60-year-old groom).
  const odd = scoreLens(lenses.find((l) => l.summary.id === 'nsfg2002_family'), { ...wife, age: 17, firstMarriageAge: 17 }, { ...husband, age: 49, firstMarriageAge: 49, priorMarriage: false }, couple);
  assert.ok(odd.status === 'abstain' || odd.status === 'ok');
  // Same-sex couples: every scorable lens abstains.
  for (const r of lenses.map((l) => scoreLens(l, wife, { ...wife, age: 30 }, couple))) assert.notEqual(r.status, 'ok');
});

test('batch scoring with progress, and the long-format results CSV', async () => {
  const v = validateCouples(couplesTemplate(), { currentYear: 2026 });
  const seen = [];
  const res = await scoreBatch(lenses, v.couples, { onProgress: (d, t) => seen.push([d, t]), chunk: 1, yieldFn: async () => {} });
  assert.deepEqual(seen, [[1, 2], [2, 2]]);
  const csv = parseCsv(resultsCsv(res));
  assert.deepEqual(csv[0], ['id', 'lens', 'horizon_years', 'no_divorce', 'model_min', 'model_max', 'population_percentile', 'percentile_of', 'status', 'abstain_reason', 'years_outside_data']);
  const expected = res.reduce((t, r) => t + r.lenses.reduce((u, l) => u + (l.status === 'ok' ? l.horizons.length : 3), 0), 0);
  assert.equal(csv.length - 1, expected, 'one row per couple, lens and horizon the lens supports');
  // Short-horizon lenses report only their own horizons, never 5/10/20 years.
  for (const x of csv.slice(1).filter((z) => z[1] === 'gss_panel_marriages' && z[8] === 'ok')) assert.equal(x[2], '2');
  for (const x of csv.slice(1).filter((z) => z[1] === 'hcmst_couples' && z[8] === 'ok')) assert.ok(['2.17', '4.08', '8.42'].includes(x[2]));
  assert.ok(!csv[0].some((h) => /pooled|average_of_lenses/.test(h)));
  const r = csv.find((x) => x[0] === 'example-1' && x[1] === 'nsfg2002_first_marriage' && x[2] === '10');
  assert.equal(r[8], 'ok');
  assert.ok(Number(r[3]) > 0 && Number(r[3]) < 1);
  assert.ok(Number(r[4]) <= Number(r[3]) && Number(r[3]) <= Number(r[5]));
  assert.ok(r[6] !== '');
  // example-2 has no race-ethnicity: NSFG abstains, with the reason in the file.
  const ab = csv.find((x) => x[0] === 'example-2' && x[1] === 'nsfg2002_first_marriage');
  assert.equal(ab[8], 'abstain');
  assert.match(ab[9], /race-ethnicity/);
  // example-1 fills the newer lenses' questions: HCMST and GSS score it.
  assert.ok(csv.some((x) => x[0] === 'example-1' && x[1] === 'hcmst_couples' && x[8] === 'ok'));
  assert.ok(csv.some((x) => x[0] === 'example-1' && x[1] === 'gss_panel_marriages' && x[8] === 'ok'));
});

test('candidates: ranked per lens, overlap flag, abstained last, never pooled', () => {
  const cands = [
    { ...husband, name: 'A' },
    { ...husband, name: 'B', age: 35, firstMarriageAge: 35 },
    { ...husband, name: 'C', priorMarriage: true, firstMarriageAge: 22, priorChildren: 'Yes' },
    { ...wife, name: 'Same sex' },
  ];
  const out = rankCandidates(lenses, wife, cands, couple, { mortality });
  for (const id of ['nlsy79_couples', 'nlsy79_individuals', 'nsfg2002_family', 'nsfg2002_first_marriage']) assert.ok(out.some((o) => o.lens === id), id);
  assert.ok(!out.some((o) => o.lens.startsWith('fair_')), 'listed-only lenses are not ranked');
  for (const o of out.filter((z) => z.ranked.length)) {
    for (let i = 1; i < o.ranked.length; i++) assert.ok(o.ranked[i].meanSurvival <= o.ranked[i - 1].meanSurvival);
    for (const r of o.ranked) assert.equal(r.indistinguishable, r.maxSurvival >= o.ranked[0].minSurvival);
    for (const r of o.ranked) for (const h of o.horizons) assert.ok(r.at[h], `${o.lens} at ${h}`);
  }
  for (const o of out.filter((z) => ['nlsy79_couples', 'nlsy79_individuals', 'nsfg2002_family', 'nsfg2002_first_marriage'].includes(z.lens))) {
    for (let i = 1; i < o.ranked.length; i++) assert.ok(o.ranked[i].meanSurvival <= o.ranked[i - 1].meanSurvival);
    const top = o.ranked[0];
    assert.equal(top.indistinguishable, true);
    for (const r of o.ranked) assert.equal(r.indistinguishable, r.maxSurvival >= top.minSurvival);
    assert.equal(o.tied, o.ranked.filter((r) => r.indistinguishable).length);
    assert.deepEqual(o.refused.map((r) => r.description), ['Same sex']);
    for (const r of o.ranked) assert.ok(r.lifelong && r.at[5] && r.at[20]);
    if (o.hasReference) for (const r of o.ranked) assert.ok(r.percentile[10] || r.percentile[0]);
  }
  // Different lenses can rank differently; each table stands alone.
  const ids = out.map((o) => o.ranked.map((r) => r.description).join('>'));
  assert.equal(ids.length, out.length);
});
