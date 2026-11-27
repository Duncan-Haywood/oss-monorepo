// Round 14: a smallest-move floor per column (minShift in watch-core.mjs, `watch.mjs --min-shift`,
// eval/watch-skab-floor.mjs; README "Round 14"). SKAB is GPL and not committed, so these tests check the floor and the
// round's helpers on made-up data and pin the committed output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aboveFloor, replayWatch } from './watch-core.mjs';
import { main, parseMinShift } from './watch.mjs';
import { allowedLines, floorFor, preFault, ruleT10 } from './eval/watch-skab-floor.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const gauss = (u) => () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const series = (n, steps, seed = 5) => { const g = gauss(lcg(seed)); return Array.from({ length: n }, (_, i) => steps.reduce((t, [at, h]) => t + (i >= at ? h : 0), 0) + g()); };

test('aboveFloor drops moves under the floor in either direction, keeps those without a level, and checks its argument', () => {
  const c = [{ index: 1, shift: 0.4 }, { index: 2, shift: -3 }, { index: 3, shift: 1 }, { index: 4 }];
  assert.deepEqual(aboveFloor(c, 1).map((x) => x.index), [2, 3, 4]);
  assert.equal(aboveFloor(c, 0), c);
  assert.equal(aboveFloor(c, undefined), c);
  assert.throws(() => aboveFloor(c, -1), /above 0/);
  assert.throws(() => aboveFloor(c, NaN), /above 0/);
});

test('a replay with a floor keeps a large step and drops a small one; with no floor both are sent', () => {
  const v = series(400, [[150, 2.5], [300, 8]]);
  const plain = replayWatch(v, null, { from: 60 }).alerts.map((a) => a.index);
  const floored = replayWatch(v, null, { from: 60, minShift: 5 }).alerts.map((a) => a.index);
  assert.ok(plain.some((i) => Math.abs(i - 150) <= 5) && plain.some((i) => Math.abs(i - 300) <= 5), JSON.stringify(plain));
  assert.ok(!floored.some((i) => Math.abs(i - 150) <= 5) && floored.some((i) => Math.abs(i - 300) <= 5), JSON.stringify(floored));
});

test('--min-shift: a number, or column=number pairs; the mistakes it refuses', () => {
  assert.deepEqual(parseMinShift('0.5'), { all: 0.5 });
  assert.deepEqual([...parseMinShift('Temperature=0.5, flow=2').byColumn], [['temperature', 0.5], ['flow', 2]]);
  assert.throws(() => parseMinShift('0'), /above 0/);
  assert.throws(() => parseMinShift('a=1,a=2'), /twice/);
  assert.throws(() => parseMinShift('=1'), /column=number/);
  assert.throws(() => parseMinShift('--json'), /takes a number/);
});

test('CLI --columns --min-shift column=x: the floored column stays quiet on a small step, the other alerts', async () => {
  const d = mkdtempSync(join(tmpdir(), 'floor-'));
  const a = series(200, [[170, 3]], 7), b = series(200, [[170, 3]], 8);
  const csv = (n) => 'date,a,b\n' + Array.from({ length: n }, (_, i) => `${i + 1},${a[i].toFixed(3)},${b[i].toFixed(3)}`).join('\n') + '\n';
  const f = join(d, 's.csv'), st = join(d, 'state.json');
  writeFileSync(f, csv(150));
  await main([f, '--columns', 'a,b', '--min-shift', 'b=10', '--state', st], { out: () => {} });
  writeFileSync(f, csv(199));
  await main([f, '--columns', 'a,b', '--min-shift', 'b=10', '--state', st], { out: () => {} });
  writeFileSync(f, csv(200));
  let text = '';
  await main([f, '--columns', 'a,b', '--min-shift', 'b=10', '--state', st], { out: (s) => { text += s; } });
  assert.match(text, /New changes in 1 of 2 columns: a\./);
  assert.ok(existsSync(st) && JSON.parse(readFileSync(st, 'utf8')).columns.b);
  await assert.rejects(main([f, '--columns', 'a,b', '--min-shift', 'c=1', '--dry-run'], { out: () => {} }), /not one of the watched columns/);
  await assert.rejects(main([f, '--column', 'a', '--min-shift', 'a=1', '--dry-run'], { out: () => {} }), /for --columns/);
});

test('the round\'s floor rule: m lines per column, the floor midway between the m-th and (m+1)-th largest size', () => {
  assert.equal(allowedLines(1861, 8), 4);
  assert.equal(floorFor([0.1, -0.5, 0.3, 0.9, 0.2, 0.7], 4), 0.25);
  assert.equal(floorFor([0.1, 0.2], 4), 0);
  assert.ok(floorFor([1, 2], 0) > 2);
});

test('pre-fault lines: sent before the fault window opens; runs whose window opens by point 20 add nothing', () => {
  const run = { wins: [{ b: 114, lo: 113, hi: 126, start: true }, { b: 160, lo: 159, hi: 172, start: false }] };
  assert.deepEqual(preFault(run, [{ index: 50, at: 56 }, { index: 110, at: 116 }, { index: 160, at: 166 }]), { lines: 1, checks: 93 });
  assert.deepEqual(preFault({ wins: [{ b: 20, lo: 19, hi: 32, start: true }] }, [{ index: 5, at: 10 }]), { lines: 0, checks: 0 });
});

test('T10 on made-up totals: pre-fault at most 2 per 100, faults at least Q minus 2, share at least Q\'s', () => {
  const t = (caught, share) => ({ caught, share });
  assert.equal(ruleT10(t(33, 36.8), t(31, 36.8), 2).pass, true);
  assert.equal(ruleT10(t(33, 36.8), t(30, 50), 1).pass, false);
  assert.equal(ruleT10(t(33, 36.8), t(33, 50), 2.01).pass, false);
  assert.equal(ruleT10(t(33, 36.8), t(33, 36.7), 1).pass, false);
});

test('round 14 as run: T10 fails on the pre-fault rate and on faults caught, and the help and the page say so', () => {
  const out = readFileSync(new URL('./eval/watch-skab-floor.out.txt', import.meta.url), 'utf8');
  assert.match(out, /T10 F vs Q: \(a\) pre-fault 2\.27 per 100 checks vs 2 FAIL; \(b\) 28 vs 33 - 2 FAIL; \(c\) 46\.5% vs 36\.8% PASS\. FAILS\./);
  assert.match(out, /Q {2}Quiet, no floor\s+457\s+168 \(36\.8%\)/);
  assert.match(readFileSync(new URL('./watch.mjs', import.meta.url), 'utf8'), /the automatic version is not offered/);
});
