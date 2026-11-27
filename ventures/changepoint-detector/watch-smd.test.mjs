// Round 18: the label-free floors on a fresh labelled multi-sensor set, SMD's 28 servers (eval/watch-smd.mjs; README
// "Round 18"). The data is fetched, not committed, so these tests check the parsing, the windows, the floors' reading
// and the rule on made-up data, and pin the committed output when it is there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buckets, segments, parseInterpretation, varying, machineFrom, score, ruleT14, floorsFor, BUCKET, FROM, ARMS } from './eval/watch-smd.mjs';

test('the round: hourly buckets, a one-day baseline, four arms', () => {
  assert.equal(BUCKET, 60);
  assert.equal(FROM, 24);
  assert.deepEqual(ARMS, ['Q', 'R', 'S', 'K']);
  assert.deepEqual(buckets([1, 1, 3, 3, 9], 2), [1, 3], 'a last partial group is dropped');
});

test('segments and the interpretation labels', () => {
  assert.deepEqual(segments([0, 1, 1, 0, 0, 1, 0, 1]), [[1, 2], [5, 5], [7, 7]]);
  assert.deepEqual(segments([1, 0]), [[0, 0]]);
  assert.deepEqual(parseInterpretation('15849-16368:1,9,10\n24679-24682:9\n'), [{ s: 15849, e: 16368, dims: [0, 8, 9] }, { s: 24679, e: 24682, dims: [8] }]);
});

test('a machine in hourly buckets: watched columns, half point, segment windows', () => {
  const rows = (n, f) => Array.from({ length: n }, (_, i) => [0.5, f(i), i % 7 === 0 ? 1 : 0]);
  const train = rows(60 * 100, (i) => Math.sin(i / 50));
  const test = rows(60 * 80, (i) => Math.cos(i / 50));
  const label = Array.from({ length: 60 * 80 }, (_, i) => (i >= 60 * 30 + 10 && i <= 60 * 30 + 12 ? 1 : 0));
  const m = machineFrom({ name: 'x', train, test, label, interp: [{ s: 60 * 30 + 10, e: 60 * 30 + 12, dims: [1] }] });
  assert.deepEqual(m.cols, [1, 2], 'the constant first column is not watched');
  assert.equal(m.half, 50);
  assert.equal(m.nTrain, 100);
  assert.equal(m.n, 80);
  assert.equal(m.wins.length, 1);
  assert.deepEqual([m.wins[0].b, m.wins[0].lo, m.wins[0].hi, m.wins[0].minutes], [30, 29, 31, 3]);
  assert.equal(m.covered, 3);
  assert.equal(m.scored, 80 - FROM);
  assert.deepEqual(varying([[1, 2], [1, 3]], 2), [1]);
});

test('score: at a mark, caught, short segments, delay, and the named metric', () => {
  const m = { cols: [4, 9], scored: 100, wins: [{ b: 30, lo: 29, hi: 31, minutes: 3, dims: [9] }, { b: 50, lo: 49, hi: 53, minutes: 200, dims: [4] }, { b: 10, lo: 9, hi: 11, minutes: 5, dims: [] }] };
  const lines = [{ col: 1, index: 30, at: 33 }, { col: 0, index: 29, at: 32 }, { col: 0, index: 70, at: 75 }, { col: 1, index: 10, at: 25 }];
  const t = score([m], () => lines);
  assert.equal(t.alerts, 4);
  assert.equal(t.atMark, 3, 'the line at index 10 is inside the baseline segment\'s window, which still counts for "at a mark"');
  assert.equal(t.segs, 2, 'a segment starting before the baseline ends is not scored');
  assert.equal(t.caught, 1);
  assert.equal(t.short, 1);
  assert.equal(t.shortCaught, 1);
  assert.deepEqual(t.delays, [2], 'the earliest line sent decides the delay');
  assert.equal(t.named, 0, 'the first line came from metric 4, which the label does not name for that segment');
  assert.equal(t.per1000, 40);
});

test('T14 on made-up totals', () => {
  const q = { caught: 100, share: 20 };
  assert.equal(ruleT14(q, { caught: 94, share: 20 }, 2).pass, true, 'ties and the 6% allowance pass');
  assert.deepEqual(ruleT14(q, { caught: 93, share: 25 }, 1).parts, [true, false, true]);
  assert.deepEqual(ruleT14(q, { caught: 99, share: 19.9 }, 2.01).parts, [false, true, false]);
});

test('floorsFor: L from the setup checks, R and K from all lines, S splits a loud column off', () => {
  const lines = [
    Array.from({ length: 20 }, (_, i) => ({ spread: 10 + i, move: 1 })),
    [{ spread: 1, move: 3 }, { spread: 2, move: 5 }],
    [{ spread: null, move: null }],
  ];
  const f = floorsFor(lines, 200);
  assert.equal(f.L, 4);
  assert.ok(f.kR > 25 && f.kR < 27, `R lets 3 known lines clear (one unknown is always kept): ${f.kR}`);
  assert.equal(f.kK, 1, 'K: midway between the 3rd and 4th largest move ratios (5, 3, 1, 1), the midpoint rule of round 14');
  assert.equal(f.loud[0], 0, 'the first column sends most of the lines that clear the common k, so it is split off first');
  assert.equal(f.Q.every((x) => x === null), true);
  assert.equal(f.R[1].minSpreadRatio, f.kR);
  assert.equal(f.K[2].minMoveRatio, f.kK);
  assert.ok(f.S[0].minSpreadRatio > f.S[1].minSpreadRatio, 'the loud column gets the higher k');
});

const OUT = new URL('./eval/watch-smd.out.txt', import.meta.url);
test('the committed output, when present: four arms scored and T14 judged for R, S and K', { skip: !existsSync(OUT) }, () => {
  const txt = readFileSync(OUT, 'utf8');
  assert.match(txt, /Round 18: label-free floors on SMD, 28 servers/);
  for (const a of ['R', 'S', 'K']) assert.match(txt, new RegExp(`T14 ${a} vs Q: .*FAILS\\.`));
  assert.match(txt, /Q  Quiet, no floor .* 290\/309 .* 75\.79/);
  assert.match(txt, /K  rolling move floor, k read \(round 17\) .* 42\/309 .* 1\.24/);
  const help = readFileSync(new URL('./watch.mjs', import.meta.url), 'utf8');
  assert.match(help, /README "Round 18"/);
  assert.match(readFileSync(new URL('./llms.txt', import.meta.url), 'utf8'), /README "Round 18"/);
});
