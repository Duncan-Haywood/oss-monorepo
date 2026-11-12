// When a series starts updating less often (update-rate.mjs; README "When a series starts updating
// less often"). The simulations take minutes, so this pins their committed output and recomputes a
// small cell, the frozen-juice description (its data ships here) and the drift CLI's wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repeatIndicators, bernoulliCost, partitionRates, cutRanges, updateRateChanges, updateRateLines, UPDATE_RATE } from './update-rate.mjs';
import { makeRng, chain } from './eval/update-rate-sim.mjs';
import { driftResult, driftText } from './drift-cli.mjs';
import { driftNotes } from './drift-view.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('repeat indicators: exact repeats only; a missing value never repeats', () => {
  assert.deepEqual(repeatIndicators([1, 1, 2, 2, 2, NaN, NaN, 3]), [1, 0, 1, 1, 0, 0, 0]);
  assert.ok(bernoulliCost(0, 10) === 0);
  assert.ok(Math.abs(bernoulliCost(5, 10) - -2 * 10 * Math.log(0.5)) < 1e-12);
});

// Exhaustive optimal partitioning with no pruning, to check PELT's pruning never changes the answer.
function brute(z, o) {
  const P = { R: [0], T: [[0], [0], [0], [0]] };
  const { segmentCost } = o;
  const n = z.length, beta = o.mult * 2 * Math.log(n + 1), F = [-beta], last = [0];
  for (let t = 1; t <= n; t++) {
    F[t] = Infinity;
    for (let s = 0; s <= t - o.minSegment; s++) {
      if (s > 0 && s < o.minSegment) continue;
      const v = F[s] + segmentCost(z.slice(s, t)) + beta;
      if (v < F[t]) { F[t] = v; last[t] = s; }
    }
  }
  const cuts = [];
  for (let t = n; t > 0; t = last[t]) if (last[t] > 0) cuts.push(last[t]);
  void P;
  return cuts.reverse();
}
const markovSeg = (z) => {
  const c = [0, 0, 0, 0];
  for (let s = 1; s < z.length; s++) c[2 * z[s - 1] + z[s]]++;
  const x = (k, m) => (k > 0 && k < m ? k * Math.log(k / m) : 0);
  return -2 * (x(c[0], c[0] + c[1]) + x(c[1], c[0] + c[1]) + x(c[2], c[2] + c[3]) + x(c[3], c[2] + c[3]));
};
const bernSeg = (z) => bernoulliCost(z.reduce((a, v) => a + v, 0), z.length);

test('PELT pruning gives the exhaustive optimum (both costs, changed and unchanged chains)', () => {
  const rnd = makeRng(4242);
  for (let r = 0; r < 12; r++) {
    const z = r % 2 ? chain(rnd, 140, [0.7, 0.2], [0.05, 0.05], 70) : chain(rnd, 140, [0.3, 0.3]);
    for (const [kind, segmentCost] of [['bernoulli', bernSeg], ['markov', markovSeg]]) {
      const o = { kind, mult: 1, minSegment: 20 };
      assert.deepEqual(partitionRates(z, o).cuts, brute(z, { ...o, segmentCost }), `${kind} rep ${r}`);
    }
  }
});

test('the shipped setting is the one the two committed rounds chose', () => {
  const sim = read('./eval/update-rate-sim.out.txt'), rng = read('./eval/update-rate-range.out.txt');
  assert.match(sim, /Chosen: markov m2, minimum stretch 20/);
  assert.match(sim, /R2 S1 found >= 180 \(179\): FAIL/);
  assert.match(sim, /R3 S4 found >= 150 \(121\): FAIL/);
  assert.match(rng, /Chosen slack: 9\.00/);
  assert.match(rng, /R2 S1 covered >= 170 \(200\): pass/);
  assert.match(rng, /R3 S4 covered >= 150 \(181\): pass/);
  assert.match(rng, /Verdict: SHIP the description with its range/);
  assert.deepEqual(UPDATE_RATE, { kind: 'markov', mult: 2, minSegment: 20, minRepeats: 10, slack: 9 });
});

test('a stale feed that was fixed: dated, and the range holds the switch (20 series, round two found 181 of 200)', () => {
  const rnd = makeRng(99);
  let covered = 0;
  for (let r = 0; r < 20; r++) {
    const z = chain(rnd, 299, [0.7, 0.2], [0.05, 0.05], 149);
    const values = [0];
    for (const k of z) values.push(k ? values[values.length - 1] : values[values.length - 1] + 1);
    const u = updateRateChanges(values);
    assert.ok(u.changes.length <= 1);
    if (!u.changes.length) continue;
    const c = u.changes[0];
    assert.equal(c.direction, 'more often');
    const [rg] = cutRanges(z, [c.index - 1], UPDATE_RATE);
    assert.deepEqual(rg.map((k) => k + 1), [c.from, c.to]);
    if (c.from <= 150 && 150 <= c.to) covered++;
  }
  assert.ok(covered >= 15, `covered ${covered} of 20`);
});

test('continuous data and few repeats: nothing to say', () => {
  const rnd = makeRng(5);
  const x = Array.from({ length: 300 }, () => rnd());
  assert.deepEqual(updateRateChanges(x).changes, []);
  assert.deepEqual(updateRateLines(updateRateChanges(x)), []);
  const few = x.slice(); for (let t = 10; t < 100; t += 10) few[t] = few[t - 1];
  assert.equal(updateRateChanges(few).repeats, 9);
  assert.deepEqual(updateRateChanges(few).changes, []);
});

const juiceCsv = read('./data/frozen-juice.csv');

test('frozen orange juice: repeats fall from 60% to 12% around 1981-08 (eval/update-rate-real.out.txt)', () => {
  const r = driftResult({ csv: juiceCsv, column: 'price', labelColumn: 'month' });
  const u = r.updateRate;
  assert.equal(u.repeats, 253);
  assert.equal(u.changes.length, 1);
  const c = u.changes[0];
  assert.deepEqual([r.labels[c.index], r.labels[c.from], r.labels[c.to], c.direction], ['1981-08', '1980-09', '1982-04', 'more often']);
  assert.deepEqual(u.stretches.map((s) => Math.round(100 * s.share)), [60, 12]);
  assert.match(read('./eval/update-rate-real.out.txt'), /frozen juice .* 1 change\(s\): 1981-08 \[1980-09\.\.1982-04\] more often/);
  assert.match(read('./eval/update-rate-real.out.txt'), /TCPD: 38 series, run on 6 \(10\+ repeats\), a change of update rate on 3\./);
});

test('the CLI text and the page notes carry the update-rate line', () => {
  const r = driftResult({ csv: juiceCsv, column: 'price', labelColumn: 'month' });
  const line = 'Update-rate check: the share of steps that repeat the previous value exactly changed once: from about 1981-08 (between 1980-09 and 1982-04) it began updating more often (repeats 60% of steps before, 12% after).';
  assert.ok(driftText(r).includes(line));
  assert.ok(driftNotes(r).some((t) => t.startsWith(line)));
});
