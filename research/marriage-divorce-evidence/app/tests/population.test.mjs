// Population comparison: percentile interpolation, quantile formats, subgroup selection, the
// shipped NSFG reference blocks, "just me" over the partner distribution, and lenses without
// a reference saying so.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { percentileOf, quantilesAt, levelFor, memberships, compareRisks, populationComparison, justMe, partnerCell, partnerFromProfile, atWedding, referenceFor } from '../population.js';
import { lensView, shareOod, project } from '../couple.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => lensView(JSON.parse(readFileSync(new URL(f, dir))));
const nsfg = load('nsfg2002_first_marriage.json');
const family = load('nsfg2002_family.json');
shareOod([nsfg, family]);
const nlsy = load('nlsy79_couples.json');
const ind = load('nlsy79_individuals.json');

// A test ladder of quantiles: p_k = k / 100 (illustrative numbers, not data).
const ladder = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);

test('percentile interpolation and the ends', () => {
  assert.deepEqual(percentileOf(0.001, ladder), { percentile: 1, below: true, label: 'below p1' });
  assert.deepEqual(percentileOf(0.995, ladder), { percentile: 99, above: true, label: 'above p99' });
  assert.equal(percentileOf(0.01, ladder).percentile, 1);
  assert.equal(percentileOf(0.99, ladder).percentile, 99);
  assert.ok(Math.abs(percentileOf(0.425, ladder).percentile - 42.5) < 1e-9);
  assert.equal(percentileOf(0.5, ladder).label, 'p50');
  // A flat stretch (ties) reports its middle, and values inside it interpolate around it.
  const flat = ladder.map((v, i) => (i >= 9 && i <= 19 ? 0.15 : v));
  assert.equal(percentileOf(0.15, flat).percentile, 15);
  assert.ok(percentileOf(0.155, flat).percentile > 20 && percentileOf(0.155, flat).percentile < 21);
  assert.equal(percentileOf(NaN, ladder), null);
  assert.equal(percentileOf(0.5, ladder.slice(1)), null);
  // Monotone in the value.
  let prev = 0;
  for (let v = 0.01; v <= 0.99; v += 0.013) { const p = percentileOf(v, ladder).percentile; assert.ok(p >= prev); prev = p; }
});

test('quantile formats: per-horizon lists, plain numbers, keyed by horizon', () => {
  const lists = { quantiles: Object.fromEntries(ladder.map((v, i) => ['p' + (i + 1), [v / 2, v, v * 1.5]])) };
  assert.equal(quantilesAt(lists, 10, [5, 10, 20])[49], 0.5);
  assert.equal(quantilesAt(lists, 20, [5, 10, 20])[0], 0.015);
  assert.equal(quantilesAt(lists, 30, [5, 10, 20]), null);
  const plain = { quantiles: Object.fromEntries(ladder.map((v, i) => ['p' + (i + 1), v])) };
  assert.equal(quantilesAt(plain, 10, [10])[98], 0.99);
  const keyed = { quantiles: { 10: plain.quantiles } };
  assert.equal(quantilesAt(keyed, 10, [10])[0], 0.01);
  assert.equal(quantilesAt({ quantiles: { p1: 0.1 } }, 10, [10]), null, 'incomplete quantiles are refused');
});

test('subgroup selection by bins, categories and bare attributes', () => {
  const cell = (n) => ({ n, quantiles: Object.fromEntries(ladder.map((v, i) => ['p' + (i + 1), [v]])) });
  const ref = {
    horizons: [10], min_cell: 100, overall: cell(1000),
    subgroups: { wife_age_band: { 'under 20': cell(300), '20-24': cell(400) }, cohabited_first: { Yes: cell(500), No: cell(500) }, region: { South: cell(200) } },
    subgroup_defs: { wife_age_band: { label: 'Wife age', column: 'wife_age_at_marriage', bins: [{ level: 'under 20', min: null, max: 20 }, { level: '20-24', min: 20, max: 25 }, { level: '25-29', min: 25, max: 30 }] }, cohabited_first: { label: 'Cohabited', column: 'cohabited_first' } },
  };
  assert.equal(levelFor(ref, 'wife_age_band', { wife_age_at_marriage: 19.99 }), 'under 20');
  assert.equal(levelFor(ref, 'wife_age_band', { wife_age_at_marriage: 20 }), '20-24');
  assert.equal(levelFor(ref, 'wife_age_band', { wife_age_at_marriage: 45 }), null);
  assert.equal(levelFor(ref, 'region', { region: 'South' }), 'South', 'no def: the attribute named like the variable');
  const m = memberships(ref, { wife_age_at_marriage: 27, cohabited_first: 'Unknown', region: 'South' });
  assert.equal(m.find((s) => s.variable === 'wife_age_band').cell, null, '25-29 has no cell here');
  assert.match(m.find((s) => s.variable === 'wife_age_band').reason, /fewer than 100/);
  assert.equal(m.find((s) => s.variable === 'cohabited_first').level, null, 'Unknown is not a subgroup');
  const cmp = compareRisks(ref, { 10: 0.3 }, { wife_age_at_marriage: 22, cohabited_first: 'Yes', region: 'South' });
  assert.equal(cmp.horizons.length, 1);
  assert.ok(Math.abs(cmp.horizons[0].overall.percentile - 30) < 1e-9);
  assert.equal(cmp.horizons[0].subgroups.filter((s) => Number.isFinite(s.percentile)).length, 3);
  assert.equal(cmp.horizons[0].overall.median, 0.5);
  const sub = cmp.horizons[0].subgroups.find((x) => x.variable === 'wife_age_band');
  assert.equal(sub.label, 'Wife age', 'the group label is not overwritten by the percentile label');
  assert.equal(sub.pLabel, 'p30');
});

test('shipped NSFG reference blocks are aggregate, valid and per lens', () => {
  for (const b of [nsfg, family]) {
    const ref = referenceFor(b);
    assert.ok(ref, b.id);
    assert.deepEqual(ref.horizons, [5, 10, 20]);
    assert.equal(ref.overall.n, 4126);
    for (const h of ref.horizons) {
      const q = quantilesAt(ref.overall, h, ref.horizons);
      assert.equal(q.length, 99);
      for (let i = 1; i < 99; i++) assert.ok(q[i] >= q[i - 1]);
      assert.ok(q[0] > 0 && q[98] < 1);
    }
    for (const [v, cells] of Object.entries(ref.subgroups)) {
      for (const [lv, c] of Object.entries(cells)) {
        assert.ok(c.n >= 100, `${b.id} ${v}=${lv} has n ${c.n}`);
        assert.ok(lv !== 'Unknown');
      }
    }
    // Longer horizons have higher risk at the median.
    const med = ref.horizons.map((h) => quantilesAt(ref.overall, h, ref.horizons)[49]);
    assert.ok(med[0] < med[1] && med[1] < med[2]);
    // Nothing person-level: only aggregate keys.
    assert.deepEqual(Object.keys(b.population_reference).sort(), ['about', 'horizons', 'min_cell', 'overall', 'quantity', 'subgroup_defs', 'subgroups', 'weights']);
    assert.equal(ref.shape, 'standard');
    assert.equal(ref.model, null, 'the reference is of the lens mean');
  }
  // Each lens's reference comes from its own models, so the two are not identical.
  assert.notDeepEqual(nsfg.population_reference.overall, family.population_reference.overall);
});

const wife = { sex: 'Woman', age: 27, raceEth: 'White', intactFamily: 'Yes', priorMarriage: false, priorChildren: 'No' };
const husband = { sex: 'Man', age: 29, raceEth: 'White', intactFamily: 'Yes', priorMarriage: false, priorChildren: 'No' };
const couple = { yearsMarried: 0, cohabitedFirst: 'Yes', currentYear: 2026 };

test('a scored couple gets percentiles overall and in its subgroups', () => {
  const cmp = populationComparison(nsfg, wife, husband, couple);
  assert.equal(cmp.horizons.length, 3);
  const h10 = cmp.horizons.find((h) => h.horizon === 10);
  const p = project(nsfg, wife, husband, couple, 10);
  assert.ok(Math.abs(h10.risk - (1 - p[9].meanSurvival)) < 1e-12);
  assert.ok(h10.overall.percentile > 1 && h10.overall.percentile < 99);
  const vars = h10.subgroups.filter((s) => Number.isFinite(s.percentile)).map((s) => s.variable);
  for (const v of ['wife_age_band', 'cohabited_first', 'husband_married_before', 'wife_race_ethnicity', 'wife_intact_family']) assert.ok(vars.includes(v), v);
  // A 2026 wedding is in no surveyed decade: said, not guessed.
  assert.ok(cmp.skipped.some((s) => s.variable === 'wedding_decade'));
  // A married couple is compared from its wedding day.
  const married = { ...couple, yearsMarried: 4 };
  const w = atWedding({ ...wife, age: 31 }, { ...husband, age: 33 }, married);
  assert.equal(w.a.age, 27);
  assert.equal(w.couple.yearsMarried, 0);
  assert.equal(w.couple.currentYear, 2022);
  const again = populationComparison(nsfg, { ...wife, age: 31 }, { ...husband, age: 33 }, married);
  assert.ok(Math.abs(again.horizons[1].risk - h10.risk) < 0.02);
  // Refused couples get no percentile.
  assert.ok(populationComparison(nsfg, { ...wife, priorMarriage: true }, husband, couple).refused.length);
});

test('lenses without a reference say so; no pooling across lenses', () => {
  // NLSY79 individuals has none; NLSY79 couples now has one, of the ANNUAL RATE over couple-years.
  assert.equal(populationComparison(ind, { ...wife, age: 40 }, { ...husband, age: 42 }, couple), null);
  const nl = { sex: 'Woman', age: 40, school: '16–17 years', degree: 'Bachelor', wages: 50000, work: '2,000+ hours', religion: 'Never', priorMarriage: false, firstMarriageAge: 30 };
  const nm = { ...nl, sex: 'Man', age: 42, firstMarriageAge: 32 };
  const ann = populationComparison(nlsy, nl, nm, { yearsMarried: 10 });
  assert.equal(ann.quantity, 'annual_rate');
  assert.deepEqual(ann.horizons.map((h) => h.horizon), [0]);
  assert.ok(ann.horizons[0].risk > 0 && ann.horizons[0].risk < 0.1, 'an annual rate, not a cumulative risk');
  const a = populationComparison(nsfg, wife, husband, couple).horizons[1];
  const b = populationComparison(family, wife, husband, couple).horizons[1];
  assert.notEqual(a.risk, b.risk, 'each lens scores with its own models');
});

test('just me: averaged over the partner distribution, with percentiles', () => {
  const pd = nsfg.partner_distribution;
  assert.ok(pd.given_wife.length > 5 && pd.given_husband.length > 5);
  for (const c of [...pd.given_wife, ...pd.given_husband]) {
    assert.ok(c.n >= 30);
    const s = c.profiles.reduce((x, p) => x + p.share, 0);
    assert.ok(Math.abs(s - 1) < 1e-4);
    assert.ok(c.coverage > 0 && c.coverage <= 1);
  }
  const { cell } = partnerCell(pd, wife, couple);
  assert.equal(cell.given.wife_age_band, '25-29');
  const { partner, couple: c } = partnerFromProfile(wife, cell.profiles[0].traits, pd, couple);
  assert.equal(partner.sex, 'Man');
  assert.equal(partner.age, 27 + pd.gap_values[cell.profiles[0].traits.gap_bin]);
  assert.equal(c.cohabitedFirst, cell.profiles[0].traits.cohabited_first);
  const r = justMe(nsfg, wife, couple);
  assert.equal(r.available, true);
  assert.equal(r.horizons.length, 3);
  for (const h of r.horizons) assert.ok(h.minSurvival <= h.meanSurvival + 1e-12 && h.meanSurvival <= h.maxSurvival + 1e-12);
  assert.ok(r.horizons[0].meanSurvival > r.horizons[2].meanSurvival);
  assert.ok(Number.isFinite(r.comparison.horizons[1].overall.percentile));
  const man = justMe(nsfg, { ...husband }, couple);
  assert.equal(man.available, true);
  // Missing race-ethnicity, a lens without a distribution, and a previously married wife.
  assert.equal(justMe(nsfg, { ...wife, raceEth: '' }, couple).available, false);
  assert.match(justMe(nlsy, wife, couple).reason, /no partner distribution/);
  assert.equal(justMe(nsfg, { ...wife, priorMarriage: true }, couple).available, false);
  // A cell whose publishable profiles cover under half its marriages is not used.
  const thin = pd.given_wife.find((c) => c.coverage < 0.5);
  if (thin) {
    const r2 = justMe(nsfg, { ...wife, raceEth: thin.given.wife_race_ethnicity, age: { 'under 20': 19, '20-24': 22, '25-29': 27, '30+': 33 }[thin.given.wife_age_band] }, couple);
    assert.equal(r2.available, false);
    assert.match(r2.reason, /cover only/);
  }
});

test('references in an unknown shape are not read', () => {
  assert.equal(referenceFor({ population_reference: { cells: [{ variable: 'All', n: 100 }], quantiles: [0.5] } }), null);
  assert.equal(referenceFor({ population_reference: { overall: { n: 1, quantiles: {} } } }), null);
  assert.equal(referenceFor({ population_reference: { horizons: [10], overall: { n: 1, quantiles: {} } } }), null, 'no complete quantiles');
  assert.equal(referenceFor({ population_reference: { something: 'else' } }), null);
});
