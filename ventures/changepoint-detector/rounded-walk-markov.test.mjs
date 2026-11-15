// Round five of the one-tick stale-feed likelihood: Markov (clumped) carry-forward (README "One-tick
// stale feeds: clumped carry-forward"; rounded-walk.mjs `staleTestMarkov`; eval/update-rate-stale-lr-5.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { roundedWalkLogLik, roundedWalkLogLikMarkov, staleLRMarkov, staleLikelihoodRatio, STALE_LR_HEAVY } from './rounded-walk.mjs';
import { tally, threshold } from './eval/update-rate-stale-lr-5.mjs';
import { makeRng } from './eval/update-rate-sim.mjs';

const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

test('pStay = pEnter is exactly round four\'s one-probability carry-forward', () => {
  const k = [0, 0, 1, 1, 0, 2, 2, 2, 3, 2, 1, 1, 1, 0];
  for (const nu of [Infinity, 4, 2]) for (const p of [0, 0.2, 0.6]) {
    assert.ok(Math.abs(roundedWalkLogLikMarkov(k, 0.8, p, p, 10, nu) - roundedWalkLogLik(k, 0.8, p, 10, nu)) < 1e-9, `nu ${nu} p ${p}`);
  }
  // pEnter = 0: the record is never carried forward, whatever pStay is (the unidentified nuisance)
  assert.ok(Math.abs(roundedWalkLogLikMarkov(k, 0.8, 0, 0.9, 10) - roundedWalkLogLik(k, 0.8, 0, 10)) < 1e-9);
  // a repeat can only be explained by carrying when the values match; a move is never a carry
  assert.equal(roundedWalkLogLikMarkov([0, 3], 0.1, 0.5, 0.5, 10), roundedWalkLogLik([0, 3], 0.1, 0.5, 10));
});

function clumped(seed, n, stay, enter) {
  const rnd = makeRng(seed), out = [];
  let x = 0, last = 0, stayed = false;
  for (let t = 0; t < n; t++) {
    x += gauss(rnd);
    stayed = t > 0 && rnd() < (stayed ? stay : enter);
    last = stayed ? last : Math.round(x);
    out.push(last);
  }
  return out;
}

test('the Markov statistic is never below round four\'s, and it sees clumps round four does not', () => {
  const opts = { nus: [Infinity] };
  const k = clumped(17, 90, 0.85, 0.15);
  const m = staleLRMarkov(k, opts), iid = staleLikelihoodRatio(k, { ...STALE_LR_HEAVY, ...opts });
  assert.ok(Math.abs(m.lrIid - iid.lr) < 1e-9, 'lrIid is round four on the same fit');
  assert.ok(m.lr >= m.lrIid);
  assert.ok(m.pStay > m.pEnter, `pStay ${m.pStay} pEnter ${m.pEnter}`);
  assert.ok(m.lr > m.lrIid + 2, `markov ${m.lr} iid ${m.lrIid}`);
  // a plain rounded walk: little to gain from either
  const rnd = makeRng(3), w = [];
  let x = 0;
  for (let t = 0; t < 90; t++) { x += 0.4 * gauss(rnd); w.push(Math.round(x)); }
  const mw = staleLRMarkov(w, opts);
  assert.ok(mw.lr >= mw.lrIid && mw.lr < 5.41, `walk ${mw.lr}`);
});

test('the threshold rule and K5', () => {
  const row = (lr) => ({ oneTick: true, lr, lrIid: lr });
  const cell = (lrs) => lrs.map(row);
  // 100 one-tick series, 2 may clear: tau sits just above the third largest
  const th = threshold({ R1: cell([...Array(97).fill(0), 7, 9, 12]) });
  assert.equal(th.tau, 7.01);
  assert.equal(threshold({ R1: cell(Array(100).fill(1)) }).tau, 5.41, 'never below 5.41');
  const mk = (n, hit, hitIid) => Array.from({ length: n }, (_, i) => ({ oneTick: true, lr: i < hit ? 99 : 0, lrIid: i < hitIid ? 99 : 0 }));
  const base = { R1: mk(100, 0, 0), R2: mk(100, 0, 0), R3: mk(100, 0, 0), T1: mk(100, 90, 90), T2: mk(100, 90, 90), F1: [{ oneTick: false }], F2: [{ oneTick: false }], F3: [{ oneTick: false }], X1: mk(100, 1, 1), X2: mk(100, 1, 1) };
  assert.equal(tally({ ...base, T3: mk(100, 90, 80) }, 7).ships, true);
  assert.equal(tally({ ...base, T3: mk(100, 90, 88) }, 7).k5, false, 'must beat round four by 5 points');
  assert.equal(tally({ ...base, T3: mk(100, 84, 70) }, 7).k5, false, 'must reach 0.85');
});

test('round five passed as committed, so it is the default', async () => {
  const { readFileSync } = await import('node:fs');
  const { CATCHUP, updateRateLines } = await import('./update-rate.mjs');
  const { staleTestMarkov } = await import('./rounded-walk.mjs');
  const cal = readFileSync(new URL('./eval/update-rate-stale-lr-5-calibration.out.txt', import.meta.url), 'utf8');
  assert.match(cal, /calibration seed 31, 200 series a null cell/);
  assert.match(cal, /^tau = 6\.56$/m);
  const out = readFileSync(new URL('./eval/update-rate-stale-lr-5.out.txt', import.meta.url), 'utf8');
  assert.match(out, /confirmation seed 20261217, 200 series a cell; Markov carry-forward LR >= 6\.56/);
  for (const k of ['K1', 'K2', 'K3', 'K4', 'K5']) assert.match(out, new RegExp(`${k} \\(.*\\): pass`));
  assert.match(out, /T3 +64 +62 +60 +0\.968 +50 +0\.806/);
  assert.match(out, /Verdict: Markov carry-forward replaces round four/);
  assert.equal(CATCHUP.test, staleTestMarkov);
  assert.equal(CATCHUP.lr, 6.56);
  assert.equal(CATCHUP.trim, 'range');
  const u = { changes: [{ index: 3, from: 3, to: 3, shareBefore: 0.1, shareAfter: 0.6, direction: 'less often', rounding: false, catchUp: true, catchUpRatio: null, staleLR: 12.34, staleP: 0.4, staleLRIid: 3, staleEnter: 0.2, staleStay: 0.7, staleThreshold: 6.56, tick: 0.1 }] };
  const line = updateRateLines(u)[0];
  assert.match(line, /carried forward in runs \(after a fresh value the next repeats about 20% of the time, after a repeat about 70%\)/);
  assert.match(line, /likelihood ratio 12\.3, against 6\.6/);
});
