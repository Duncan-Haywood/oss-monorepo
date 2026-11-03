import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// eval/real-bootstrap-sweep.mjs: plain meanvar vs --bootstrap on real series, counts only (no labels).
const load = (f) => {
  const rows = readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[r.length - 1]) };
};
const k = (f, opt) => analyze({ ...load(f), model: 'meanvar', ...opt }).pelt.changepoints.length;

test('real series: --bootstrap declines the lh, sunspot and US accidental deaths cuts, keeps UK driver deaths', () => {
  assert.deepEqual(['lh.csv', 'sunspot-year.csv', 'us-accidental-deaths.csv'].map((f) => [k(f, {}), k(f, { bootstrap: true })]), [[1, 0], [5, 0], [1, 0]]);
  assert.equal(k('uk-driver-deaths.csv', { bootstrap: true }), 3);
  assert.equal(k('great-discoveries.csv', { bootstrap: true }), 0);
});
