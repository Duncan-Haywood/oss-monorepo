// README "The catch-up test by stretch length, on five fresh stocks": the stretch cutting, the LOBSTER
// reader, the bars, and the committed verdicts of eval/stale-growth-lobster.mjs (LOBSTER's sample files are
// fetched by eval/lobster-fetch.mjs, not committed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catchUpGrowth } from './update-rate.mjs';
import { stretchesByMoves, readPrints, bars, JUDGED } from './eval/stale-growth-lobster.mjs';

test('stretchesByMoves: each stretch holds exactly M moves as catchUpGrowth counts them', () => {
  const v = [1, 1, 2, 2, 3, 4, 4, 4, 5, 6, 6, 7, 8];
  const st = stretchesByMoves(v, 2);
  assert.deepEqual(st, [[0, 5], [5, 11]]);
  for (const [from, to] of st) assert.equal(catchUpGrowth(v, from, to, 1, { minMoves: 0, minRunMoves: 0 }).n, 2);
  // float noise is a repeat, not a move
  assert.deepEqual(stretchesByMoves([39.8025, 39.802499999999995, 39.81, 39.82], 1), [[0, 3]]);
});

test('readPrints: executions only (types 4 and 5), one print per timestamp at its last price, in dollars', () => {
  const text = '1.0,4,1,10,2000000,1\n1.0,4,2,10,2000100,1\n2.0,1,3,10,2000000,1\n3.5,5,0,5,2000200,-1\n4.0,3,9,10,2000000,1\n';
  assert.deepEqual(readPrints(text), [{ t: 1, p: 200.01 }, { t: 3.5, p: 200.02 }]);
});

test('bars: L1 needs 10 judged stretches and 80%; L2 and L3 hold size to 10%', () => {
  const row = (kind, M, carried, stale) => ({ kind, M, carried, stale });
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(row('D=1', JUDGED, 0.5, i < 8), row('prints', JUDGED, 0, i < 1));
  let b = bars(rows);
  assert.ok(b.L1.pass && b.L2.pass && b.L3.pass);
  rows[0].stale = false; // 7 of 10
  b = bars(rows);
  assert.ok(!b.L1.pass);
  assert.ok(!bars(rows.slice(0, 8)).L1.pass, 'fewer than 10 stretches is unscorable');
});

test('the committed run: L1 fails (29 of 38), L2 and L3 pass; nothing ships', () => {
  const out = readFileSync(new URL('./eval/stale-growth-lobster.out.txt', import.meta.url), 'utf8');
  assert.match(out, /INTC {2}10370 {2}0\.005 {2}1 {2}one-tick/);
  assert.match(out, /MSFT {2}10184 {2}0\.005 {2}2 {2}multi-tick/);
  assert.match(out, /L1 power at M = 1000: 29 of 38 .*: fail/);
  assert.match(out, /L2 size at M = 1000: 2 of 25 .*: pass/);
  assert.match(out, /L3 size at every length: M=300 7 of 90, M=600 3 of 45, M=1000 2 of 25, M=2000 1 of 12 .*: pass/);
  const read = readFileSync(new URL('./eval/stale-growth-lobster-read.out.txt', import.meta.url), 'utf8');
  assert.match(read, /AAPL .* 16 of 19 {2}0 of 15 {2}8 of 8 {2}0 of 7/);
  assert.match(read, /MSFT .* 1 of 5 {2}2 of 2 {2}0 of 1 {2}1 of 1/);
});

test('updateRateChanges still does not call the growth test', () => {
  const src = readFileSync(new URL('./update-rate.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function updateRateChanges'));
  assert.ok(!/catchUpGrowth\(/.test(body.slice(0, body.indexOf('\nexport function', 10))));
});
