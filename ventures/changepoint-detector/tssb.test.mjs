// The shipped settings on TSSB, 75 long labelled series from outside TCPD (eval/tssb.mjs; README
// "Long series from outside TCPD"). The data is fetched, not committed, so these tests check the
// parsing, the settings on a made-up series, the metric on TSSB's single-annotator form, and pin
// the committed output's pre-registered verdicts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseDesc, clean, detect, SETTINGS, PIN, PUBLISHED_MEANS } from './eval/tssb.mjs';
import { covering } from './eval/tcpd-metrics.mjs';

test('desc.txt rows: name, window size, change points; a series with none parses to []', () => {
  assert.deepEqual(parseDesc('Adiac,10,572,1012,1232\nChinatown,8\n'), [
    { name: 'Adiac', window: 10, cps: [572, 1012, 1232] },
    { name: 'Chinatown', window: 8, cps: [] },
  ]);
  assert.deepEqual(clean([0, 5, 5, 3, 99, 98], 100), [3, 5, 98]);
});

test('the round is pinned and the published means are the TSSB README figures', () => {
  assert.equal(PIN.length, 40);
  assert.equal(PUBLISHED_MEANS.ClaSP, 0.8547);
  assert.equal(PUBLISHED_MEANS.PELT, 0.581);
  assert.equal(SETTINGS.length, 8);
});

test('one annotator covering: cutting nothing on a two-segment series scores the larger share', () => {
  // TSSB scores covering({0: cps}, found, n); with no cuts the one segment covers each true one by its overlap.
  assert.ok(Math.abs(covering({ 0: [60] }, [], 100) - (60 * 0.6 + 40 * 0.4) / 100) < 1e-12);
  assert.equal(covering({ 0: [60] }, [60], 100), 1);
});

test('every setting runs on a level step and reports it near the true index', async () => {
  let s = 7; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5);
  const values = Array.from({ length: 300 }, (_, i) => (i < 150 ? 0 : 4) + r());
  const out = await detect(values);
  assert.deepEqual(Object.keys(out.cps).sort(), [...SETTINGS].sort());
  assert.deepEqual(out.cps.zero, []);
  for (const k of ['level (default)', 'consensus: every setting']) assert.ok(out.cps[k].some((c) => Math.abs(c - 150) <= 2), k);
});

test('the committed output carries the four pre-registered verdicts', () => {
  const f = new URL('./eval/tssb.out.txt', import.meta.url);
  if (!existsSync(f)) return;
  const t = readFileSync(f, 'utf8');
  assert.match(t, /^TSSB at e0c7a1f6/);
  for (const k of ['T1', 'T2', 'T3', 'T4']) assert.match(t, new RegExp(`  ${k} .*: (MET|NOT MET)$`, 'm'));
  assert.match(t, /75 series, 359497 points/);
});
