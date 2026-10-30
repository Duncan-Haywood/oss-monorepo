import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/nile.csv): annual Nile flow at Aswan. The documented break is the 1898 dam works (Cobb 1978),
// first full year of lower flow 1899. Every variant must find it; --ar1 must widen the range, not move the date.
const rows = readFileSync(new URL('./data/nile.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (opt) => analyze({ values, labels, ...opt }).pelt.changepoints;

for (const [name, opt] of [['mean', {}], ['ar1', { ar1: true }], ['meanvar', { model: 'meanvar' }], ['meanvar robust', { model: 'meanvar', robust: true }]]) {
  test(`real Nile flow, ${name}: one change at 1899 whose range holds 1899`, () => {
    const cps = run(opt);
    assert.equal(cps.length, 1);
    assert.equal(cps[0].label, '1899');
    const r = cps[0].range95, at = labels.indexOf('1899');
    assert.ok(r.fromIndex <= at && at <= r.toIndex);
  });
}

test('real Nile flow: the ar1 range is wider than the plain one', () => {
  const w = (o) => { const r = run(o)[0].range95; return r.toIndex - r.fromIndex; };
  assert.ok(w({ ar1: true }) > w({}));
});
