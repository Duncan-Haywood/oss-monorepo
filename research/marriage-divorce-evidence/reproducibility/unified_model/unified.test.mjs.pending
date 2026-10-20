// Parity: app/unified.js must reproduce reproducibility/unified_model/score.py for the pooled
// multi-survey bundle on synthetic profiles (random values, never real rows), to 1e-9.
// Also checks the bundle's structure: populations, inputs with the surveys that measured
// them, the outcome layer, the standard population reference and the OOD block.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { scoreUnified, designRow, unifiedCoverage } from '../unified.js';
import { oodScore } from '../engine.js';
import { referenceFor } from '../population.js';

const dir = new URL('../models/', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('unified_multisurvey.json', dir)));
const vectors = JSON.parse(readFileSync(new URL('unified_multisurvey_testvectors.json', dir)));

test('unified scorer matches Python on every synthetic case', () => {
  assert.ok(vectors.cases.length >= 10);
  for (const [i, c] of vectors.cases.entries()) {
    const got = scoreUnified(bundle, c.profile, c.opts);
    assert.equal(got.draws, c.expected.draws);
    assert.equal(got.missing_columns, c.expected.missing_columns, `case ${i}: missing columns`);
    got.risk.forEach((r, h) => {
      for (const k of ['mean', 'lo', 'hi']) {
        const e = c.expected.risk[h][k];
        assert.ok(Math.abs(r[k] - e) <= 1e-9 * Math.max(1, Math.abs(e)), `case ${i} horizon ${h} ${k}: js ${r[k]} vs python ${e}`);
      }
      assert.ok(r.lo <= r.mean + 1e-12 && r.mean <= r.hi + 1e-12, `case ${i}: interval brackets the mean`);
      assert.ok(r.mean >= 0 && r.mean <= 1);
    });
  }
});

test('bundle structure', () => {
  assert.equal(bundle.kind, 'pooled_hazard');
  assert.ok(bundle.posterior.draws.length >= 200);
  const k = bundle.posterior.draws[0].length;
  assert.equal(bundle.posterior.layout.delta[1], k);
  assert.equal(bundle.design.columns.length, bundle.design.mean.length);
  assert.equal(bundle.conditional.cov.length, bundle.design.columns.length);
  for (const inp of bundle.inputs) {
    assert.ok(Array.isArray(inp.measured_in), inp.name);
    if (inp.kind !== 'num') assert.ok(inp.levels.length >= 2, inp.name);
  }
  // Every fitted population has an outcome definition; the layer has one log ratio per band.
  for (const p of Object.values(bundle.populations)) assert.ok(p.outcome);
  assert.equal(bundle.outcome_layer.legal_divorce.log_ratio.length, bundle.bands.length - 1);
  // Legal divorce is never more likely than any separation or divorce for the same profile.
  const prof = { age_at_marriage: 24, wedding_year: 2005, female: 1 };
  const any = scoreUnified(bundle, prof, { population: 'nsfg', outcome: 'separation_or_divorce' });
  const legal = scoreUnified(bundle, prof, { population: 'nsfg', outcome: 'legal_divorce' });
  any.risk.forEach((r, i) => assert.ok(legal.risk[i].mean <= r.mean + 1e-12));
  // Risk grows with the horizon; a later start conditions on survival so far.
  const r = scoreUnified(bundle, prof, { population: 'nsfg', horizons: [1, 5, 10, 20] }).risk.map((x) => x.mean);
  for (let i = 1; i < r.length; i++) assert.ok(r[i] > r[i - 1]);
  // Blank inputs are integrated over: more blanks, more missing design columns.
  assert.ok(designRow(bundle, {}).every((v, i) => v === null || bundle.design.columns[i].startsWith('union_type')));
  const cov = unifiedCoverage(bundle, prof);
  assert.equal(cov.find((c) => c.name === 'age_at_marriage').given, true);
});

test('population reference and OOD block are in the shapes the app reads', () => {
  const ref = referenceFor(bundle);
  assert.ok(ref && ref.shape === 'standard' && ref.horizons.length === 3);
  const o = oodScore(bundle.ood, { age_at_marriage: 24, educ: 3, race: 'White', union_type: 'Married' });
  assert.ok(o.percentile >= 0 && o.percentile <= 100);
});
