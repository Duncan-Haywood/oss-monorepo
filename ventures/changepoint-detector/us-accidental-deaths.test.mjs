import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/us-accidental-deaths.csv, R's USAccDeaths): 72 months of US accidental deaths from 1973-01.
// eval/drift-warning-trendless.mjs calls it a null; it is not quiet. Numbers match eval/us-accidental-deaths.out.txt.
const rows = readFileSync(new URL('./data/us-accidental-deaths.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);

test('real US accidental deaths: every seasonal setup puts a fall at 1973-12 of about 1,000 a month', () => {
  assert.equal(labels.length, 72);
  for (const opt of [{ model: 'mean', period: 12 }, { model: 'poisson', overdispersion: 'nb', period: 12 }, { model: 'mean', period: 12, ar1: true }, { model: 'mean', period: 12, trend: 'bend' }]) {
    const cps = analyze({ values, labels, ...opt }).pelt.changepoints;
    const c = cps.find((x) => x.label === '1973-12');
    assert.ok(c && c.shift < 0, JSON.stringify(opt));
    assert.ok(c.meanBefore - c.meanAfter > 900 && c.meanBefore - c.meanAfter < 1100, `${c.meanBefore} -> ${c.meanAfter}`);
    assert.ok(cps.length <= 4, JSON.stringify(opt));
  }
});

test('real US accidental deaths: without the seasonal term the winter peaks read as steps', () => {
  const cps = analyze({ values, labels, model: 'mean' }).pelt.changepoints;
  assert.deepEqual(cps.map((c) => c.label), ['1973-05', '1973-11', '1978-05']);
});
