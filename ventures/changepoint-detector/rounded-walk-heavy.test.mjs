// Round four of the one-tick stale-feed likelihood (README "One-tick stale feeds: a heavy-tailed walk";
// rounded-walk.mjs `staleTestHeavy`, update-rate.mjs `trim: 'range'`; eval/update-rate-stale-lr-4.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roundedWalkLogLik, staleLikelihoodRatio, lgamma, STALE_LR, STALE_LR_HEAVY, staleTestHeavy } from './rounded-walk.mjs';
import { updateRateChanges, updateRateLines, CATCHUP } from './update-rate.mjs';
import { makeRng } from './eval/update-rate-sim.mjs';

const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
const t3 = (rnd) => { let c = 0; for (let i = 0; i < 3; i++) c += gauss(rnd) ** 2; return gauss(rnd) / Math.sqrt(c / 3); };

test('log-gamma matches known values', () => {
  assert.ok(Math.abs(lgamma(5) - Math.log(24)) < 1e-12);
  assert.ok(Math.abs(lgamma(0.5) - 0.5 * Math.log(Math.PI)) < 1e-12);
  assert.ok(Math.abs(lgamma(2.5) - Math.log(1.329340388179137)) < 1e-12);
});

test('t steps: a large nu gives the Gaussian likelihood; Infinity is exactly round three', () => {
  const k = [0, 0, 1, 1, 0, 2, 2, 2, 3, 2, 1, 1, 1, 0];
  const g = roundedWalkLogLik(k, 0.8, 0.2, 10);
  assert.equal(roundedWalkLogLik(k, 0.8, 0.2, 10, Infinity), g);
  assert.ok(Math.abs(roundedWalkLogLik(k, 0.8, 0.2, 10, 1e6) - g) < 1e-4);
  // a five-tick jump is far likelier under t2 than under a Gaussian of the same scale
  const j = [0, 0, 0, 5, 5, 5];
  assert.ok(roundedWalkLogLik(j, 0.8, 0, 10, 2) > roundedWalkLogLik(j, 0.8, 0, 10) + 5);
});

test('heavy test: a rounded t3 walk is not called stale; the same walk carried forward is', () => {
  const rnd = makeRng(91);
  const walk = [], stale = [];
  let x = 0, last = 0;
  for (let t = 0; t < 150; t++) {
    x += 0.35 * t3(rnd);
    walk.push(Math.round(x));
    last = t > 0 && rnd() < 0.6 ? last : Math.round(x);
    stale.push(last);
  }
  const a = staleLikelihoodRatio(walk, STALE_LR_HEAVY), b = staleLikelihoodRatio(stale, STALE_LR_HEAVY);
  assert.ok(a.lr < STALE_LR.threshold, `walk lr ${a.lr}`);
  assert.ok(b.lr > STALE_LR.threshold, `stale lr ${b.lr}`);
  assert.ok(b.l1 >= b.l0 && a.l1 >= a.l0);
  assert.ok(STALE_LR_HEAVY.nus.includes(Infinity));
});

test('trim: the likelihood sees the sticky stretch only inside its cut range', () => {
  const rnd = makeRng(12);
  const x = [50]; let lv = 50;
  for (let t = 1; t < 300; t++) { lv += t < 150 ? 0.06 * gauss(rnd) : gauss(rnd); x.push(Math.round(lv * 10) / 10); }
  const seen = [];
  const spy = (values, from, to) => { seen.push([from, to]); return { lr: 0, p: 0 }; };
  const plain = updateRateChanges(x, { catchUp: { method: 'lr', test: spy } });
  const cut = updateRateChanges(x, { catchUp: { method: 'lr', test: spy, trim: 'range' } });
  assert.equal(plain.changes.length, cut.changes.length);
  const c = cut.changes[0];
  assert.equal(seen[0][1], plain.stretches[0].to);
  assert.equal(seen[1][1], c.from - 1, 'ends before the earliest date of the cut');
  assert.ok(seen[1][1] <= seen[0][1]);
});

test('round four passed as committed (round five has since replaced it as the default)', () => {
  const out = readFileSync(new URL('./eval/update-rate-stale-lr-4.out.txt', import.meta.url), 'utf8');
  assert.match(out, /seed 20261216, 200 series a cell/);
  for (const k of ['K1', 'K2', 'K3', 'K4']) assert.match(out, new RegExp(`${k} \\(.*\\): pass`));
  assert.match(out, /Verdict: the heavy-tailed, trimmed likelihood check ships/);
  assert.equal(CATCHUP.method, 'lr');
  assert.equal(CATCHUP.trim, 'range');
});

test('the sentence names the likelihood when the call came from it', () => {
  const u = { changes: [{ index: 3, from: 3, to: 3, shareBefore: 0.1, shareAfter: 0.6, direction: 'less often', rounding: false, catchUp: true, catchUpRatio: null, staleLR: 12.34, staleP: 0.55, tick: 0.1 }] };
  const line = updateRateLines(u)[0];
  assert.match(line, /carried forward on about 55% of steps/);
  assert.match(line, /likelihood ratio 12\.3, against 5\.4 at the 1% level/);
  assert.match(line, /read as staleness, not rounding/);
  assert.match(line, /Trade prints resting at a bid or ask one tick wide/);
});
