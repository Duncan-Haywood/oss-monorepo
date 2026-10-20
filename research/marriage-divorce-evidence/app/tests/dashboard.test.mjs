// Dashboard: constraints (locks, exclusions, age gap) are respected, the search is capped and
// says what it held, tiers group overlapping profiles, what-ifs are signed and ordered, and
// constraints round-trip through the URL fragment.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { cleanConstraints, encodeConstraints, decodeConstraints, partnerSpace, partnerDashboard, whatIfs, topTier, emptyConstraints } from '../dashboard.js';
import { lensView, shareOod, decodeScenario, encodeScenario, project, scoringModels } from '../couple.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => lensView(JSON.parse(readFileSync(new URL(f, dir))));
const nlsy = load('nlsy79_couples.json');
const ind = load('nlsy79_individuals.json');
const nsfg = load('nsfg2002_first_marriage.json');
const family = load('nsfg2002_family.json');
shareOod([nsfg, family]);

const me = { sex: 'Woman', age: 36, school: '16–17 years', degree: 'Bachelor', wages: 55000, work: '2,000+ hours', religion: 'Less than weekly', priorMarriage: false, firstMarriageAge: 36, raceEth: 'White', priorChildren: 'No', intactFamily: 'Yes' };
const partner = { sex: 'Man', age: 38, school: '13–15 years', degree: 'Some college', wages: 60000, work: '2,000+ hours', religion: 'Never', priorMarriage: false, firstMarriageAge: 38, raceEth: 'White', priorChildren: 'No', intactFamily: 'Yes' };
const couple = { yearsMarried: 0, familyIncome: '', cohabitedFirst: 'Yes', currentYear: 2026 };

test('constraints are cleaned and round-trip through the URL fragment', () => {
  const c = { locks: ['a.degree', 'b.religion', 'couple.cohabitedFirst', 'a.evil', 'z.age'], exclude: { 'b.religion': ['Never', 'Sometimes'], 'b.work': ['1–1,999 hours'], 'b.age': ['3'] }, gapMax: 5 };
  const clean = cleanConstraints(c);
  assert.deepEqual(clean, { locks: ['a.degree', 'b.religion', 'couple.cohabitedFirst'], exclude: { 'b.religion': ['Never'], 'b.work': ['1–1,999 hours'] }, gapMax: 5 });
  const frag = encodeConstraints(c);
  assert.deepEqual(decodeConstraints('#' + frag), clean);
  // Joined to a scenario: each decoder takes only its own keys.
  const hash = encodeScenario({ 'a.sex': 'Woman', 'a.age': '36' }) + '&' + frag;
  assert.deepEqual(decodeScenario(hash), { 'a.sex': 'Woman', 'a.age': '36' });
  assert.deepEqual(decodeConstraints(hash), clean);
  assert.deepEqual(decodeConstraints('#gap=99&lock=a.sex,..%2F&ex.b.religion=%3Cscript%3E'), { locks: ['a.sex'], exclude: {}, gapMax: null });
  assert.deepEqual(decodeConstraints(''), emptyConstraints());
});

test('locked and excluded partner fields never vary; the age gap is capped', () => {
  const c = { locks: ['b.degree'], exclude: { 'b.religion': ['Never'] }, gapMax: 3 };
  const s = partnerSpace(nlsy, me, partner, couple, c);
  assert.ok(s.list.length > 1 && s.list.length <= 600);
  for (const p of s.list) {
    assert.equal(p.degree, partner.degree);
    assert.notEqual(p.religion, 'Never');
    assert.ok(Math.abs(p.age - me.age) <= 3);
    if (!p.priorMarriage) assert.equal(p.firstMarriageAge, p.age);
  }
  // Uncapped grid is 5*5*6*3*3*2 = 2,700; the cap holds the lowest-priority traits and says so.
  const free = partnerSpace(nlsy, me, partner, couple);
  assert.equal(free.total, 2700);
  assert.ok(free.size <= 600);
  assert.ok(free.heldForSpeed.length >= 1);
  for (const t of free.traits.filter((x) => x.held === 'speed')) assert.equal(new Set(free.list.map((p) => p[t.key])).size, 1);
  // A constraint that leaves nothing is reported, not silently ignored.
  const none = partnerSpace(nlsy, me, partner, couple, { exclude: { 'b.religion': ['Never', 'Less than weekly', 'Weekly or more'] } });
  assert.deepEqual(none.conflicts, ['Religious attendance']);
  assert.equal(none.list.length, 0);
});

test('partner dashboard: tiers by overlap, per-trait view, NSFG abstention respected', () => {
  const d = partnerDashboard(nlsy, me, partner, couple, { locks: ['b.degree'] }, { cap: 200 });
  const r = d.ranking.ranked;
  assert.ok(r.length > 10);
  for (let i = 1; i < r.length; i++) assert.ok(r[i].meanSurvival <= r[i - 1].meanSurvival);
  for (const x of r) assert.equal(x.indistinguishable, x.maxSurvival >= r[0].minSurvival);
  assert.equal(d.tier.count, r.filter((x) => x.indistinguishable).length);
  assert.ok(d.tier.lo <= d.tier.meanLo && d.tier.meanHi <= d.tier.hi);
  assert.ok(!d.perTrait.some((t) => t.key === 'degree'), 'a locked trait has no per-trait row');
  const age = d.perTrait.find((t) => t.key === 'age');
  assert.ok(age.rows.some((x) => x.isReference && Math.abs(x.delta) < 1e-12));
  // tiers on a toy list
  const toy = [{ meanSurvival: 0.9, minSurvival: 0.85, maxSurvival: 0.95, indistinguishable: true }, { meanSurvival: 0.84, minSurvival: 0.8, maxSurvival: 0.86, indistinguishable: true }, { meanSurvival: 0.7, minSurvival: 0.6, maxSurvival: 0.8, indistinguishable: false }];
  assert.deepEqual(topTier(toy), { count: 2, of: 3, meanLo: 0.84, meanHi: 0.9, lo: 0.8, hi: 0.95 });
  assert.equal(topTier([]), null);
  // NSFG: a 27-year-old woman; only husband traits the lens models, all inside support.
  const young = { ...me, age: 27, firstMarriageAge: 27 };
  const n = partnerDashboard(nsfg, young, { ...partner, age: 29, firstMarriageAge: 29 }, couple);
  assert.deepEqual(n.space.traits.map((t) => t.key), ['age', 'priorMarriage', 'priorChildren', 'raceEth']);
  assert.ok(n.ranking.ranked.every((x) => x.percentile === undefined || x.percentile === null || x.percentile[10]));
  assert.ok(n.ranking.ranked[0].percentile[10].percentile > 0);
  // A man's view varies the wife's traits instead.
  const m = partnerDashboard(nsfg, { ...partner, age: 29 }, { ...young }, couple);
  assert.deepEqual(m.space.traits.map((t) => t.key), ['age', 'raceEth', 'intactFamily']);
});

test('what-ifs: signed, ordered, respect locks and exclusions, and combine', () => {
  const w = whatIfs(nlsy, me, partner, couple);
  assert.ok(w.items.length > 3);
  for (let i = 1; i < w.items.length; i++) assert.ok(w.items[i].at[10].delta <= w.items[i - 1].at[10].delta);
  for (const it of w.items) {
    for (const h of [5, 10, 20]) {
      const a = it.at[h];
      assert.ok(a.lo <= a.delta + 1e-15 && a.delta <= a.hi + 1e-15);
      if (a.lo > 0) assert.equal(a.agree, it.models);
    }
    assert.ok(it.unchanged >= 0 && it.unchanged <= it.models);
    assert.ok(it.changeability);
  }
  // Re-derive one item's sign from the projection directly.
  const it = w.items[0];
  const a2 = { ...me, ...(it.change.a || {}) };
  const direct = project(nlsy, a2, partner, couple, 10)[9].meanSurvival - project(nlsy, me, partner, couple, 10)[9].meanSurvival;
  assert.ok(Math.abs(direct - it.at[10].delta) < 1e-12);
  const locked = whatIfs(nlsy, me, partner, couple, { locks: ['a.degree', 'a.school'], exclude: { 'a.religion': ['Weekly or more'] } });
  assert.ok(!locked.items.some((x) => x.keys.includes('a.degree')));
  assert.ok(!locked.items.some((x) => x.change.a?.religion === 'Weekly or more'));
  assert.ok(locked.blocked.length > 0);
  if (w.combined) {
    assert.ok(w.combined.labels.length > 1);
    assert.ok(w.combined.at[10].delta > 0);
  }
  // NSFG: cohabitation and timing are couple-level; locking cohabitation removes them.
  const young = { ...me, age: 27, firstMarriageAge: 27 };
  const hus = { ...partner, age: 29, firstMarriageAge: 29 };
  const n = whatIfs(nsfg, young, hus, { ...couple, cohabitedFirst: 'Yes' });
  assert.ok(n.items.some((x) => x.keys.includes('couple.cohabitedFirst')));
  assert.ok(n.items.every((x) => /before the wedding/.test(x.changeability)));
  const nl = whatIfs(nsfg, young, hus, couple, { locks: ['couple.cohabitedFirst'] });
  assert.ok(!nl.items.some((x) => x.keys.includes('couple.cohabitedFirst')));
  // The tree in A's NSFG lens does not split on cohabitation: it is reported as unchanged.
  const cohab = n.items.find((x) => x.keys.includes('couple.cohabitedFirst'));
  assert.ok(cohab.unchanged >= 1 && cohab.unchangedTrees);
  assert.equal(scoringModels(nsfg).length, cohab.models);
  // Individuals lens works through the same path.
  assert.ok(whatIfs(ind, me, partner, couple).items.length > 0);
});
