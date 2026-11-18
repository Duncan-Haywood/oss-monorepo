import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/co2-mauna-loa.csv): Mauna Loa monthly CO2, 1958-03 to 2026-09 (823 values). Counts match eval/co2-mauna-loa.out.txt.
const rows = readFileSync(new URL('./data/co2-mauna-loa.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (o) => analyze({ values, labels, ...o });

test('co2: eval output is current', () => {
  const out = execFileSync('node', [new URL('./eval/co2-mauna-loa.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/co2-mauna-loa.out.txt', import.meta.url), 'utf8'));
});

test('co2: a smooth acceleration is over-cut into steps by every model (no step exists)', () => {
  assert.equal(values.length, 823);
  assert.ok(run({}).pelt.changepoints.length > 100);
  assert.ok(run({ model: 'trend', period: 12 }).pelt.changepoints.length >= 20);
  assert.ok(run({ period: 12, trend: 'bends' }).pelt.changepoints.length >= 20);
});

test('co2: slope-change dates move with the AR(1) setting; none is stable across settings', () => {
  const at = (o) => run(o).trend.slopeChangeRange95.map((s) => s.at);
  assert.equal(at({ period: 12, trend: 'bends' })[1], '1978-05');
  assert.equal(at({ period: 12, trend: 'bends', ar1: 'auto' })[0], '1972-07');
});
