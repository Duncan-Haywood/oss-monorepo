// Form adapters for the newer lenses (lens-adapters.js through couple.js): every model input is
// filled from the form with a level the model knows; projections combine periods exactly as each
// bundle's how_to_combine says; refusals, horizons and out-of-distribution scores are per lens;
// population references in every shape convert to the normalised one; just-me, candidates,
// what-ifs, the dashboard and batch scoring work through each lens.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { predict } from '../engine.js';
import { lensView, expandLens, lensSummary, adapterFor, refusals, lensNotes, project, scoringModels, referenceOnlyModels, lensHorizons, primaryHorizon, stepAt, typicality, lifelong, selfChanges, coupleChanges, rankPartners, rowLabels, lensSkill, encodeScenario, decodeScenario } from '../couple.js';
import { referenceFor, populationComparison, percentileOf, justMe } from '../population.js';
import { partnerDashboard, whatIfs } from '../dashboard.js';
import { scoreLens } from '../batch.js';
import { satisfactionSum, hostilitySum, SAT_SCALE, HOSTILE_SCALE, eduYears, CPI } from '../lens-adapters.js';

const dir = new URL('../models/', import.meta.url);
const raw = (f) => JSON.parse(readFileSync(new URL(f, dir)));
const B = {};
for (const e of JSON.parse(readFileSync(new URL('index.json', dir))).lenses) for (const b of expandLens(lensView(raw(e.file)))) B[b.id] = b;
const mortality = JSON.parse(readFileSync(new URL('../data/us_mortality_wpp2024.json', import.meta.url)));

// A filled-in couple (illustrative profile, not data): married now, every new question answered.
const sat = Array(8).fill('Very satisfied');
const you = {
  sex: 'Woman', age: 28, school: '16–17 years', degree: 'Bachelor', wages: 52000, work: '2,000+ hours', religion: 'Less than weekly', priorMarriage: false, firstMarriageAge: 28,
  raceEth: 'White', priorChildren: 'No', intactFamily: 'Yes', bornUS: 'Yes', quality: 'Excellent', hapmar: 'Very happy', party: 'Democrat', parentsView: 'Approve',
  kidsBefore: '0', priorPartners: '0', enrolled: 'No', religionRaised: 'Catholic', motherEdu: 'Some college', motherAgeFirst: '20–24', attendDetail: 'About monthly',
  satSum: satisfactionSum(sat), hostSum: 2, obsPos: 'Often', obsNeg: 'Rarely', obsEff: 'Often', substance: 'No', ace: 'No', abuse: 'No', lowMood: 'No',
};
const partner = { ...you, sex: 'Man', age: 30, firstMarriageAge: 30, school: '13–15 years', degree: 'Some college', wages: 48000, quality: 'Good', party: 'Independent, other or no preference', motherEdu: 'High school', motherAgeFirst: '18–19', satSum: 33, obsNeg: 'Sometimes' };
const couple = { yearsMarried: 0, familyIncome: '', cohabitedFirst: 'Yes', currentYear: 2026, status: 'Married, living together', yearsTogether: 3, howMet: 'Through friends', childrenHome: 0, place: 'U.S. — Midwest', state: 'OH', expecting: 'No', cohabMonths: 18, netWorth: 40000, debt: 150000, unsecuredDebt: 8000, homeOwner: 'Yes' };
const canadian = { ...couple, place: 'Canada — Ontario', state: '' };
const NEW = ['hcmst_couples', 'gss_panel_marriages', 'nlsy79_first_marriage', 'nlsy97_first_marriage', 'nsfg_pooled_first_marriage', 'nsfg_pooled_both_sexes', 'canada_gss_first_marriage', 'newlywed_la_couples', 'sipp_first_marriage', 'sipp_prospective_couples', 'acs_one_year_divorce'];
const coupleFor = (id) => (id === 'canada_gss_first_marriage' ? canadian : couple);

test('every new lens is scorable and its rows fill every model input with a known level', () => {
  for (const id of NEW) {
    const b = B[id];
    assert.ok(b, id);
    assert.equal(adapterFor(b).id, id);
    assert.equal(lensSummary(b, {}).scorable, true, id);
    const c = coupleFor(id);
    assert.deepEqual(refusals(b, you, partner, c), [], `${id}: ${refusals(b, you, partner, c)[0]}`);
    const H = Math.max(...lensHorizons(b));
    const steps = project(b, you, partner, c, H).length;
    for (let k = 0; k < Math.min(steps, 3); k++) {
      for (const row of adapterFor(b).rows(b, you, partner, c, k)) {
        for (const m of scoringModels(b)) {
          for (const col of m.numeric?.columns || []) assert.ok(col in row, `${id} ${m.key}: numeric ${col} missing`);
          const cat = m.categorical || {};
          (cat.columns || []).forEach((col, j) => {
            assert.ok(col in row, `${id} ${m.key}: ${col} missing`);
            const v = row[col] === null || row[col] === undefined ? 'Unknown' : String(row[col]);
            assert.ok(cat.categories[j].includes(v), `${id} ${m.key}: ${col}=${v} is not a level the model knows`);
          });
        }
      }
    }
    assert.ok(rowLabels(b, you, partner, c).length >= 1, id);
  }
});

test('period lenses combine per-period probabilities as the bundles say; no step beyond their follow-up', () => {
  // HCMST: P(no break-up through k) = prod (1 - p_j), with mean age and years together advanced by
  // time_offsets[j]; averaged over the partners who rated the relationship.
  const h = B.hcmst_couples;
  const p = project(h, you, partner, couple, 50);
  assert.equal(p.length, 5, 'five follow-up periods, however long the horizon asked');
  assert.deepEqual(p.map((y) => y.elapsed), h.periods.map((x) => x.years_since_start_at_end));
  for (const m of scoringModels(h)) {
    let s = 1;
    h.periods.forEach((per, j) => {
      const off = h.time_offsets[per.period];
      const rows = adapterFor(h).rows(h, you, partner, couple, j);
      assert.equal(rows.length, 2);
      for (const r of rows) {
        assert.equal(r.period, per.period);
        assert.ok(Math.abs(r.mean_age - (29 + off)) < 1e-12);
        assert.ok(Math.abs(r.relationship_years - (3 + off)) < 1e-12);
      }
      s *= 1 - rows.reduce((t, r) => t + predict(m, r), 0) / rows.length;
      assert.ok(Math.abs(p[j].survival[m.key] - s) < 1e-12, `${m.key} period ${per.period}`);
    });
  }
  assert.deepEqual(scoringModels(h).map((m) => m.key), ['additive_core', 'additive_full', 'tree_depth3']);
  assert.deepEqual(referenceOnlyModels(h).map((m) => m.key).sort(), ['period_only', 'quality_only']);
  // Newlyweds: nine intervals to ~12 years, period_XX indicators set by the app.
  const n = B.newlywed_la_couples;
  const q = project(n, you, partner, couple, 99);
  assert.equal(q.length, 9);
  assert.equal(q[8].elapsed, 12.04);
  const r3 = adapterFor(n).rows(n, you, partner, couple, 3)[0];
  assert.equal(r3.period_05, 1);
  assert.equal(r3.period_03 + r3.period_04 + r3.period_06, 0);
  assert.equal(r3.period_years, n.periods[3].length_years);
  const all = n.models.find((m) => m.key === 'all');
  let s = 1;
  for (let j = 0; j < 9; j++) s *= 1 - predict(all, adapterFor(n).rows(n, you, partner, couple, j)[0]);
  assert.ok(Math.abs(q[8].survival.all - s) < 1e-12);
  assert.ok(!scoringModels(n).some((m) => m.key === 'tree'), 'the tree has no held-out skill: reference only');
  // GSS: one 2-year probability; never a lifetime figure.
  const g = B.gss_panel_marriages;
  const gp = project(g, you, partner, couple, 40);
  assert.equal(gp.length, 1);
  assert.equal(gp[0].elapsed, 2);
  const la = g.models.find((m) => m.key === 'logistic_additive');
  const rows = adapterFor(g).rows(g, you, partner, couple, 0);
  assert.ok(Math.abs(gp[0].survival.logistic_additive - (1 - rows.reduce((t, r) => t + predict(la, r), 0) / rows.length)) < 1e-12);
  assert.equal(lifelong(g, mortality, you, partner, couple, 40), null);
  assert.equal(lifelong(h, mortality, you, partner, couple, 40), null);
  // One-year lenses: SIPP couples and ACS; Poisson models' rates become 1 - exp(-rate).
  for (const id of ['sipp_prospective_couples', 'acs_one_year_divorce']) {
    const b = B[id];
    const pp = project(b, you, partner, couple, 30);
    assert.equal(pp.length, 1, id);
    assert.equal(pp[0].elapsed, 1);
    const boost = b.models.find((m) => m.key === 'gradient_boosting');
    const rr = adapterFor(b).rows(b, you, partner, couple, 0);
    const want = 1 - rr.reduce((t, r) => t + (1 - Math.exp(-predict(boost, r))), 0) / rr.length;
    assert.ok(Math.abs(pp[0].survival.gradient_boosting - want) < 1e-12, id);
  }
  assert.ok(!scoringModels(B.acs_one_year_divorce).some((m) => m.key.endsWith('_post')), 'post-event models are not used');
});

test('horizons: each lens shows only what it supports', () => {
  assert.deepEqual(lensHorizons(B.gss_panel_marriages), [2]);
  assert.deepEqual(lensHorizons(B.hcmst_couples), [2.167, 4.083, 8.417]);
  assert.deepEqual(lensHorizons(B.newlywed_la_couples), [2.34, 4.15, 8.77, 12.04]);
  assert.deepEqual(lensHorizons(B.acs_one_year_divorce), [1]);
  assert.deepEqual(lensHorizons(B.nlsy97_first_marriage), [5, 10, 20]);
  assert.equal(primaryHorizon(B.gss_panel_marriages), 2);
  assert.equal(primaryHorizon(B.hcmst_couples), 8.417);
  assert.equal(primaryHorizon(B.newlywed_la_couples), 8.77);
  assert.equal(primaryHorizon(B.nlsy97_first_marriage), 10);
  for (const id of NEW) {
    const b = B[id];
    const c = coupleFor(id);
    const p = project(b, you, partner, c, Math.max(...lensHorizons(b)));
    for (const h of lensHorizons(b)) assert.ok(stepAt(p, h), `${id} has a step ending at ${h}`);
    for (let i = 1; i < p.length; i++) assert.ok(p[i].meanSurvival <= p[i - 1].meanSurvival + 1e-12, id);
    const r = scoreLens({ bundle: b, summary: lensSummary(b, {}) }, you, partner, c, { mortality });
    assert.equal(r.status, 'ok', `${id}: ${r.reason}`);
    assert.deepEqual(r.horizons, lensHorizons(b), id);
    if (adapterFor(b).kind === 'rate') assert.ok(r.lifelong, id);
    else assert.equal(r.lifelong, undefined, id);
  }
});

test('refusals: each lens gives no number where its bundle says it cannot', () => {
  const R = (id, a, b, c = couple) => refusals(B[id], a, b, c).join(' ');
  // HCMST scores same-sex and unmarried couples, but needs quality, status, years together and politics.
  assert.equal(R('hcmst_couples', you, { ...partner, sex: 'Woman' }), '');
  assert.equal(R('hcmst_couples', you, partner, { ...couple, status: 'Not married, not living together' }), '');
  assert.match(R('hcmst_couples', { ...you, quality: '' }, { ...partner, quality: '' }), /relationship quality/);
  assert.match(R('hcmst_couples', you, partner, { ...couple, yearsTogether: '' }), /years you have been together/);
  assert.match(R('hcmst_couples', you, { ...partner, party: '' }), /party preference/);
  // One rating is enough: the lens averages over the partners who rated.
  assert.equal(adapterFor(B.hcmst_couples).rows(B.hcmst_couples, you, { ...partner, quality: '' }, couple, 0).length, 1);
  // GSS: married only; needs marriage happiness, a GSS race and a U.S. region.
  assert.match(R('gss_panel_marriages', you, partner, { ...couple, status: 'Not married, living together' }), /married now/);
  assert.match(R('gss_panel_marriages', { ...you, hapmar: '' }, { ...partner, hapmar: '' }), /marriage happiness/);
  assert.match(R('gss_panel_marriages', { ...you, raceEth: 'Hispanic' }, partner), /Hispanic/);
  assert.match(R('gss_panel_marriages', you, partner, { ...couple, place: 'Elsewhere', state: '' }), /U\.S\. region/);
  assert.equal(R('gss_panel_marriages', you, partner, { ...couple, place: '', state: 'TX' }), '', 'the state sets the region');
  // First-marriage lenses: a respondent married before is not a perspective; both married before = no number.
  for (const id of ['nlsy79_first_marriage', 'nlsy97_first_marriage', 'canada_gss_first_marriage', 'nsfg_pooled_both_sexes', 'sipp_first_marriage']) {
    const c = coupleFor(id);
    assert.equal(adapterFor(B[id]).rows(B[id], { ...you, priorMarriage: true }, partner, c, 0).length, 1, id);
    assert.match(R(id, { ...you, priorMarriage: true }, { ...partner, priorMarriage: true }, c), /first marriage/i, id);
  }
  assert.match(R('nsfg_pooled_first_marriage', { ...you, priorMarriage: true }, partner), /women’s first marriages/);
  assert.match(R('nsfg_pooled_first_marriage', { ...you, motherAgeFirst: '' }, partner), /mother’s age at her first birth/);
  assert.match(R('nlsy97_first_marriage', you, partner, { ...couple, expecting: '' }), /baby was expected/);
  assert.match(R('nlsy97_first_marriage', { ...you, age: 50 }, partner), /outside/);
  // Canada: Canadian region required; elsewhere is outside the population.
  assert.match(R('canada_gss_first_marriage', you, partner, couple), /ten Canadian provinces/);
  assert.match(R('canada_gss_first_marriage', you, partner, { ...couple, place: '', state: '' }), /Canadian region/);
  // Newlyweds: newlyweds, first-married, satisfaction answered.
  assert.match(R('newlywed_la_couples', you, partner, { ...couple, yearsMarried: 2 }), /first months of marriage/);
  assert.match(R('newlywed_la_couples', { ...you, satSum: '' }, { ...partner, satSum: '' }), /satisfaction/);
  assert.match(R('newlywed_la_couples', you, { ...partner, sex: 'Woman' }), /same-sex/);
  // SIPP couples: married and living together; needs home ownership. ACS: needs a state.
  assert.match(R('sipp_prospective_couples', you, partner, { ...couple, homeOwner: '' }), /own your home/);
  assert.match(R('sipp_prospective_couples', you, partner, { ...couple, status: 'Married, living apart' }), /living together/);
  assert.match(R('acs_one_year_divorce', you, partner, { ...couple, state: '' }), /U\.S\. state/);
  assert.match(R('acs_one_year_divorce', { ...you, priorMarriage: true }, partner), /how many times married/);
  assert.equal(R('acs_one_year_divorce', { ...you, priorMarriage: true, marriagesBefore: '1' }, partner), '');
});

test('out-of-distribution scores use each lens’s own rows', () => {
  for (const id of ['hcmst_couples', 'nlsy79_first_marriage', 'nlsy97_first_marriage', 'nsfg_pooled_first_marriage', 'canada_gss_first_marriage', 'newlywed_la_couples', 'nlsy79_couples']) {
    const b = B[id];
    const c = coupleFor(id);
    const t = typicality(b, id === 'nlsy79_couples' ? { ...you, age: 45 } : you, id === 'nlsy79_couples' ? { ...partner, age: 47 } : partner, c);
    assert.ok(t && Number.isFinite(t.percentile) && t.percentile >= 0 && t.percentile <= 100, id);
    assert.equal(t.unseen.length, 0, `${id}: unseen ${t.unseen}`);
  }
  // No spec, no score (and the lens says so in its notes or simply has no typicality line).
  for (const id of ['gss_panel_marriages', 'nsfg_pooled_both_sexes', 'sipp_first_marriage', 'acs_one_year_divorce']) assert.equal(typicality(B[id], you, partner, coupleFor(id)), null, id);
  // A couple far outside HCMST's data (both 84, together 60 years, 8 children at home, $1M income) abstains.
  const old = typicality(B.hcmst_couples, { ...you, age: 84 }, { ...partner, age: 84 }, { ...couple, yearsTogether: 60, childrenHome: 8, familyIncome: 1000000 });
  assert.ok(old.percentile > typicality(B.hcmst_couples, you, partner, couple).percentile);
  // Inputs not given count as typical, not unusual.
  const t1 = typicality(B.nlsy97_first_marriage, you, partner, couple);
  assert.ok(t1.neutralised.includes('urban'));
  assert.ok(lensNotes(B.hcmst_couples, you, partner, couple).some((n) => n.startsWith('Typicality')));
});

test('population references: every shape converts, keeps its own quantity and model', () => {
  const want = {
    nsfg2002_first_marriage: ['standard', 'cumulative', [5, 10, 20], null],
    nlsy97_first_marriage: ['standard', 'cumulative', [5, 10, 20], null],
    nsfg_pooled_first_marriage: ['standard', 'cumulative', [5, 10, 20], null],
    nsfg_pooled_both_sexes: ['standard', 'cumulative', [5, 10, 20], null],
    newlywed_la_couples: ['standard', 'cumulative', [2.34, 4.15, 8.77, 12.04], 'all'],
    sipp_first_marriage: ['standard', 'cumulative', [5, 10, 20], 'additive_spline'],
    acs_one_year_divorce: ['standard', 'cumulative', [1], 'gradient_boosting'],
    nlsy79_first_marriage: ['cells', 'cumulative', [5, 10, 20, 30], 'gradient_boosting'],
    canada_gss_first_marriage: ['cells', 'cumulative', [5, 10, 20], 'gradient_boosting'],
    gss_panel_marriages: ['horizon_N', 'cumulative', [2], 'logistic_additive'],
    hcmst_couples: ['per-model', 'cumulative', [2.167, 4.083, 8.417], 'additive_full'],
    nlsy79_couples: ['annual', 'annual_rate', [0], 'additive_enriched'],
  };
  for (const [id, [shape, quantity, horizons, model]] of Object.entries(want)) {
    const r = referenceFor(B[id]);
    assert.ok(r, id);
    assert.equal(r.shape, shape, id);
    assert.equal(r.quantity, quantity, id);
    assert.deepEqual(r.horizons, horizons, id);
    assert.equal(r.model, model, id);
    if (model) assert.ok(B[id].models.some((m) => m.key === model), `${id}: reference model is in the bundle`);
    assert.equal(r.levels.length, r.overall.values[horizons[0]].length, id);
    for (const h of horizons) {
      const q = r.overall.values[h].filter(Number.isFinite);
      for (let i = 1; i < q.length; i++) assert.ok(q[i] >= q[i - 1] - 1e-12, `${id} ${h}`);
    }
  }
  // NLSY79 first marriages: the cells' p5/p10 keys are horizons, and quantile levels come from `quantiles`.
  const n79 = referenceFor(B.nlsy79_first_marriage);
  assert.deepEqual(n79.levels, [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99]);
  assert.equal(n79.overall.values[10][10], B.nlsy79_first_marriage.population_reference.cells[0].p10[10]);
  // GSS: the 4-year block comes from a model the bundle does not export, so it is not used.
  assert.ok(!referenceFor(B.gss_panel_marriages).horizons.includes(4));
  // HCMST: suppressed outer percentiles are skipped, not read as zero.
  const hc = referenceFor(B.hcmst_couples);
  const poor = hc.subgroups.relationship_quality['Poor or very poor'].values[2.167];
  assert.equal(poor[0], null);
  const pc = percentileOf(0.001, poor, hc.levels);
  assert.equal(pc.label, 'below p10');
  // Sparse levels interpolate between neighbours.
  assert.ok(Math.abs(percentileOf(0.5, [0.1, 0.4, 0.6], [10, 50, 90]).percentile - 70) < 1e-9);
});

test('population comparison through each new lens, at the reference’s own quantity', () => {
  for (const id of ['hcmst_couples', 'gss_panel_marriages', 'nlsy97_first_marriage', 'nsfg_pooled_both_sexes', 'canada_gss_first_marriage', 'newlywed_la_couples', 'sipp_first_marriage', 'acs_one_year_divorce']) {
    const b = B[id];
    const c = coupleFor(id);
    const cmp = populationComparison(b, you, partner, c);
    assert.ok(cmp && !cmp.refused, id);
    assert.deepEqual(cmp.horizons.map((h) => h.horizon), referenceFor(b).horizons, id);
    for (const h of cmp.horizons) {
      assert.ok(h.risk > 0 && h.risk < 1, id);
      assert.ok(Number.isFinite(h.overall.percentile), id);
    }
    assert.ok(cmp.horizons[0].subgroups.some((s) => Number.isFinite(s.percentile)), `${id}: at least one subgroup`);
  }
  // The newlywed reference is of the 'all' model: the couple is compared with that model alone.
  const n = B.newlywed_la_couples;
  const cmp = populationComparison(n, you, partner, couple);
  const p = project(n, you, partner, couple, 12.04, [n.models.find((m) => m.key === 'all')]);
  assert.ok(Math.abs(cmp.horizons[3].risk - (1 - stepAt(p, 12.04).meanSurvival)) < 1e-12);
  // HCMST compares from today (no rewind); couple satisfaction third and low income are newlywed subgroups.
  const sub = cmp.horizons[0].subgroups.map((s) => s.variable);
  assert.ok(sub.includes('couple_satisfaction') && sub.includes('Low_income_D'));
  const hc = populationComparison(B.hcmst_couples, you, partner, couple).horizons[0].subgroups;
  assert.equal(hc.find((s) => s.variable === 'married').level, 'Married');
  assert.equal(hc.find((s) => s.variable === 'relationship_years_band').level, '2-4 years');
});

test('just me, candidates, what-ifs and the dashboard through the new lenses', () => {
  // Respondent-level lenses score you directly; NLSY79 first marriages averages over its spouse cells.
  for (const id of ['canada_gss_first_marriage', 'sipp_first_marriage', 'nsfg_pooled_both_sexes', 'acs_one_year_divorce']) {
    const r = justMe(B[id], you, coupleFor(id));
    assert.equal(r.available, true, `${id}: ${r.reason}`);
    assert.ok(r.selfOnly);
    assert.deepEqual(r.horizons.map((h) => h.horizon), lensHorizons(B[id]));
  }
  const nl = justMe(B.nlsy79_first_marriage, { ...you, age: 24 }, { ...couple, currentYear: 1995 });
  assert.equal(nl.available, true, nl.reason);
  assert.ok(nl.profiles > 3 && nl.coverage > 0.5);
  for (const id of ['hcmst_couples', 'gss_panel_marriages', 'newlywed_la_couples', 'nlsy97_first_marriage', 'sipp_prospective_couples']) {
    const r = justMe(B[id], you, couple);
    assert.equal(r.available, false, id);
    assert.ok(r.reason.length > 20, id);
  }
  const nsp = justMe(B.nsfg_pooled_first_marriage, you, couple);
  assert.equal(nsp.available, true, nsp.reason);
  // Candidates rank at each lens's primary horizon.
  const cands = [{ ...partner }, { ...partner, age: 36, degree: 'Master', school: '18+ years' }, { ...partner, sex: 'Woman' }];
  const g = rankPartners(B.gss_panel_marriages, you, couple, cands, { horizons: [2], keepRefused: true, current: partner });
  assert.equal(g.ranked.length, 2);
  assert.equal(g.refused.length, 1);
  const hc = rankPartners(B.hcmst_couples, you, couple, cands, { horizons: lensHorizons(B.hcmst_couples) });
  assert.equal(hc.ranked.length, 3, 'HCMST scores the same-sex candidate too');
  // What-ifs and the dashboard at the lens's own horizons.
  const w = whatIfs(B.hcmst_couples, { ...you, quality: 'Good' }, partner, { ...couple, status: 'Not married, living together' });
  assert.ok(w.items.some((x) => x.label.startsWith('Relationship quality')));
  assert.ok(w.items.some((x) => x.label === 'Marry (living together)'));
  assert.deepEqual(w.horizons, lensHorizons(B.hcmst_couples));
  for (const it of w.items) for (const h of w.horizons) assert.ok(it.at[h].lo <= it.at[h].delta + 1e-15 && it.at[h].delta <= it.at[h].hi + 1e-15);
  const d = partnerDashboard(B.gss_panel_marriages, you, partner, couple, { locks: ['b.work'] });
  assert.equal(d.rankAt, 2);
  assert.ok(d.ranking.ranked.length >= 4);
  assert.ok(d.ranking.ranked.every((x) => x.partner.work === partner.work));
  assert.ok(d.ranking.ranked[0].percentile[2]);
  assert.ok(selfChanges(B.newlywed_la_couples, 'b', you, partner, couple).length >= 1);
  assert.ok(coupleChanges(B.nlsy97_first_marriage, you, partner, couple).some((x) => x.label.startsWith('Do not live together')));
});

test('scales, conversions, skill and the link', () => {
  assert.equal(satisfactionSum(Array(8).fill(SAT_SCALE[0])), 8);
  assert.equal(satisfactionSum(Array(8).fill(SAT_SCALE[4])), 37);
  assert.equal(satisfactionSum(Array(7).fill(SAT_SCALE[4])), null, 'all 8 or nothing');
  assert.equal(hostilitySum(Array(7).fill(HOSTILE_SCALE[3]), Array(7).fill(HOSTILE_SCALE[3])), 42);
  assert.equal(hostilitySum(Array(7).fill('Never'), Array(6).fill('Never')), null);
  assert.equal(eduYears({ degree: 'PhD' }), 20);
  assert.ok(Math.abs(CPI[2000] / CPI[2024] - 0.549) < 0.001, 'the GSS bundle’s own 172.2/313.7');
  const sk = lensSkill(B.hcmst_couples);
  assert.ok(sk.c > 0.8 && sk.gain > 20, 'HCMST: C-index and log-loss gain read from its own keys');
  assert.ok(lensSkill(B.newlywed_la_couples).c > 0.5);
  // New answers round-trip through the link; sensitive ones never enter it.
  const h = encodeScenario({ 'a.quality': 'Good', 'b.hapmar': 'Pretty happy', status: 'Married, living together', state: 'OH', 'a.abuse': 'Yes', 'a.hostSum': '9', 'a.sat3': 'Trust' });
  const back = decodeScenario(h);
  assert.equal(back['a.quality'], 'Good');
  assert.equal(back.state, 'OH');
  assert.ok(!('a.abuse' in back) && !('a.hostSum' in back));
  assert.ok(!('a.sat3' in back), 'only allowed answers');
});
