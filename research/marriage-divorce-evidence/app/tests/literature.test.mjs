// Literature-based adjustment layer: deterministic (seeded) checks of the arithmetic,
// the refusals and the provenance rules.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { adjust, FACTORS, LENS_MODELS, modeledFactors, questionsFor, unusable, rng, logHrPrior } from '../literature.js';

const evidence = JSON.parse(readFileSync(new URL('../data/literature_evidence.json', import.meta.url)));
const byId = Object.fromEntries(evidence.records.map((r) => [r.id, r]));

// A smooth base curve: constant annual hazard 2% for 40 years.
const cumulative = Array.from({ length: 40 }, (_, i) => 1 - Math.pow(0.98, i + 1));
const base = { cumulative };
const LENS = 'sipp_prospective_couples'; // models none of the literature factors

const withRecord = (id, patch) => ({ records: evidence.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

test('the exported evidence only carries verified, primary records as usable', () => {
  for (const r of evidence.records) {
    if (r.usable_in_app) {
      assert.equal(r.verified, true, r.id);
      assert.equal(r.provenance, 'primary', r.id);
      assert.ok(r.quote && r.quote.length > 10, r.id);
      assert.ok(r.citation && r.url, r.id);
    }
  }
  // every factor that names a record finds it in the export
  for (const [k, f] of Object.entries(FACTORS)) {
    for (const id of f.record ? [f.record] : Object.values(f.records || {})) assert.ok(byId[id], `${k} -> ${id}`);
  }
});

test('no answers: adjusted curve equals the base curve exactly', () => {
  const out = adjust({ base, lens: LENS, answers: {}, seed: 7 }, evidence);
  for (const h of [5, 10, 20]) {
    assert.equal(out.horizons[h].base, cumulative[h - 1]);
    assert.deepEqual(out.horizons[h].adjusted, { median: cumulative[h - 1], lo: cumulative[h - 1], hi: cumulative[h - 1] });
  }
  assert.equal(out.applied.length, 0);
  assert.match(out.label, /Literature-based/);
});

test('answers at the reference level do not move the curve', () => {
  const out = adjust({ base, lens: LENS, answers: { depression: 'no', alcohol_problem: 'no', prior_cohabitations_other_partners: 0, parental_divorce_wife: 'yes' } }, evidence);
  assert.equal(out.applied.length, 0);
  assert.equal(out.horizons[10].adjusted.median, cumulative[9]);
  assert.equal(out.skipped.length, 4);
});

test('a single known HR shifts the curve as S^HR (median at the published HR)', () => {
  const rec = byId.Breslau2011_alcoholabuse_M2; // OR 1.6 (95% CI 1.4-1.9), mutually adjusted model
  const out = adjust({ base, lens: LENS, answers: { alcohol_problem: 'yes' }, draws: 20000, seed: 11 }, evidence);
  for (const h of [5, 10, 20]) {
    const expected = 1 - Math.pow(1 - cumulative[h - 1], rec.estimate);
    assert.ok(Math.abs(out.horizons[h].adjusted.median - expected) < 0.004, `h=${h}: ${out.horizons[h].adjusted.median} vs ${expected}`);
    assert.ok(out.horizons[h].adjusted.lo < expected && expected < out.horizons[h].adjusted.hi);
  }
  const a = out.applied[0];
  assert.equal(a.record, 'Breslau2011_alcoholabuse_M2');
  assert.equal(a.provenance, 'primary');
  assert.ok(a.quote.includes('Alcohol abuse w / without dependence | 1.7 | 1.5, 1.9 | 1.6 | 1.4, 1.9'));
  assert.ok(Math.abs(a.applied_hr.median - 1.6) < 0.02);
  // without transport noise the 95% interval of the HR is the published CI, up to the
  // rounding of the printed values (1.6, 1.4-1.9 is not exactly symmetric on the log scale)
  const tight = adjust({ base, lens: LENS, answers: { alcohol_problem: 'yes' }, draws: 40000, seed: 3, transportSd: 0 }, evidence);
  assert.ok(Math.abs(tight.applied[0].applied_hr.lo - 1.4) < 0.04, String(tight.applied[0].applied_hr.lo));
  assert.ok(Math.abs(tight.applied[0].applied_hr.hi - 1.9) < 0.06, String(tight.applied[0].applied_hr.hi));
});

test('a factor with a reciprocal HR raises risk (not intact = 1 / HR for intact)', () => {
  const out = adjust({ base, lens: LENS, answers: { parental_divorce_husband: 'no' }, draws: 20000, seed: 5, transportSd: 0 }, evidence);
  const hr = 1 / byId.Manning2012_intactfamily_M.estimate; // 1 / 0.69
  assert.ok(Math.abs(out.applied[0].applied_hr.median - hr) < 0.02);
  assert.ok(out.horizons[10].adjusted.median > cumulative[9]);
});

test('intervals widen when the published effect is more uncertain', () => {
  const narrow = adjust({ base, lens: LENS, answers: { depression: 'yes' }, seed: 2, transportSd: 0 }, evidence);
  const wideDoc = withRecord('Breslau2011_depression_M2', { ci_low: 1.0, ci_high: 2.56 }); // same centre, wider CI
  const wide = adjust({ base, lens: LENS, answers: { depression: 'yes' }, seed: 2, transportSd: 0 }, wideDoc);
  const w = (o) => o.horizons[10].adjusted.hi - o.horizons[10].adjusted.lo;
  assert.ok(w(wide) > 1.5 * w(narrow), `${w(wide)} vs ${w(narrow)}`);
  // and the transport SD widens them too
  const withTransport = adjust({ base, lens: LENS, answers: { depression: 'yes' }, seed: 2 }, evidence);
  assert.ok(w(withTransport) > w(narrow));
});

test('no printed CI: the prior uses the widest SE consistent with p < .05, and says so', () => {
  const rec = byId.Birditt2010_destructive_wife;
  const p = logHrPrior(rec);
  assert.ok(Math.abs(p.sd - Math.log(1.51) / 1.959964) < 1e-9);
  assert.match(p.ciSource, /conservatively wide prior/);
  const out = adjust({ base, lens: LENS, answers: { destructive_conflict_wife: 3.1 }, seed: 4 }, evidence);
  assert.equal(out.applied.length, 1);
  // one point above the study mean (2.1) -> median HR about 1.51
  assert.ok(Math.abs(out.applied[0].applied_hr.median - 1.51) < 0.05, String(out.applied[0].applied_hr.median));
  assert.ok(out.applied[0].applied_hr.lo < 1.0, 'wide prior should reach below 1 once transport noise is added');
});

test('factors the lens already models are refused, and the curve is unchanged', () => {
  const out = adjust({ base, lens: 'newlywed_la_couples', answers: { destructive_conflict_wife: 4, alcohol_problem: 'yes', depression: 'yes' } }, evidence);
  assert.equal(out.applied.length, 0);
  assert.equal(out.refused.length, 3);
  for (const r of out.refused) assert.match(r.reason, /already models/);
  assert.equal(out.horizons[10].adjusted.median, cumulative[9]);
  // NSFG 2002 models the wife's family of origin but not the husband's
  const nsfg = adjust({ base, lens: 'nsfg2002_first_marriage', answers: { parental_divorce_wife: 'no', parental_divorce_husband: 'no' } }, evidence);
  assert.deepEqual(nsfg.refused.map((r) => r.factor), ['parental_divorce_wife']);
  assert.deepEqual(nsfg.applied.map((r) => r.factor), ['parental_divorce_husband']);
  // NLSY79 models religious attendance
  const nlsy = adjust({ base, lens: 'nlsy79_couples', answers: { nonreligious_spouse: 'yes' } }, evidence);
  assert.equal(nlsy.applied.length, 0);
  // a bundle not in the table is read from its columns
  const m = modeledFactors({ id: 'someday', models: [{ numeric: ['H_Hostility', 'wife_religion'], categorical: [] }] });
  assert.ok(m.factors.has('destructive_conflict_husband') && m.factors.has('nonreligious_spouse'));
  // an unknown lens with no columns gets no adjustment at all
  const unknown = adjust({ base, lens: 'mystery', answers: { depression: 'yes' } }, evidence);
  assert.equal(unknown.applied.length, 0);
  assert.match(unknown.refused[0].reason, /Unknown lens/);
  assert.ok(questionsFor('newlywed_la_couples').find((q) => q.key === 'depression').available === false);
});

test('unverified, non-primary or withheld records are never applied', () => {
  for (const [patch, re] of [[{ verified: false }, /not verified/], [{ provenance: 'abstract' }, /abstract/], [{ provenance: 'secondhand' }, /secondhand/], [{ usable_in_app: false }, /usable_in_app/]]) {
    const doc = withRecord('Breslau2011_depression_M2', patch);
    const out = adjust({ base, lens: LENS, answers: { depression: 'yes' } }, doc);
    assert.equal(out.applied.length, 0);
    assert.match(out.refused[0].reason, re);
    assert.equal(out.horizons[10].adjusted.median, cumulative[9]);
  }
  // the husband's destructive-conflict HR is withheld (time-varying effect in the paper)
  const out = adjust({ base, lens: LENS, answers: { destructive_conflict_husband: 4 } }, evidence);
  assert.equal(out.applied.length, 0);
  assert.match(out.refused[0].reason, /Non-proportional/);
  // religiosity match has no verified primary estimate
  const rel = adjust({ base, lens: LENS, answers: { religiosity_match: 'yes' } }, evidence);
  assert.match(rel.refused[0].reason, /No verified primary hazard ratio/);
  assert.ok(unusable(null));
});

test('stacked adjustments are shrunk for overlap', () => {
  const one = adjust({ base, lens: LENS, answers: { depression: 'yes' }, seed: 9, transportSd: 0 }, evidence);
  const two = adjust({ base, lens: LENS, answers: { depression: 'yes', alcohol_problem: 'yes' }, seed: 9, transportSd: 0 }, evidence);
  const dep2 = two.applied.find((a) => a.factor === 'depression').applied_hr.median;
  assert.ok(dep2 < one.applied[0].applied_hr.median, `${dep2} should be below ${one.applied[0].applied_hr.median}`);
  assert.ok(two.shrinkage.factor_median > 0.66 && two.shrinkage.factor_median < 0.91);
  assert.equal(one.shrinkage.factor_median, 1);
  // stacking still raises risk overall, but by less than the product of the published HRs
  const naive = 1 - Math.pow(1 - cumulative[9], 1.6 * 1.6);
  assert.ok(two.horizons[10].adjusted.median > one.horizons[10].adjusted.median);
  assert.ok(two.horizons[10].adjusted.median < naive);
});

test('prior cohabitations with other partners use the Model 4 record for 1 and for 2+', () => {
  const one = adjust({ base, lens: LENS, answers: { prior_cohabitations_other_partners: 1 }, transportSd: 0 }, evidence);
  const two = adjust({ base, lens: LENS, answers: { prior_cohabitations_other_partners: 3 }, transportSd: 0 }, evidence);
  assert.equal(one.applied[0].record, 'Rosenfeld2019_other_cohab1_M4');
  assert.equal(two.applied[0].record, 'Rosenfeld2019_other_cohab2plus_M4');
  assert.ok(two.horizons[10].adjusted.median > one.horizons[10].adjusted.median);
});

test('neuroticism: r converted to log odds per SD under an explicit prevalence assumption', () => {
  const out = adjust({ base, lens: LENS, answers: { neuroticism_wife: 1 }, draws: 20000, seed: 8, transportSd: 0 }, evidence);
  const hr = out.applied[0].applied_hr.median;
  // r = .17 with p in [.15, .5] gives d between .35 and .48
  assert.ok(hr > Math.exp(0.33) && hr < Math.exp(0.5), String(hr));
  assert.match(out.applied[0].uncertainty, /assumption/);
  const neg = adjust({ base, lens: LENS, answers: { neuroticism_wife: -1 }, seed: 8 }, evidence);
  assert.ok(neg.horizons[10].adjusted.median < cumulative[9]);
});

test('deterministic for a seed; base curve formats agree; bad input is rejected', () => {
  const a = adjust({ base, lens: LENS, answers: { depression: 'yes', destructive_conflict_wife: 3 }, seed: 42 }, evidence);
  const b = adjust({ base, lens: LENS, answers: { depression: 'yes', destructive_conflict_wife: 3 }, seed: 42 }, evidence);
  assert.deepEqual(a, b);
  const c = adjust({ base: { survival: cumulative.map((p) => 1 - p) }, lens: LENS, answers: { depression: 'yes', destructive_conflict_wife: 3 }, seed: 42 }, evidence);
  const d = adjust({ base: { hazards: cumulative.map(() => 0.02) }, lens: LENS, answers: { depression: 'yes', destructive_conflict_wife: 3 }, seed: 42 }, evidence);
  for (const h of [5, 10, 20]) {
    assert.ok(Math.abs(c.horizons[h].adjusted.median - a.horizons[h].adjusted.median) < 1e-12);
    assert.ok(Math.abs(d.horizons[h].adjusted.median - a.horizons[h].adjusted.median) < 1e-12);
  }
  const short = adjust({ base: { cumulative: cumulative.slice(0, 8) }, lens: LENS, answers: {} }, evidence);
  assert.equal(short.horizons[10].adjusted, null);
  assert.throws(() => adjust({ base: { cumulative: [0.1, 0.05] }, lens: LENS }, evidence), /decrease/);
  assert.throws(() => adjust({ base: {}, lens: LENS }, evidence), /base must/);
  const u = rng(1); const v = rng(1);
  assert.equal(u.normal(), v.normal());
  assert.ok(Object.keys(LENS_MODELS).length >= 5);
});
