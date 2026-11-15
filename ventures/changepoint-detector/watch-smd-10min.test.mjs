// Round 19: SMD at 10-minute buckets checked hourly against hourly buckets, on three machines
// (eval/watch-smd-10min.mjs; README "Round 19"). The data is fetched, not committed, so these tests check the design's
// constants, the windows at a finer bucket and the rule on made-up numbers, and pin the committed output when it is there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MACHINES, RUNS, ruleD19 } from './eval/watch-smd-10min.mjs';
import { machineFrom, score } from './eval/watch-smd.mjs';

test('the round: three machines named in advance, hourly checks in both runs, a one-day baseline', () => {
  assert.deepEqual(MACHINES, ['machine-1-1', 'machine-2-1', 'machine-3-1']);
  assert.deepEqual(RUNS, { H: { bucket: 60, from: 24, step: 1 }, T: { bucket: 10, from: 144, step: 6 } });
  for (const r of Object.values(RUNS)) { assert.equal(r.bucket * r.step, 60, 'one check an hour'); assert.equal(r.from * r.bucket, 24 * 60, 'one day of baseline'); }
});

test('a machine in 10-minute buckets: windows a bucket wide each side, baseline in points', () => {
  const rows = (n, f) => Array.from({ length: n }, (_, i) => [f(i), i % 3]);
  const label = Array.from({ length: 6000 }, (_, i) => (i >= 3005 && i <= 3012 ? 1 : 0));
  const m = machineFrom({ name: 'x', train: rows(6000, Math.sin), test: rows(6000, Math.cos), label, interp: [] }, 10, 144);
  assert.equal(m.n, 600);
  assert.equal(m.half, 300);
  assert.deepEqual([m.wins[0].b, m.wins[0].lo, m.wins[0].hi, m.wins[0].minutes], [300, 299, 302, 8]);
  assert.equal(m.scored, 600 - 144);
  assert.equal(m.from, 144);
  const t = score([m], () => [{ col: 0, index: 301, at: 303 }, { col: 1, index: 100, at: 101 }]);
  assert.equal(t.segs, 1);
  assert.equal(t.caught, 1);
  assert.equal(t.shortCaught, 1);
  assert.equal(t.medianDelay, 3);
  const early = machineFrom({ name: 'y', train: rows(6000, Math.sin), test: rows(6000, Math.cos), label: label.map((_, i) => (i >= 1000 && i <= 1005 ? 1 : 0)), interp: [] }, 10, 144);
  assert.equal(score([early], () => []).segs, 0, 'a segment starting inside the baseline is not scored');
});

test('D19 and D19\' on made-up totals', () => {
  const q = (caught) => ({ caught });
  let r = ruleD19(q(22), q(12), q(22), q(21));
  assert.equal(r.d19, true, '21 >= 22 - 1');
  assert.equal(r.d19p, true);
  r = ruleD19(q(22), q(12), q(22), q(20));
  assert.equal(r.d19, false);
  assert.equal(r.d19p, true, '91% - 55% = 36 points');
  r = ruleD19(q(20), q(10), q(20), q(13));
  assert.equal(r.d19p, false, '65% - 50% = 15 points');
  r = ruleD19(q(20), q(10), q(20), q(14));
  assert.equal(r.d19p, true, 'exactly 20 points passes');
});

const OUT = new URL('./eval/watch-smd-10min.out.txt', import.meta.url);
test('the committed output, when present', { skip: !existsSync(OUT) }, () => {
  const t = readFileSync(OUT, 'utf8');
  assert.match(t, /^D19 /m);
  for (const arm of ['R', 'S', 'K']) assert.match(t, new RegExp(`^  ${arm}: kept \\d+% under H, \\d+% under T; D19 (MET|NOT MET)`, 'm'));
});
