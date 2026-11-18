import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { knownDateResult, knownDateText } from './known-date-cli.mjs';

// `--known-date` (README "A date you name", round 5: pre-registered bars held, eval/known-date-sim-round5.out.txt).
const cli = (args) => execFileSync(process.execPath, [new URL('./cli.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8' });

test('CLI: the Nile drops at 1899 (after the Aswan dam), a step and no slope change', () => {
  const r = JSON.parse(cli(['--example', '--known-date', '1899', '--json']));
  assert.equal(r.refused, false);
  assert.equal(r.firstAfter, '1899');
  assert.equal(r.lastBefore, '1898');
  assert.ok(r.step < -200 && r.p <= 0.01 && r.pSlope > 0.5, JSON.stringify({ step: r.step, p: r.p, pSlope: r.pSlope }));
  assert.equal(r.rhoGenMethod, 'gated');
  assert.equal(r.gated, false);
});

test('CLI text: seat-belt law on the logs with monthly seasons, sticky so both bootstraps run', () => {
  const t = cli([new URL('./data/uk-driver-deaths.csv', import.meta.url).pathname, '--column', 'deaths', '--known-date', '1983-02', '--period', '12', '--log']);
  assert.match(t, /1983-01 -> 1983-02/);
  assert.match(t, /Step at the date: -0\.237/);
  assert.match(t, /larger of two bootstraps/);
  assert.match(t, /does not say what caused the change/);
});

test('an unknown label is an error that names the label range', () => {
  const csv = readFileSync(new URL('./data/nile.csv', import.meta.url), 'utf8');
  assert.throws(() => knownDateResult({ csv, date: '1700', reps: 19 }), /no row has that label \(labels run 1871 to 1970/);
});

test('a random walk is refused, and the text says why', () => {
  let s = 5, u = 0; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rows = ['t,x', ...Array.from({ length: 80 }, (_, t) => `${t},${(u += Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())).toFixed(3)}`)];
  const h = knownDateResult({ csv: rows.join('\n'), date: '40', reps: 19 });
  assert.equal(h.refused, true); // the guard admits a few walks (eval/known-date-sim-round5.out.txt); this seeded one is refused
  assert.match(knownDateText(h), /Not tested: .*unit root/);
});

test('a series passed only by the random-walk cut is reported as not calibrated', () => {
  // the first such series in round 5's n 60 rho 0.9 cell (seed base 25000, eval/known-date-cut-admitted.mjs)
  function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const g = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const r = mulberry(25000 + Math.round(60 * 7 + 0.9 * 100 + 0.5 * 10));
  for (let s = 0; s < 400; s++) {
    const x = []; let u = g(r) / Math.sqrt(1 - 0.81);
    for (let t = 0; t < 60; t++) { if (t) u = 0.9 * u + g(r); x.push(0.05 * t + u); }
    const csv = ['t,x', ...x.map((v, t) => `${t},${v}`)].join('\n');
    const h = knownDateResult({ csv, date: '30', reps: 19, seed: 25000 + s + 1 });
    if (h.refused || !h.admittedByCut) { if (!h.refused) assert.equal(h.calibrated, true); continue; }
    assert.equal(h.calibrated, false);
    assert.match(knownDateText(h), /NOT A CALIBRATED TEST HERE.*237 of 306 with no change.*142 of 156 with a real step/);
    return;
  }
  assert.fail('no cut-admitted series in the cell');
});
