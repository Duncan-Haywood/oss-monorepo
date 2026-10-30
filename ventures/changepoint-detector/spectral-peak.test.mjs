import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { check, fisherG } from './eval/spectral-peak.mjs';
import { cell } from './eval/spectral-null.mjs';

const load = (f) => {
  const rows = readFileSync(new URL(`./data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[1]) };
};

test('fisherG finds a pure sine at its period', () => {
  const r = fisherG(Array.from({ length: 120 }, (_, i) => Math.sin(2 * Math.PI * i / 12)));
  assert.ok(r.p < 1e-6);
  assert.equal(Math.round(r.period), 12);
});

test('residuals of the default steps: sunspots peak at about 11 years, a quiet series does not', () => {
  const s = check(load('sunspot-year'));
  assert.ok(s.p < 1e-4 && Math.abs(s.period - 11) < 0.5);
  assert.ok(check(load('lh')).p > 0.1);
});

test('calibration: near 1% on no cycle, a sine of amplitude 1 found with or without steps', () => {
  assert.ok(cell(100, 0, 0, 60) <= 0.1);
  assert.ok(cell(100, 1, 1, 60) >= 0.85);
});

test('analyze: cycleWarning fires on sunspots, not on a quiet series, and is off with a period', async () => {
  const { analyze } = await import('./engine.mjs');
  assert.match(analyze(load('sunspot-year')).cycleWarning ?? '', /periodic component/);
  assert.equal(analyze(load('lh')).cycleWarning, undefined);
  const m = load('us-accidental-deaths');
  assert.equal(analyze({ ...m, period: 12 }).cycleWarning, undefined);
});
