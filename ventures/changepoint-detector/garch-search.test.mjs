// `--model meanvar --garch`: cuts searched jointly with a segment-wise GARCH(1,1) likelihood (README, "Cuts searched
// jointly with a GARCH likelihood"; pre-registered in eval/meanvar-garch-choose-prereg-2026-11-13.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, garchCuts, GARCH_GRID } from './engine.mjs';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const garchNoise = (r, n) => { let h = 1; const o = []; for (let i = 0; i < n + 50; i++) { const e = Math.sqrt(h) * gauss(r); h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) o.push(e); } return o; };
const cuts = (v, o = {}) => analyze({ values: v, model: 'meanvar', garch: true, ...o }).pelt.changepoints.map((c) => c.index);

test('the grid is the 18 points the pre-registered run used (its text said 24; the code excluded a + b >= 0.98)', () => {
  assert.equal(GARCH_GRID.length, 18);
  assert.ok(GARCH_GRID.every(([a, b]) => a + b < 0.98));
});

test('clustered volatility with no change: plain meanvar cuts, the GARCH search does not', () => {
  // seed chosen where plain meanvar raises a false change (it does on about half of these series)
  let k = 0, x;
  do x = garchNoise(rng(7100 + k++), 200); while (analyze({ values: x, model: 'meanvar' }).pelt.changepoints.length === 0);
  const r = analyze({ values: x, model: 'meanvar', garch: true });
  assert.deepEqual(r.pelt.changepoints, []);
  assert.equal(r.garch.clustered, true);
});

test('a lasting sd 1 to 3 step on Gaussian noise is one cut near the step, with no GARCH term', () => {
  const r = rng(42), x = Array.from({ length: 200 }, (_, i) => (i < 100 ? 1 : 3) * gauss(r));
  const res = analyze({ values: x, model: 'meanvar', garch: true });
  assert.equal(res.pelt.changepoints.length, 1);
  assert.ok(Math.abs(res.pelt.changepoints[0].index - 100) <= 5);
  assert.equal(res.garch.clustered, false);
});

test('a mean shift on GARCH noise is found once', () => {
  const x = garchNoise(rng(99), 200).map((v, i) => (i < 100 ? v : v + 3));
  const c = cuts(x);
  assert.equal(c.length, 1);
  assert.ok(Math.abs(c[0] - 100) <= 5, `cut at ${c[0]}`);
});

test('the stride used on long series lands on the same cut as the full scan on a clear step', () => {
  const r = rng(5), x = Array.from({ length: 600 }, (_, i) => (i < 350 ? 1 : 2.5) * gauss(r));
  const ln = Math.log(600), o = { pen: 1.5 * ln, garchPen: 0.25 * ln, maxCuts: 3 };
  assert.deepEqual(garchCuts(x, { ...o, stride: 3 }).cuts, garchCuts(x, o).cuts);
});

test('refuses other noise options and series over 20,000 points', () => {
  const x = Array.from({ length: 50 }, (_, i) => i % 3);
  assert.throws(() => cuts(x, { bootstrap: true }), /GARCH search/);
  assert.throws(() => cuts(x, { robust: true }), /GARCH search/);
  assert.throws(() => analyze({ values: x, model: 'mean', garch: true }), /GARCH search/);
  assert.throws(() => cuts(Array.from({ length: 20001 }, (_, i) => Math.sin(i))), /20,000/);
});

// Real series (data/dax-returns.csv, data/djia-returns.csv). Descriptions, not evidence: no documented dates are scored.
const load = (f) => readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));

test('dax: the GARCH search keeps the row 1482 rise and the early spike, as --bootstrap does (rows 32, 42, 1482)', () => {
  const rows = load('dax-returns.csv');
  const r = analyze({ values: rows.map((x) => +x[1]), labels: rows.map((x) => x[0]), model: 'meanvar', garch: true });
  assert.deepEqual(r.pelt.changepoints.map((c) => c.label), ['28', '39', '1482']);
  assert.deepEqual([r.garch.clustered, r.garch.alpha, r.garch.beta], [true, 0.1, 0.85]);
  assert.match(r.rangeWarning, /too narrow/);
});

test('djia: 33 years of daily returns, the clustering explains 1987 and 2008 and nothing is cut', () => {
  const rows = load('djia-returns.csv');
  const r = analyze({ values: rows.map((x) => +x[1]), labels: rows.map((x) => x[0]), model: 'meanvar', garch: true });
  assert.equal(r.pelt.changepoints.length, 0);
  assert.equal(r.garch.clustered, true);
});
