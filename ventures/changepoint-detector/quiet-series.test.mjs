import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real quiet series, no documented step, so every changepoint below is a false alarm.
// data/lh.csv: 48 ten-minute luteinizing hormone readings (R's `lh`). data/treering.csv: 7,980 yearly
// tree-ring widths, 6000 BC to 1979 (R's `treering`). Counts match README "Two quiet real series: lh and treering".
const load = (f) => {
  const rows = readFileSync(new URL(`./data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[1]) };
};
const lh = load('lh'), tree = load('treering');
const run = (d, o) => analyze({ ...d, ...o }).pelt.changepoints.map((c) => c.label);

test('lh: the default mean model cuts five steps in a stationary series; --ar1, meanvar bootstrap leave none', () => {
  assert.equal(lh.values.length, 48);
  assert.deepEqual(run(lh, {}), ['15', '18', '23', '35', '40']);
  assert.deepEqual(run(lh, { ar1: true }), []);
  assert.deepEqual(run(lh, { model: 'meanvar', bootstrap: true }), []);
});

test('lh: a longer minimum segment only thins the false alarms', () => {
  assert.deepEqual(run(lh, { minSegment: 6 }), ['15', '34', '40']);
  assert.deepEqual(run(lh, { minSegment: 20 }), ['28']);
});

test('treering: 38 steps by default, still 11 with --ar1, 1 with the meanvar bootstrap', () => {
  assert.equal(tree.values.length, 7980);
  assert.equal(run(tree, {}).length, 38);
  assert.equal(run(tree, { ar1: true }).length, 11);
  assert.deepEqual(run(tree, { model: 'meanvar', bootstrap: true }), ['-4353']);
});

test('treering: rho is only 0.16 but the block-variance check still warns about the 38 steps; lh, Nile-sized series do not trip it', () => {
  const w = analyze(tree).rangeWarning;
  assert.match(w, /wanders more than independent noise allows/);
  assert.match(w, /38 steps/);
  const dax = readFileSync(new URL('./data/dax-returns.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => +l.split(',')[1]);
  assert.equal(analyze({ values: dax }).rangeWarning ?? null, null);
});
