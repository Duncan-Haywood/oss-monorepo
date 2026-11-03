import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Five real series that had no test before (data/SOURCE.md): quarterly Australian arrivals from Japan and the US
// (fpp2::arrivals, 1981Q1-2012Q3) and UK monthly lung-disease deaths 1974-79 (R's ldeaths, mdeaths, fdeaths).
// Documented shocks: SARS (2003Q2), the Sydney Olympics (2000Q3), the September 2001 attacks (2001Q3). The lung
// series have no documented step, so every cut is a false alarm (the 1976 winter spike is a shock, not a step).
const load = (f) => {
  const rows = readFileSync(new URL(`./data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[1]) };
};
const run = (f, o) => analyze({ ...load(f), ...o }).pelt.changepoints.map((c) => c.label);

test('arrivals from Japan: the seasonal mean model cuts SARS (2003Q2) among 12 changes', () => {
  assert.equal(load('au-arrivals-japan').values.length, 127);
  const cps = run('au-arrivals-japan', { period: 4 });
  assert.ok(cps.includes('2003Q2'));
  assert.equal(cps.length, 12);
});

test('arrivals from the US: the Olympics (2000Q3) and the 2001Q3 attacks are cut', () => {
  const cps = run('au-arrivals-us', { period: 4 });
  assert.ok(cps.includes('2000Q3') && cps.includes('2001Q3'));
  assert.equal(cps.length, 12);
});

test('--ar1 drops both arrivals shocks (it reads them as autocorrelation): a cost of the false-alarm guard', () => {
  assert.ok(!run('au-arrivals-japan', { period: 4, ar1: true }).includes('2003Q2'));
  assert.ok(!run('au-arrivals-us', { period: 4, ar1: true }).some((l) => l === '2000Q3' || l === '2001Q3'));
});

test('UK lung deaths, no documented step: seasonal mean cuts 5-10 times, NB counts 2-7, --ar1 1-2', () => {
  for (const f of ['uk-ldeaths', 'uk-mdeaths', 'uk-fdeaths']) {
    assert.equal(load(f).values.length, 72);
    assert.ok(run(f, { period: 12 }).includes('1976-02'), `${f} 1976-02`);
  }
  assert.equal(run('uk-ldeaths', { period: 12, ar1: true }).join(), '1976-04');
  assert.equal(run('uk-mdeaths', { period: 12, ar1: true }).join(), '1976-04');
  assert.equal(run('uk-ldeaths', { period: 12 }).length, 6);
  assert.equal(run('uk-mdeaths', { period: 12 }).length, 10);
  assert.equal(run('uk-fdeaths', { period: 12 }).length, 5);
  assert.equal(run('uk-ldeaths', { period: 12, model: 'poisson', overdispersion: 'nb' }).join(), '1976-02,1976-04,1979-10');
});
