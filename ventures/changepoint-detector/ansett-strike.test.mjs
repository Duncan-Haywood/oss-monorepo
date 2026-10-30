import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real weekly series (data/ansett-melsyd-economy.csv): Ansett Melbourne-Sydney economy-class passengers in thousands.
// The pilots' dispute from 18 August 1989 is the documented closure. Numbers match eval/ansett-strike.out.txt.
const rows = readFileSync(new URL('./data/ansett-melsyd-economy.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const STOP = labels.indexOf('1989-08-21'), RESTART = labels.indexOf('1989-10-16');
const holds = (cps, t) => cps.some((c) => c.range95 && c.range95.fromIndex <= t && t <= c.range95.toIndex);
const near = (cps, t) => cps.some((c) => Math.abs(labels.indexOf(c.label) - t) <= 1);

test('real airline strike: the mean and seasonal count models find the stop and the restart, with ranges that hold them', () => {
  assert.equal(labels.length, 283);
  for (const [vals, opt] of [[values, { model: 'mean', period: 52 }], [values.map((v) => Math.round(v * 1000)), { model: 'poisson', period: 52, overdispersion: 'nb' }]]) {
    const cps = analyze({ values: vals, labels, ...opt }).pelt.changepoints;
    assert.ok(near(cps, STOP) && near(cps, RESTART), cps.map((c) => c.label).join(' '));
    assert.ok(holds(cps, STOP) || holds(cps, STOP + 1), 'range holds the stop');
    assert.ok(holds(cps, RESTART), 'range holds the restart');
    assert.ok(cps.some((c) => c.label === '1989-10-16' && c.meanAfter > c.meanBefore));
  }
});
