// A smooth-trend jump model (drift-trend.mjs) on the TCPD series where the drift model's sigma is
// floored (README "Why the likelihood's wander absorbs a step": 21 of 38; "The closest call", Next:
// "a trend-in-the-walk model on the 21 floored series stays the drift model's first open item").
//
// Pre-registered 2026-11-22, written before this script was first run. Seen beforehand: one synthetic
// series (n 300, a 5-sigma step at 150, zeta 0.05) to check the code, where the model cut [150] and the
// partition's cost matched the sum of trendSegmentCost; no TCPD series was fitted with it.
// Model under test: trendWalkChanges(values) with its defaults (noise 'ml', penalty 3 log n,
// minSegment 3). Comparator: the shipped CLI default, driftLevelChanges(values, { noise: 'ml' }).
// Floored: driftNoise(values).flooredSigma. Margin 5, TCPD's F1 (eval/tcpd-metrics.mjs).
// Simulation (fixed seeds, n 200, 200 series a cell, sigma 1, slope starting at 0.05, zeta in
// {0.02, 0.1}):
//   S1 (size): with no change, the trend walk reports at most 0.15 false cuts a series in both cells.
//   S2 (power): with a 4-sigma level step at t 100, it cuts within 5 of 100 in at least 70% of series
//      at zeta 0.02 and at least 50% at zeta 0.1.
//   (The shipped drift model's figures are printed beside, no bar.)
// Real:
//   T1: on the floored series, mean F1(trend walk) - F1(shipped) is at least +0.03.
//   T2: on the floored series, the trend walk wins (diff > 0.005) on more series than it loses
//      (diff < -0.005).
//   T3: on the held-out floored series (TCPD's 7 held out), mean diff is at least 0 (unscorable if
//      none is floored).
//   T4: quality_control_4 (floored): a cut within 5 of 338-342 and at most 2 cuts in all.
// Ships: if S1, S2, T1 and T2 pass, `--drift-trend` on the CLI (opt-in) and a note under --model drift
// when sigma is floored that points to it; defaults do not change either way. Otherwise the module is
// exported for later rounds and nothing in the CLI changes.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/trend-walk-floored.mjs tcpd-data > eval/trend-walk-floored.out.txt
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { driftNoise, driftLevelChanges } from '../drift-level.mjs';
import { trendWalkChanges } from '../drift-trend.mjs';
import { fMeasure } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const MARGIN = 5;
const r3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const shipped = (x) => driftLevelChanges(x, { noise: 'ml' }).changepoints;
const trend = (x) => trendWalkChanges(x).changepoints;

// --- simulation
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function smooth(seed, n, zeta, step) {
  const u = rng(seed), g = () => Math.sqrt(-2 * Math.log(u() + 1e-300)) * Math.cos(2 * Math.PI * u());
  let mu = 0, b = 0.05; const y = [];
  for (let t = 0; t < n; t++) { if (step && t === 100) mu += step; y.push(mu + g()); mu += b; b += zeta * g(); }
  return y;
}
const REPS = 200, N = 200;
const sim = {};
console.log('Simulation: smooth trend, n 200, 200 series a cell, sigma 1');
for (const zeta of [0.02, 0.1]) {
  for (const step of [0, 4]) {
    let ft = 0, fs = 0, ht = 0, hs = 0;
    for (let r = 0; r < REPS; r++) {
      const y = smooth(1000 * (zeta === 0.02 ? 1 : 2) + 10 * r + step, N, zeta, step);
      const ct = trend(y), cs = shipped(y);
      const near = (c) => Math.abs(c - 100) <= MARGIN;
      if (step) { if (ct.some(near)) ht++; if (cs.some(near)) hs++; ft += ct.filter((c) => !near(c)).length; fs += cs.filter((c) => !near(c)).length; }
      else { ft += ct.length; fs += cs.length; }
    }
    sim[`${zeta}-${step}`] = { ft: ft / REPS, fs: fs / REPS, ht: ht / REPS, hs: hs / REPS };
    console.log(`  zeta ${zeta} step ${step}: trend walk false/series ${r3(ft / REPS)}${step ? `, found ${r3(ht / REPS)}` : ''}; shipped drift false/series ${r3(fs / REPS)}${step ? `, found ${r3(hs / REPS)}` : ''}`);
  }
}
const s1 = sim['0.02-0'].ft <= 0.15 && sim['0.1-0'].ft <= 0.15;
const s2 = sim['0.02-4'].ht >= 0.7 && sim['0.1-4'].ht >= 0.5;
console.log(`S1 ${s1 ? 'PASSES' : 'FAILS'}: false cuts a series ${r3(sim['0.02-0'].ft)} and ${r3(sim['0.1-0'].ft)} (bar 0.15)`);
console.log(`S2 ${s2 ? 'PASSES' : 'FAILS'}: found ${r3(sim['0.02-4'].ht)} (bar 0.70) and ${r3(sim['0.1-4'].ht)} (bar 0.50)`);

// --- TCPD
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
function load(dir, held) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const name = f.replace(/\.json$/, '');
    if (!ann[name]) continue;
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (j.n_dim !== 1) continue;
    let last = null;
    const values = j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? last : (last = Number(v))));
    out.push({ name, values, n: values.length, held });
  }
  return out;
}
const all = [...load(join(DIR, 'ds'), false), ...load(join(DIR, 'heldout'), true)];
if (all.length < 38) throw new Error(`expected 38 series, found ${all.length}: run sh eval/tcpd-fetch.sh ${DIR}`);
console.log('\nTCPD, per series: F1 shipped drift (ML wander) and trend walk, margin 5');
const rows = all.map((s) => {
  const floored = driftNoise(s.values).flooredSigma;
  const cs = clean(shipped(s.values), s.n), tw = trendWalkChanges(s.values), ct = clean(tw.changepoints, s.n);
  const fs = fMeasure(ann[s.name], cs, MARGIN).F, ft = fMeasure(ann[s.name], ct, MARGIN).F;
  return { ...s, floored, cs, ct, fs, ft, d: ft - fs, q: tw.q, tFloor: tw.flooredSigma };
});
for (const r of rows) console.log(`  ${r.name.padEnd(22)}${r.held ? ' (held out)' : '           '} n ${String(r.n).padStart(4)} ${r.floored ? 'floored' : '       '}  shipped ${String(r.cs.length).padStart(3)} ${r3(r.fs)}  trend ${String(r.ct.length).padStart(3)} ${r3(r.ft)}  diff ${r.d >= 0 ? '+' : ''}${r3(r.d)}  qz ${r.q.toExponential(2)}${r.tFloor ? ' (trend sigma floored too)' : ''}`);
const fl = rows.filter((r) => r.floored), un = rows.filter((r) => !r.floored);
const t1 = mean(fl.map((r) => r.d)) >= 0.03;
const wins = fl.filter((r) => r.d > 0.005).length, losses = fl.filter((r) => r.d < -0.005).length;
const t2 = wins > losses;
const hf = fl.filter((r) => r.held);
const t3 = hf.length ? mean(hf.map((r) => r.d)) >= 0 : null;
const q4 = rows.find((r) => r.name === 'quality_control_4');
const t4 = q4.floored && q4.ct.some((c) => c >= 333 && c <= 347) && q4.ct.length <= 2;
console.log(`\nT1 ${t1 ? 'PASSES' : 'FAILS'}: mean diff on ${fl.length} floored series ${r3(mean(fl.map((r) => r.d)))} (bar +0.03); F1 ${r3(mean(fl.map((r) => r.fs)))} -> ${r3(mean(fl.map((r) => r.ft)))}`);
console.log(`T2 ${t2 ? 'PASSES' : 'FAILS'}: ${wins} wins, ${losses} losses, ${fl.length - wins - losses} ties`);
console.log(`T3 ${t3 == null ? 'UNSCORABLE' : t3 ? 'PASSES' : 'FAILS'}: ${hf.length} held-out floored series, mean diff ${r3(mean(hf.map((r) => r.d)))}`);
console.log(`T4 ${t4 ? 'PASSES' : 'FAILS'}: quality_control_4 cuts [${q4.ct}]`);
console.log(`Not floored (no bar): ${un.length} series, mean diff ${r3(mean(un.map((r) => r.d)))}; all 38: ${r3(mean(rows.map((r) => r.fs)))} -> ${r3(mean(rows.map((r) => r.ft)))}`);
console.log(`\nShips: ${s1 && s2 && t1 && t2 ? '--drift-trend (opt-in) and a floored-sigma note under --model drift' : 'nothing in the CLI (S1, S2, T1 and T2 must all pass); drift-trend.mjs exported'}.`);
