import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/{smi,cac,ftse}-returns.csv): log returns in percent of three more indices from R's EuStockMarkets,
// the same 1,859 trading days as dax-returns.csv. Rows match eval/eu-markets.out.txt and README "Four European indices".
// --bootstrap is left to the eval script (about 5 minutes for all four indices).
const load = (f) => { const r = readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')); return { labels: r.map((x) => x[0]), values: r.map((x) => +x[1]) }; };
const run = (f, o) => { const { labels, values } = load(f); return analyze({ values, labels, model: 'meanvar', ...o }).pelt.changepoints.map((c) => +c.label); };

test('smi: plain meanvar cuts seven times; --dispersion keeps only row 1489, as the DAX keeps 1482', () => {
  assert.deepEqual(run('smi-returns.csv', {}), [35, 45, 275, 334, 681, 804, 1489]);
  assert.deepEqual(run('smi-returns.csv', { dispersion: true }), [1489]);
});

test('cac: no cut near row 1482 under --dispersion or --robust (none at all), plain cuts at 1417', () => {
  assert.deepEqual(run('cac-returns.csv', {}), [32, 42, 99, 1179, 1417]);
  assert.deepEqual(run('cac-returns.csv', { dispersion: true }), []);
  assert.deepEqual(run('cac-returns.csv', { robust: true }), []);
});

test('ftse: the late rise is cut at row 1545 to 1550, 60 rows after the DAX', () => {
  assert.deepEqual(run('ftse-returns.csv', {}), [309, 344, 653, 906, 1545]);
  assert.deepEqual(run('ftse-returns.csv', { dispersion: true }), [309, 334, 1550]);
  assert.deepEqual(run('ftse-returns.csv', { robust: true }), [972, 1545]);
});
