// The clumping-law check on real call-centre counts (fpp2 calls, eval/calls-law-preregistration.md, README
// "The clumping-law check on real call-centre arrivals"): it abstains on every day and never gives a wrong warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clumpingLaw, nb1Dispersion, analyze } from './engine.mjs';
import { loadCalls, referenceFit, referenceLaw } from './eval/calls-law.mjs';

const days = loadCalls();

test('fpp2 calls: 164 weekdays of 169 five-minute counts, across-day reference reads NB1 (pre-registered rule)', () => {
  assert.equal(days.length, 164);
  assert.ok(days.every((d) => d.counts.length === 169 && d.weekday >= 1 && d.weekday <= 5));
  const ref = referenceLaw(days, referenceFit(days), { boot: 50 });
  assert.equal(ref.law, 'nb1');
  assert.ok(Math.abs(ref.ratio - 0.83) < 0.01, `top/bottom ${ref.ratio}`);
});

test('fpp2 calls: the law check says "either" on all 164 days, so no wrong clumpingWarning', () => {
  const laws = days.map((d) => clumpingLaw(d.counts).law);
  assert.equal(laws.filter((l) => l === 'either').length, 164);
  const phis = days.map((d) => nb1Dispersion(d.counts));
  assert.ok(phis.filter((p) => p === 1).length >= 160, 'within a day the counts read Poisson');
  const wk = analyze({ values: days.slice(0, 5).flatMap((d) => d.counts), model: 'poisson', period: 169, overdispersion: 'nb1' });
  assert.equal(wk.clumping.fits, 'either');
  assert.equal(wk.clumpingWarning, undefined);
});
