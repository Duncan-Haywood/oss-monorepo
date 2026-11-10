import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real daily counts (data/bike-sharing-daily.csv, Capital Bikeshare 2011-2012). Hurricane Sandy closed the system
// on 2012-10-29 (recalled, source unread): 2 registered rides that day against ~5,000 a day either side. Numbers
// match eval/sandy-bikes.out.txt. Every setup must cut the first day of the outage with a range holding it, and
// the recovery two days later.
const rows = readFileSync(new URL('./data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const SANDY = labels.indexOf('2012-10-29');

for (const [name, col] of [['registered', 2], ['casual', 1]]) {
  for (const [setup, opt] of [['poisson nb', { model: 'poisson', period: 7, overdispersion: 'nb' }], ['mean log', { model: 'mean', period: 7, log: true }]]) {
    test(`Sandy, ${name} riders, ${setup}: the outage start and its recovery are cut`, () => {
      const c = analyze({ values: rows.map((r) => +r[col]), labels, ...opt }).pelt.changepoints;
      const a = c.find((x) => x.label === '2012-10-29'), b = c.find((x) => x.label === '2012-10-31');
      assert.ok(a && b, 'cuts at 2012-10-29 and 2012-10-31');
      assert.ok(a.range95.fromIndex <= SANDY && SANDY <= a.range95.toIndex);
    });
  }
}
