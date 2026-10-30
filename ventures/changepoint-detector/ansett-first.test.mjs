import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real weekly series (data/ansett-melsyd-first.csv): Ansett Melbourne-Sydney first-class passengers in thousands, 270 weeks.
// Same 1989 pilots' dispute as ansett-strike.test.mjs, in a series without economy's holiday swing. Numbers match
// eval/ansett-first.out.txt. A negative result is pinned: this series is not quiet outside the closure, and a gradual restart
// is missed by the mean model.
const rows = readFileSync(new URL('./data/ansett-melsyd-first.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const STOP = labels.indexOf('1989-08-21'), RESTART = labels.indexOf('1989-10-16');
const holds = (cps, t) => cps.some((c) => c.range95 && c.range95.fromIndex <= t && t <= c.range95.toIndex);

test('real first-class series: stop found by all four setups, restart only by the count model, and 29 to 37 other changes remain', () => {
  assert.equal(labels.length, 270);
  const counts = values.map((v) => Math.round(v * 1000));
  const setups = [
    [values, { model: 'mean', period: 52 }, 29, false], [values, { model: 'mean' }, 30, false],
    [counts, { model: 'poisson', period: 52, overdispersion: 'nb' }, 37, true], [counts, { model: 'poisson', overdispersion: 'nb' }, 30, true],
  ];
  for (const [vals, opt, n, restart] of setups) {
    const cps = analyze({ values: vals, labels, ...opt }).pelt.changepoints;
    assert.equal(cps.length, n, JSON.stringify(opt));
    assert.ok(holds(cps, STOP) || holds(cps, STOP + 1), 'range holds the stop');
    assert.equal(holds(cps, RESTART), restart, `restart ${JSON.stringify(opt)}`);
  }
});
