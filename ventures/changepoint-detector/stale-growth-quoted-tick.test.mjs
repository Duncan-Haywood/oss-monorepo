// README "The catch-up test gated on the quoted tick, on twelve exchange pairs" and "The shipped one-tick stale
// test on real one-tick feeds": the Binance reader, the bars, the window picker and the committed verdicts of
// eval/stale-growth-quoted-tick.mjs and eval/stale-one-tick-binance.mjs (the trade files are fetched by
// eval/binance-fetch.mjs, not committed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBinancePrints, bars as qBars, JUDGED } from './eval/stale-growth-quoted-tick.mjs';
import { pick, bars as tBars } from './eval/stale-one-tick-binance.mjs';

const out = (f) => readFileSync(new URL(`./eval/${f}`, import.meta.url), 'utf8');

test('readBinancePrints: one print per timestamp at its last price; microsecond and millisecond times; a header is skipped', () => {
  const us = 'id,price,qty,quote_qty,time,is_buyer_maker,is_best_match\n1,100.5,1,1,1762041600000000,true,true\n2,100.6,1,1,1762041600000000,true,true\n3,100.4,1,1,1762041600500000,false,true\n';
  assert.deepEqual(readBinancePrints(us), [{ t: 1762041600, p: 100.6 }, { t: 1762041600.5, p: 100.4 }]);
  assert.deepEqual(readBinancePrints('1,2.5,1,1,1700000000250,true,true'), [{ t: 1700000000.25, p: 2.5 }]);
});

test('quoted-tick bars: judged at 2,000 moves; fewer than 10 stretches is unscorable', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ kind: 'D=1', M: JUDGED, carried: 0.5, stale: i < 8 }, { kind: 'prints', M: JUDGED, carried: 0, stale: i < 1 });
  const b = qBars(rows);
  assert.ok(b.Q1.pass && b.Q2.pass && b.Q3.pass);
  assert.ok(!qBars([]).Q1.pass && !qBars([]).Q2.pass);
});

test('the committed quoted-tick run: all twelve pairs move one quoted tick, so Q1 and Q2 are unscorable', () => {
  const o = out('stale-growth-quoted-tick.out.txt');
  assert.equal((o.match(/ {2}1 {2}one-tick$/gm) || []).length, 12);
  assert.ok(!/multi-tick$/m.test(o.split('## Stretches')[0]));
  assert.match(o, /Q1 power at M = 2000: 0 of 0 .*: fail/);
  assert.match(o, /Q2 size at M = 2000: 0 of 0 .*: fail/);
  assert.match(o, /one-tick {2}2000 {2}7 of 234 {2}31 of 368/);
});

test('pick: evenly spaced windows, all of them when there are few', () => {
  assert.deepEqual(pick(3, 20), [0, 1, 2]);
  assert.deepEqual(pick(100, 4), [0, 25, 50, 75]);
});

test('one-tick bars score only windows the gate passes', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ gate: true, kind: 'D=1', carried: 0.5, stale: true, fitted: 0.5 }, { gate: true, kind: 'prints', carried: 0, stale: false, fitted: null }, { gate: false, kind: 'prints', carried: 0, stale: true });
  const b = tBars(rows);
  assert.ok(b.T1.pass && b.T2.pass && b.T3.pass);
  assert.equal(b.T2.n, 10);
});

test('the committed one-tick run: T1 128 of 164, T2 16 of 68 and T3 93 of 143 all fail', () => {
  const o = out('stale-one-tick-binance.out.txt');
  assert.match(o, /T1 power, carried >= 0\.30: 128 of 164 .*: fail/);
  assert.match(o, /T2 size, trade prints: 16 of 68 .*: fail/);
  assert.match(o, /T3 estimate within 0\.10: 93 of 143 .*: fail/);
  assert.match(o, /windows the gate refuses: 61 of 360/);
});

test('T2 failed, so the shipped catch-up sentence says trade prints at a one-tick quote can look the same', () => {
  const src = readFileSync(new URL('./update-rate.mjs', import.meta.url), 'utf8');
  assert.match(src, /so those repeats read as staleness, not rounding\. Trade prints resting at a bid or ask one tick wide can show the same pattern with nothing carried \(on real exchange trades, 16 of 68/);
});
