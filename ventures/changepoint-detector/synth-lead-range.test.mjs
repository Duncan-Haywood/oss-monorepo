// An uncertain lead (synthLeadRange, README "An uncertain lead", eval/synth-lead-range-prereg-2026-11-18.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthControlTest, synthLeadRange } from './synth-control.mjs';
import { CELLS, anticipPanel } from './eval/synth-anticip-sim.mjs';
import { scorePanel } from './eval/synth-lead-range-sim.mjs';

const { rows } = anticipPanel(CELLS.E2, 4242);
const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
const k = CELLS.E2.k;

test('one lead: every range p is that date\'s placebo p', () => {
  const r = synthLeadRange(rows[0], donors, k, [2]);
  const single = synthControlTest(rows[0], donors, k - 2);
  for (const p of [r.pMaxScaled, r.pMean, r.pRange, r.naiveMinP, r.maxP, r.leads[0].p]) assert.ok(Math.abs(p - single.p) < 1e-12);
  assert.equal(r.leads[0].rank, single.rank);
});

test('two leads: each lead\'s p is the single-date p; naive <= range p\'s order holds; the gap is read from the named date', () => {
  const r = synthLeadRange(rows[0], donors, k, [2, 0, 2]);
  assert.deepEqual(r.leads.map((e) => e.lead), [0, 2]);
  for (const e of r.leads) {
    const s = synthControlTest(rows[0], donors, k - e.lead);
    assert.ok(Math.abs(e.p - s.p) < 1e-12);
    const tail = s.gap.slice(k);
    assert.ok(Math.abs(e.gapFromDate - tail.reduce((a, b) => a + b, 0) / tail.length) < 1e-12);
  }
  assert.ok(r.naiveMinP <= r.maxP);
  assert.ok(r.naiveMinP <= r.pRange + 1e-12);
  for (const p of [r.pMaxScaled, r.pMean, r.pRange]) assert.ok(p >= r.minP - 1e-12 && p <= 1);
  assert.equal(r.leads.find((e) => e.lead === r.bestLead).p, r.naiveMinP);
});

test('donor names and order do not change the range p (the statistics are symmetric in the units)', () => {
  const a = synthLeadRange(rows[0], donors, k, [0, 1]);
  const shuffled = Object.fromEntries(Object.entries(donors).reverse().map(([, d], j) => [`x${j}`, d]));
  const b = synthLeadRange(rows[0], shuffled, k, [0, 1]);
  for (const key of ['pMaxScaled', 'pMean', 'pRange', 'naiveMinP']) assert.ok(Math.abs(a[key] - b[key]) < 1e-9, key);
});

test('bad leads are refused', () => {
  assert.throws(() => synthLeadRange(rows[0], donors, k, []), /whole numbers/);
  assert.throws(() => synthLeadRange(rows[0], donors, k, [0, -1]), /whole numbers/);
  assert.throws(() => synthLeadRange(rows[0], donors, k, [1.5]), /whole numbers/);
});

test('the simulation scores a panel with every rule', { timeout: 60000 }, () => {
  const s = scorePanel(CELLS.E4, 7);
  for (const key of ['p0', 'pOracle', 'naive', 'pRange', 'pMean', 'pMaxScaled', 'pBonf', 'maxP']) assert.ok(s[key] > 0 && s[key] <= 1, key);
  assert.ok(s.naive <= s.p0 && s.naive <= s.pOracle);
  assert.ok(Math.abs(s.pBonf - Math.min(1, 5 * s.naive)) < 1e-12);
});
