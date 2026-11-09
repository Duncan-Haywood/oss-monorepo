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

test('gold levels: the spike flag names the bad day (labels 769 to 770, 30 noise sds); returns flag two other short runs; clean step silent', () => {
  const r = analyze({ values: v, labels, model: 'mean' });
  const hit = r.spikes.find((s) => s.from === '769' && s.to === '770');
  assert.ok(hit && hit.sizeInNoiseSds > 25);
  assert.match(r.spikeWarning, /outlier/);
  // returns: the bad day is a +/- pair that nets to about zero, so it is not flagged; two other short excursions are
  assert.deepEqual(analyze({ values: ret, labels: rl, model: 'mean' }).spikes.map((s) => s.from), ['55', '418']);
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const noise = Array.from({ length: 80 }, () => rnd());
  const step = noise.map((x, i) => (i < 40 ? 10 : 0) + x);
  assert.equal(analyze({ values: step, model: 'mean' }).spikeWarning, undefined);
  const sp = noise.map((x, i) => (i === 20 || i === 21 ? x + 10 : x));
  assert.equal(analyze({ values: sp, model: 'mean' }).spikes?.length, 1);
});
