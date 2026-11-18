import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// `knownDate` in analyze() and on the page (README "A date you name", round 6: the page and the engine follow the CLI).
const csv = (name) => readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8');

test('analyze(): the Nile drops at 1899, a level step and no slope change, calibrated', () => {
  const r = analyze({ csv: csv('nile.csv'), knownDate: { date: '1899', reps: 199 } }).knownDate;
  assert.equal(r.refused, false);
  assert.equal(r.lastBefore, '1898');
  assert.ok(r.step < -200 && r.p <= 0.01 && r.pSlope > 0.5, JSON.stringify(r));
  assert.equal(r.calibrated, true);
  assert.equal(r.significant, true);
});

test('analyze(): seat-belt law on the logs with monthly seasons matches the CLI step', () => {
  const r = analyze({ csv: csv('uk-driver-deaths.csv'), column: 'deaths', log: true, period: 12, knownDate: { date: '1983-02', reps: 199 } }).knownDate;
  assert.equal(r.scale, 'log');
  assert.equal(r.step, -0.237);
  assert.equal(r.gated, true);
});

test('analyze(): a plain label string works, and an unknown label names the range', () => {
  assert.equal(analyze({ csv: csv('nile.csv'), knownDate: '1899' }).knownDate.firstAfter, '1899');
  assert.throws(() => analyze({ csv: csv('nile.csv'), knownDate: '1700' }), /no row has that label \(labels run 1871 to 1970/);
});

test('analyze(): no knownDate option, no knownDate field', () => {
  assert.equal('knownDate' in analyze({ csv: csv('nile.csv') }), false);
});

test('analyze(): a series passed only by the random-walk cut has no calibrated p and is never "significant"', () => {
  function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const g = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const r = mulberry(25000 + Math.round(60 * 7 + 0.9 * 100 + 0.5 * 10));
  for (let s = 0; s < 400; s++) {
    const x = []; let u = g(r) / Math.sqrt(1 - 0.81);
    for (let t = 0; t < 60; t++) { if (t) u = 0.9 * u + g(r); x.push(0.05 * t + u); }
    const h = analyze({ csv: ['t,x', ...x.map((v, t) => `${t},${v}`)].join('\n'), knownDate: { date: '30', reps: 19, seed: s + 1 } }).knownDate;
    if (h.refused || !h.admittedByCut) continue;
    assert.equal(h.calibrated, false);
    assert.equal(h.significant, false);
    return;
  }
  assert.fail('no cut-admitted series in the cell');
});

test('page: a known-date field feeds analyze() and its result is shown and counted', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<input id="knownDate" type="text"/);
  assert.match(html, /knownDate: \$\("#knownDate"\)\.value\.trim\(\) \|\| null/);
  assert.match(html, /Not a calibrated test here/);
  assert.match(html, /record\("known_date_run"\)/);
});
