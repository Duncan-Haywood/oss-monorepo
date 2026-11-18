import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Daily gold price, 1985-01-01 to 1989-03-31 (data/gold.csv, forecast::gold, 1108 days, 34 blank). Day 770 reads
// 593.7 against ~485 either side: a known data error (recalled from the forecasting literature, source unread).
// A random walk has no level to shift, so the level model is a staircase; the returns are the right series.
const rows = readFileSync(new URL('./data/gold.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','))
  .filter((r) => r[1] !== '' && !Number.isNaN(+r[1]));
const labels = rows.map((r) => r[0]);
const v = rows.map((r) => +r[1]);
const ret = v.slice(1).map((x, i) => 100 * Math.log(x / v[i]));
const rl = labels.slice(1);
const cuts = (values, labs, opt) => analyze({ values, labels: labs, ...opt }).pelt.changepoints.map((c) => c.label);

test('gold: 1074 priced days; the level model returns a staircase of 113 changes and brackets day 770', () => {
  assert.equal(v.length, 1074);
  const c = cuts(v, labels, {});
  assert.equal(c.length, 113);
  assert.ok(c.includes('769') && c.includes('771'));
});

test('gold: --ar1 cuts the staircase to 24, a random walk read as autocorrelation', () => {
  assert.equal(cuts(v, labels, { ar1: true }).length, 24);
});

test('gold returns, mean model: 7 cuts, three of them (769, 771, 773) around the bad day 770', () => {
  const c = cuts(ret, rl, {});
  assert.equal(c.length, 7);
  for (const d of ['769', '771', '773']) assert.ok(c.includes(d), d);
});

test('gold returns, meanvar: 10 cuts plain, 5 robust or dispersion-scaled, 2 with the bootstrap penalty', () => {
  assert.equal(cuts(ret, rl, { model: 'meanvar' }).length, 10);
  assert.equal(cuts(ret, rl, { model: 'meanvar', robust: true }).length, 5);
  assert.equal(cuts(ret, rl, { model: 'meanvar', dispersion: true }).length, 5);
  assert.equal(cuts(ret, rl, { model: 'meanvar', bootstrap: true }).join(), '762,772');
});
