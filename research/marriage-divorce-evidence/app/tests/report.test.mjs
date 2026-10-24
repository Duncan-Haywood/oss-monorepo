// Profile report: partner mixes (date everyone vs likely partners) are proper weighted averages
// of the lens's own predictions, the likely mix agrees with population.js justMe, lenses
// without a partner distribution say so, factor impacts are non-negative and sorted, changes
// carry evidence grades, and nothing is invented for a lens that cannot speak.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lensView, shareOod, project, stepAt, scoringModels } from '../couple.js';
import { justMe } from '../population.js';
import { partnerMix, scoreMix, personReport, profileReport, gradeFor, describeNsfgTraits, aboveBelow, inHundred } from '../report.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => lensView(JSON.parse(readFileSync(new URL(f, dir))));
const pooled = load('nsfg_pooled_first_marriage.json');
const nsfg = load('nsfg2002_first_marriage.json');
const family = load('nsfg2002_family.json');
const nlsyFm = load('nlsy79_first_marriage.json');
const nlsy97 = load('nlsy97_first_marriage.json');
const sipp = load('sipp_first_marriage.json');
shareOod([nsfg, family, pooled]);
const evidence = JSON.parse(readFileSync(new URL('../data/decision_evidence.json', import.meta.url)));

const me = { sex: 'Woman', age: 36, school: '16–17 years', degree: 'Bachelor', wages: 55000, work: '2,000+ hours', religion: 'Less than weekly', priorMarriage: false, firstMarriageAge: 36, raceEth: 'White', priorChildren: 'No', intactFamily: 'Yes', kidsBefore: '0', motherEdu: 'Some college', motherAgeFirst: '20–24', religionRaised: 'Catholic', bornUS: 'Yes', priorPartners: '0' };
const him = { sex: 'Man', age: 38, school: '13–15 years', degree: 'Some college', wages: 60000, work: '2,000+ hours', religion: 'Never', priorMarriage: false, firstMarriageAge: 38, raceEth: 'White', priorChildren: 'No', intactFamily: 'Yes', kidsBefore: '0', motherEdu: 'High school', motherAgeFirst: '18–19', religionRaised: 'Other Protestant', bornUS: 'Yes', priorPartners: '1' };
const couple = { yearsMarried: 0, familyIncome: '', cohabitedFirst: 'Yes', currentYear: 2026 };

test('mix weights sum to 1 and "everyone" pools more marriages than "likely"', () => {
  for (const b of [pooled, nsfg, nlsyFm]) {
    const ev = partnerMix(b, me, couple, 'everyone', him);
    assert.ok(ev.profiles.length > 0, b.id);
    assert.ok(Math.abs(ev.profiles.reduce((s, p) => s + p.weight, 0) - 1) < 1e-9);
    const lk = partnerMix(b, { ...me, age: 26, firstMarriageAge: 26 }, couple, 'likely', him);
    if (lk.profiles) {
      assert.ok(Math.abs(lk.profiles.reduce((s, p) => s + p.weight, 0) - 1) < 1e-9);
      assert.ok(ev.n > lk.n, `${b.id}: everyone pools every cell of your sex`);
    }
  }
});

test('the mix average is the weighted average of each profile’s own prediction', () => {
  const mix = partnerMix(pooled, me, couple, 'likely', him);
  const r = scoreMix(pooled, me, mix, 10, { draws: 50 });
  let acc = 0;
  let w = 0;
  for (const p of mix.profiles) {
    const y = stepAt(project(pooled, me, p.partner, p.couple, 10), 10);
    acc += p.weight * (1 - y.meanSurvival);
    w += p.weight;
  }
  assert.ok(Math.abs(r.risk - acc / w) < 1e-12);
  assert.ok(r.riskMin <= r.risk + 1e-12 && r.risk <= r.riskMax + 1e-12);
  assert.ok(r.ci[0] <= r.risk + 1e-9 && r.risk <= r.ci[1] + 1e-9, 'interval brackets the estimate');
  assert.ok(Math.abs(r.top.reduce((s, t) => s + t.share, 0) - 1) < 1e-9 || r.top.length === 5);
  // Deterministic.
  assert.deepEqual(scoreMix(pooled, me, mix, 10, { draws: 50 }).ci, r.ci);
});

test('likely partners agree with population.js justMe on the same lens', () => {
  const young = { ...me, age: 26, firstMarriageAge: 26 };
  const mix = partnerMix(nsfg, young, couple, 'likely');
  const r = scoreMix(nsfg, young, mix, 10, { draws: 20 });
  const j = justMe(nsfg, young, couple);
  const h10 = j.horizons.find((x) => x.horizon === 10);
  assert.ok(Math.abs(r.risk - (1 - h10.meanSurvival)) < 1e-9);
});

test('"everyone" uses the partners’ own race mix for women, not "same as you"', () => {
  const ev = partnerMix(nsfg, me, couple, 'everyone');
  const races = new Set(ev.profiles.map((p) => p.partner.raceEth));
  assert.ok(races.size >= 3);
  const white = ev.profiles.filter((p) => p.partner.raceEth === 'White').reduce((s, p) => s + p.weight, 0);
  assert.ok(white > 0.3 && white < 0.95, String(white));
});

test('lenses without a partner distribution say so; one-person lenses say why', () => {
  const r = partnerMix(nlsy97, me, couple, 'likely');
  assert.ok(!r.profiles && /partner distribution/.test(r.reason));
  const s = partnerMix(sipp, me, couple, 'everyone');
  assert.ok(s.selfOnly && /own traits/.test(s.reason));
  const rep = personReport(sipp, me, him, couple, { evidence, draws: 10 });
  assert.equal(rep.everyone.available, false);
  assert.ok(rep.self && Number.isFinite(rep.self.risk), 'a one-person lens still reports you alone');
});

test('person report: factors sorted by spread, changes graded, lowest-risk list from the search', () => {
  const r = profileReport(nsfg, me, him, couple, { evidence, draws: 20 });
  for (const p of [r.you, r.them]) {
    assert.ok(p.factors.length > 0);
    for (let i = 1; i < p.factors.length; i++) assert.ok(p.factors[i - 1].spread >= p.factors[i].spread);
    for (const f of p.factors) assert.ok(f.spread >= 0 && ['partner', 'own'].includes(f.kind));
    assert.ok(p.lowest.list.length > 0 && p.lowest.tied >= 1);
    for (let i = 1; i < p.lowest.list.length; i++) assert.ok(p.lowest.list[i - 1].risk <= p.lowest.list[i].risk + 1e-12);
    for (const c of p.changes) assert.ok(c.riskDrop > 0 && c.agree <= c.models);
    assert.ok(p.withPartner && Number.isFinite(p.withPartner.risk));
  }
  // The same couple from either side has the same risk.
  assert.ok(Math.abs(r.you.withPartner.risk - r.them.withPartner.risk) < 1e-12);
  const cohab = r.you.factors.find((f) => f.key === 'cohabitedFirst');
  assert.equal(cohab.grade.factor, 'cohabitation_before_marriage');
  assert.equal(cohab.grade.causal, false);
});

test('evidence grades map form fields; unknown fields get none', () => {
  assert.equal(gradeFor('degree', evidence).factor, 'education_completion');
  assert.equal(gradeFor('wages', evidence).causal, true); // income support trials
  assert.equal(gradeFor('raceEth', evidence), null);
  assert.equal(gradeFor('degree', null), null);
});

test('helpers', () => {
  assert.equal(inHundred(0.054), 5);
  assert.equal(aboveBelow({ percentile: 80 }), 'above');
  assert.equal(aboveBelow({ percentile: 10 }), 'below');
  assert.equal(aboveBelow({ percentile: 50 }), 'about average');
  assert.equal(aboveBelow(null), null);
  assert.match(describeNsfgTraits({ gap_bin: '0-2 years', husband_married_before: 'No', husband_prior_children: 'No', race: 'White', cohabited_first: 'Yes' }, me), /White \(same as you\).*lived together first/);
  assert.equal(scoringModels(nsfg).length >= 1, true);
});
