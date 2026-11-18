import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, findSpikes } from './engine.mjs';

// Seeded noise so the numbers are fixed.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function noise(n, seed, sd = 1) { const r = rng(seed); return Array.from({ length: n }, () => { let u = 0; for (let i = 0; i < 12; i++) u += r(); return (u - 6) * sd; }); }
const labelsFor = (n) => Array.from({ length: n }, (_, i) => String(i + 1));

test('gold returns: the bad day 770 is labelled one spike over the 769/771/773 cuts', () => {
  const rows = readFileSync(new URL('./data/gold.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','))
    .filter((r) => r[1] !== '' && !Number.isNaN(+r[1]));
  const v = rows.map((r) => +r[1]);
  const ret = v.slice(1).map((x, i) => 100 * Math.log(x / v[i]));
  const r = analyze({ values: ret, labels: rows.slice(1).map((x) => x[0]), spikes: true });
  assert.ok(r.spikes.some((s) => s.startIndex <= 748 && s.endIndex >= 748), JSON.stringify(r.spikes));
  assert.equal(analyze({ values: ret, labels: rows.slice(1).map((x) => x[0]) }).spikes, undefined);
});

test('a one-point outlier on flat noise is a spike; the cuts are unchanged', () => {
  const x = noise(120, 7); x[60] += 12;
  const base = analyze({ values: x, labels: labelsFor(120), minSegment: 1 });
  const r = analyze({ values: x, labels: labelsFor(120), minSegment: 1, spikes: true });
  assert.equal(r.pelt.changepoints.length, base.pelt.changepoints.length);
  assert.ok(r.spikes.length >= 1 && r.spikes[0].kind === 'spike' && r.spikes[0].excursionInNoiseSd >= 3);
});

test('a lasting step is never labelled a spike', () => {
  const x = noise(120, 11).map((e, i) => e + (i >= 60 ? 6 : 0));
  const r = analyze({ values: x, labels: labelsFor(120), spikes: true });
  assert.ok(r.pelt.changepoints.length >= 1);
  assert.deepEqual(r.spikes, []);
});

test('findSpikes: a cancelling pair is a dip; a step and a small wobble are not', () => {
  const cps = [{ index: 10, meanBefore: 0, meanAfter: -8 }, { index: 12, meanBefore: -8, meanAfter: 0.5 }];
  const s = findSpikes(cps, 1);
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, 'dip');
  assert.deepEqual(findSpikes([{ index: 10, meanBefore: 0, meanAfter: 8 }], 1), []);
  assert.deepEqual(findSpikes([{ index: 10, meanBefore: 0, meanAfter: 1 }, { index: 12, meanBefore: 1, meanAfter: 0 }], 1), []);
});

test('counts reject --spikes', () => {
  assert.throws(() => analyze({ values: [1, 2, 3, 4, 5, 6], model: 'poisson', spikes: true }), /Spikes are for continuous/);
});

// Real returns (data/*-returns.csv, 2026-11-09 measurement, README "--spikes on five real return series").
const returnsOf = (name) => {
  const rows = readFileSync(new URL(`./data/${name}-returns.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { values: rows.map((r) => +r[1]), labels: rows.map((r) => r[0]) };
};

test('real returns: with the variance model --spikes labels nothing on DJIA, DAX, SMI, CAC and FTSE', () => {
  for (const n of ['djia', 'dax', 'smi', 'cac', 'ftse']) {
    const r = analyze({ ...returnsOf(n), model: 'meanvar', spikes: true });
    assert.deepEqual(r.spikes, [], n);
  }
});

test('real returns: with the mean model --spikes labels 18 DJIA days, among them the 1987 crash and the 2001 reopening', () => {
  const r = analyze({ ...returnsOf('djia'), model: 'mean', spikes: true });
  assert.equal(r.spikes.length, 18);
  const has = (kind, from) => r.spikes.some((s) => s.kind === kind && s.from === from);
  assert.ok(has('dip', '1987-10-16'));
  assert.ok(has('dip', '2001-09-17'));
  assert.ok(has('spike', '2008-10-10'));
});
