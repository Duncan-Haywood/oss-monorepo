import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/uk-driver-deaths.csv): monthly UK drivers killed or seriously injured. The documented break is the
// front-seat seat-belt law of 31 January 1983 (Harvey and Durbin 1986). Numbers match eval/seatbelt-law.out.txt.
const rows = readFileSync(new URL('./data/uk-driver-deaths.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const TRUTH = labels.indexOf('1983-02');
const run = (opt) => analyze({ values, labels, period: 12, ...opt }).pelt.changepoints;

test('real driver casualties: seasonal NB counts find the seat-belt law and a range that holds February 1983', () => {
  assert.equal(labels.length, 192);
  const cps = run({ model: 'poisson', overdispersion: 'nb' });
  const c = cps.find((x) => x.label === '1983-01');
  assert.ok(c, 'a change at 1983-01');
  assert.ok(c.meanBefore > 1550 && c.meanAfter < 1400, `${c.meanBefore} -> ${c.meanAfter}`);
  assert.ok(c.range95.fromIndex <= TRUTH && TRUTH <= c.range95.toIndex);
  assert.ok(cps.some((x) => x.label === '1973-11' && x.meanAfter < x.meanBefore), 'the winter-1973 dip');
  assert.ok(cps.length <= 10, `${cps.length} changes`);
});

test('real driver casualties: plain Poisson ignores the clumping and cuts the series into dozens of steps', () => {
  assert.ok(run({ model: 'poisson' }).length > 25);
});

test('real driver casualties: every Gaussian setup holds February 1983; --log dates it there; --ar1 and --bootstrap drop the 1981-82 dip', () => {
  const at = (cps) => cps.find((x) => ['1983-01', '1983-02'].includes(x.label));
  for (const opt of [{ model: 'mean' }, { model: 'mean', log: true }, { model: 'mean', ar1: true }, { model: 'mean', bootstrap: true }]) {
    const c = at(run(opt));
    assert.ok(c && c.range95.fromIndex <= TRUTH && TRUTH <= c.range95.toIndex, JSON.stringify(opt));
  }
  assert.equal(at(run({ model: 'mean', log: true })).label, '1983-02');
  assert.equal(run({ model: 'mean' }).length, 8);
  assert.equal(run({ model: 'mean', log: true }).length, 8);
  assert.equal(run({ model: 'mean', ar1: true }).length, 5);
  assert.equal(run({ model: 'mean', bootstrap: true }).length, 6);
  for (const opt of [{ model: 'mean', ar1: true }, { model: 'mean', bootstrap: true }]) {
    assert.ok(!run(opt).some((x) => x.label === '1981-12' || x.label === '1982-02'), JSON.stringify(opt));
  }
});
