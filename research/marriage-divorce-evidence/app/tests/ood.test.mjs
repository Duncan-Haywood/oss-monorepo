// Out-of-distribution score: JS matches Python's Mahalanobis distances, percentiles are
// monotone, and unusual profiles score higher than typical ones.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { oodScore } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('nsfg2002_family.json', dir)));
const vectors = JSON.parse(readFileSync(new URL('nsfg2002_family_testvectors.json', dir)));
const spec = bundle.ood;
vectors.rows.forEach((row, i) => {
  const { d2 } = oodScore(spec, row);
  const want = vectors.ood_d2[i];
  assert.ok(Math.abs(d2 - want) <= 1e-9 * Math.max(1, Math.abs(want)), `row ${i}: js ${d2} vs python ${want}`);
});

const base = { wife_age_at_marriage: 24, husband_age_at_marriage: 26, wedding_year: 1995, cohabited_first: 'No', husband_married_before: 'No', husband_prior_children: 'No', wife_race_ethnicity: 'White', same_race_ethnicity: 'Same', wife_intact_family: 'No' };
const typical = oodScore(spec, base);
const gap = oodScore(spec, { ...base, wife_age_at_marriage: 17, husband_age_at_marriage: 45 });
const extreme = oodScore(spec, { ...base, wife_age_at_marriage: 15, husband_age_at_marriage: 70 });
assert.ok(typical.percentile < 50 && !typical.abstain, `typical profile percentile ${typical.percentile}`);
assert.ok(gap.d2 > typical.d2 && gap.percentile > 95);
assert.ok(extreme.abstain && extreme.percentile > spec.abstain_above_percentile);
assert.deepEqual(oodScore(spec, { ...base, wife_race_ethnicity: 'Martian' }).unseen, ['wife_race_ethnicity']);
// The percentile table is monotone and ends at 100.
const q = spec.heldout_quantiles;
for (let k = 1; k < q.d2.length; k++) assert.ok(q.d2[k] >= q.d2[k - 1] && q.p[k] > q.p[k - 1]);
console.log(`ood ok: ${vectors.rows.length} distances match; typical ${typical.percentile.toFixed(1)}th, 17/45 ${gap.percentile.toFixed(1)}th, 15/70 ${extreme.percentile.toFixed(1)}th (abstains)`);
