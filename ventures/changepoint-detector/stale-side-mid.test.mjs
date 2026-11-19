// README "The trade side: the shipped one-tick stale test on side-adjusted prices": the sided Binance reader,
// the half-tick transform, the bars and the committed verdicts of eval/stale-side-mid-binance.mjs (the trade
// files are fetched by its --fetch mode, not committed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSidedPrints, sideAdjusted, sameSideRepeatShare, bars, jobsFor, DAY } from './eval/stale-side-mid-binance.mjs';

const out = () => readFileSync(new URL('./eval/stale-side-mid-binance.out.txt', import.meta.url), 'utf8');

test('readSidedPrints: one print per timestamp at its last trade, with that trade\'s side; a header is skipped', () => {
  const csv = 'id,price,qty,quote_qty,time,is_buyer_maker,is_best_match\n1,10.00,1,1,1762646400000000,True,True\n2,10.01,1,1,1762646400100000,False,True\n3,10.02,1,1,1762646400100000,False,True\n4,10.00,1,1,1762646400200000,true,True\r\n';
  assert.deepEqual(readSidedPrints(csv), [{ t: 1762646400, p: 10, bm: true }, { t: 1762646400.1, p: 10.02, bm: false }, { t: 1762646400.2, p: 10, bm: true }]);
});

test('sideAdjusted: a sell at the bid and a buy at the ask of a one-tick book land on the same value', () => {
  const tick = 0.01;
  assert.ok(Math.abs(sideAdjusted(10.0, true, tick) - sideAdjusted(10.01, false, tick)) < 1e-12);
  assert.ok(Math.abs(sideAdjusted(10.0, true, tick) - 10.005) < 1e-12);
});

test('sameSideRepeatShare counts only price repeats', () => {
  const p = [{ p: 1, bm: true }, { p: 1, bm: true }, { p: 1, bm: false }, { p: 2, bm: false }];
  assert.equal(sameSideRepeatShare(p), 0.5);
  assert.equal(sameSideRepeatShare([{ p: 1, bm: true }, { p: 2, bm: true }]), null);
});

test('jobsFor: both arms, prints and three grids; the side arm moves only when the book does', () => {
  const prints = [];
  // A one-tick book at 10.00 / 10.01 that bounces for 700 prints, a second apart.
  for (let i = 0; i < 700; i++) prints.push({ t: i, p: i % 2 ? 10.01 : 10.0, bm: i % 2 === 0 });
  const jobs = jobsFor('X', prints, 0.01, 2);
  assert.deepEqual([...new Set(jobs.map((j) => `${j.arm} ${j.kind}`))], ['side prints', 'side D=0.5', 'side D=1', 'side D=2', 'raw prints', 'raw D=0.5', 'raw D=1', 'raw D=2']);
  const side = jobs.find((j) => j.arm === 'side' && j.kind === 'prints');
  assert.ok(side.v.every((x) => Math.abs(x - 10.005) < 1e-12));
  const raw = jobs.find((j) => j.arm === 'raw' && j.kind === 'prints');
  assert.equal(new Set(raw.v).size, 2);
});

test('bars score the side arm\'s gated windows; fewer than 10 is unscorable', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ arm: 'side', gate: true, kind: 'prints', carried: 0, stale: i < 1 }, { arm: 'side', gate: true, kind: 'D=1', carried: 0.5, stale: true, fitted: 0.45 }, { arm: 'raw', gate: true, kind: 'prints', carried: 0, stale: true });
  const b = bars(rows);
  assert.ok(b.S1.pass && b.S2.pass && b.S3.pass);
  assert.ok(!bars(rows, 'raw').S1.pass);
  assert.ok(!bars([]).S1.pass);
});

test('the committed run is on the pre-registered day', () => {
  assert.equal(DAY, '2026-11-09');
  assert.match(out(), new RegExp(`Binance spot ${DAY} \\(pre-registered\\)`));
});
