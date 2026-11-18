import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/us-tbill-1m-changes.csv): monthly change of the US 1-month T-bill yield, 1947-2/1991-2.
// Documented volatility regime: the Fed targeted reserves, not the funds rate, from October 1979 to October 1982
// (Volcker; cited from memory, sources unread). Every variant must cut at 1979-10 with the range holding it, and
// must put the second cut within two months of the end of the regime.
const rows = readFileSync(new URL('./data/us-tbill-1m-changes.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (opt) => analyze({ values, labels, model: 'meanvar', ...opt }).pelt.changepoints;
const idx = (l) => labels.indexOf(l);

for (const [name, opt] of [['plain', {}], ['dispersion', { dispersion: true }], ['robust', { robust: true }]]) {
  test(`real T-bill changes, meanvar ${name}: 1979-10 is cut and its range holds it`, () => {
    const cps = run(opt), c = cps.find((p) => p.label === '1979-10');
    assert.ok(c);
    assert.ok(c.range95.fromIndex <= idx('1979-10') && idx('1979-10') <= c.range95.toIndex);
  });
  test(`real T-bill changes, meanvar ${name}: the regime ends at 1982-09, within two months of October 1982`, () => {
    const c = run(opt).find((p) => p.label === '1982-09');
    assert.ok(c);
    assert.ok(Math.abs(idx('1982-09') - idx('1982-10')) <= 2);
  });
}
