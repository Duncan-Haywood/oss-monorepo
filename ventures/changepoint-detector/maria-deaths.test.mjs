import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real daily deaths in Puerto Rico (data/puerto-rico-daily-deaths.csv); Hurricane Maria landed on 2017-09-20.
// Numbers match eval/maria-deaths.out.txt.
const rows = readFileSync(new URL('./data/puerto-rico-daily-deaths.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const MARIA = labels.indexOf('2017-09-20');

test('real hurricane: every setup puts a change within a day of landfall, with a range that holds the day', () => {
  assert.equal(labels.length, 1201);
  for (const opt of [{ model: 'mean' }, { model: 'poisson', overdispersion: 'nb' }, { model: 'poisson', overdispersion: 'nb', period: 7 }, { model: 'mean', period: 365 }, { model: 'poisson', overdispersion: 'nb', period: 365 }]) {
    const cps = analyze({ values, labels, ...opt }).pelt.changepoints;
    const hit = cps.find((c) => Math.abs(labels.indexOf(c.label) - MARIA) <= 1);
    assert.ok(hit && hit.meanAfter > hit.meanBefore * 1.2, JSON.stringify(opt));
    assert.ok(hit.range95.fromIndex <= MARIA && MARIA <= hit.range95.toIndex, JSON.stringify(opt));
  }
});
