import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/global-temp-annual.csv): global temperature anomaly, annual, 1880-2024 (145 values). Counts match eval/global-temp.out.txt.
const rows = readFileSync(new URL('./data/global-temp-annual.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, ...o }).pelt.changepoints.map((c) => c.label);

test('global-temp: eval output is current', () => {
  const out = execFileSync('node', [new URL('./eval/global-temp.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/global-temp.out.txt', import.meta.url), 'utf8'));
});

test('global-temp: 145 years; every non-AR(1) model cuts at 1946 (the 1945 sea-surface measurement change), the AR(1) model does not', () => {
  assert.equal(values.length, 145);
  for (const o of [{}, { model: 'trend' }, { trend: 'bend' }]) assert.ok(labs(o).includes('1946'), JSON.stringify(o));
  assert.deepEqual(labs({ ar1: 'auto' }), ['1930', '1987', '2014']);
});

test('global-temp: trend bend dates one slope change at 1913 with a range of nearly a century; 1976 is not found', () => {
  const t = analyze({ values, labels, trend: 'bends' }).trend;
  assert.deepEqual(t.slopeChangeRange95.map((s) => s.at), ['1913']);
});
