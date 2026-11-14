// Round 12: the watch on SKAB's fault runs, every sensor at once (eval/watch-skab.mjs; README "Round 12"). The data is
// GPL and not committed, so these tests check the round's helpers on made-up rows and pin the committed output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSkab, buckets, runFrom, score, rules, hint3, hintNN, COLUMNS, FILES, BUCKET, FROM, WIN } from './eval/watch-skab.mjs';

const head = `datetime;${COLUMNS.join(';')};anomaly;changepoint`;
const row = (i, v, a = 0, c = 0) => `2020-03-09 10:00:${String(i % 60).padStart(2, '0')};${COLUMNS.map(() => v).join(';')};${a}.0;${c}.0`;

test('the round watches 8 sensors on 33 fault runs, in 5-second buckets from point 20, with a 60 s window after a mark', () => {
  assert.equal(COLUMNS.length, 8);
  assert.equal(FILES.length, 33);
  assert.equal(BUCKET, 5);
  assert.equal(FROM, 20);
  assert.deepEqual(WIN, [1, 12]);
});

test('a SKAB file parses with CRLF and semicolons, and refuses a bad value', () => {
  const text = [head, row(0, 1), row(1, 2, 1, 1)].join('\r\n') + '\r\n';
  const p = parseSkab(text);
  assert.equal(p.rows, 2);
  assert.deepEqual(p.cols[3], [1, 2]);
  assert.deepEqual(p.anomaly, [0, 1]);
  assert.deepEqual(p.cp, [0, 1]);
  assert.throws(() => parseSkab([head, row(0, 'x')].join('\n')), /bad value/);
});

test('buckets average consecutive groups and drop a partial last group', () => {
  assert.deepEqual(buckets([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 5), [3, 8]);
});

test('marks land in their row\'s bucket, deduplicated, and the fault start is the first anomalous row', () => {
  const rows = [];
  for (let i = 0; i < 300; i++) rows.push(row(i, i < 150 ? 0 : 5, i >= 150 && i < 250 ? 1 : 0, i === 150 || i === 152 || i === 250 ? 1 : 0));
  const r = runFrom(parseSkab([head, ...rows].join('\n')), 'made-up');
  assert.equal(r.n, 60);
  assert.deepEqual(r.marks, [30, 50]);
  assert.equal(r.start, 30);
  assert.deepEqual(r.wins.map((w) => [w.lo, w.hi, w.start]), [[29, 42, true], [49, 62, false]]);
  assert.equal(r.scored, 40);
});

test('score: alert lines over all columns, share at a mark, marks reached, faults caught and the delay in seconds', () => {
  const run = { name: 'x', n: 100, scored: 80, wins: [{ b: 40, lo: 39, hi: 52, start: true }, { b: 70, lo: 69, hi: 82, start: false }] };
  const alerts = { 0: [{ index: 41, at: 46 }, { index: 90, at: 95 }], 3: [{ index: 40, at: 44 }] };
  const t = score([run], (_, c) => alerts[c] ?? [], COLUMNS.map(() => 'quiet'));
  assert.equal(t.alerts, 3);
  assert.equal(t.atMark, 2);
  assert.equal(t.reached, 1);
  assert.equal(t.marks, 2);
  assert.equal(t.caught, 1);
  assert.equal(t.medianDelay, 20);
  assert.equal(t.per1000, 37.5);
});

test('the hint rules on made-up null rates', () => {
  const r = (quiet, middle, drift, eager) => ({ quiet, middle, drift, eager });
  assert.equal(hint3(r(0.5, 1.5, 0.1, 3)), 'middle');
  assert.equal(hint3(r(3, 4, 0.1, 9)), 'quiet');
  assert.equal(hintNN(r(3, 4, 1, 9)), 'drift');
  assert.equal(hintNN(r(0.5, 1.5, 0.1, 3)), 'middle');
});

test('the rules on made-up totals: ties in (a) of T6 fail, T7 needs 2 points of share, T8 a null rate of at most 2', () => {
  const t = (reached, share, per1000) => ({ reached, share, per1000 });
  let x = rules({ quiet: t(50, 20, 30), middle: t(55, 18, 50), drift: t(40, 22, 20), hint3: t(50, 19, 40) }, 2);
  assert.deepEqual([x.T6, x.T7, x.T8], [false, true, true]);
  x = rules({ quiet: t(50, 20, 30), middle: t(55, 18, 50), drift: t(40, 21.9, 20), hint3: t(51, 15, 40) }, 2.01);
  assert.deepEqual([x.T6, x.T7, x.T8], [true, false, false]);
});

test('round 12 as run: all three rules fail, and the hint and --columns texts say so', async () => {
  const out = readFileSync(new URL('./eval/watch-skab.out.txt', import.meta.url), 'utf8');
  assert.match(out, /33 fault runs and 1 anomaly-free run, 8 sensors each/);
  assert.match(out, /T6 hint3 vs quiet: \(a\) 118 vs 97 PASS; \(b\) 163\.4 vs middle 182\.7 PASS; \(c\) 28\.4% vs 36\.8% - 5 FAIL\. NOT CONFIRMED\./);
  assert.match(out, /T7 drift vs quiet: \(a\) 25\.8% vs 36\.8% \+ 2 FAIL; \(b\) 175\.1 vs 69\.4 FAIL\. FAILS\./);
  assert.match(out, /T8 quiet on all 8 columns of the normal run: 8\.54 lines per 100 checks vs 2 FAIL\. FAILS\./);
  const { eagernessReplay, eagernessText } = await import('./watch-core.mjs');
  const v = Array.from({ length: 120 }, (_, i) => Math.sin(i / 3) + (i > 80 ? 4 : 0));
  assert.match(eagernessText(eagernessReplay(v)), /Nor on a third: .*118 of 123 marked changes against the default's 97, but only 28\.4%/);
  assert.match(readFileSync(new URL('./watch.mjs', import.meta.url), 'utf8'), /Quiet on all 8 columns sent 8\.5 alert lines per 100 checks/);
  assert.match(readFileSync(new URL('./watch-a-metric-for-changes.html', import.meta.url), 'utf8'), /all eight columns sent 8\.5 alert lines per 100 checks/);
});
