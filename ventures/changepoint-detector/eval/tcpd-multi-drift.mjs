// The drift model (random-walk level between jumps) in several-columns mode, on the three
// multi-dimensional TCPD series (apple, bee_waggle_6, occupancy), beside the joint level fits
// already scored (eval/tcpd-multi.out.txt, eval/tcpd-multi-floor.out.txt).
//
// Written and fixed 2026-11-11 before multi-drift.mjs was run on any of these series:
//   - primary: 'joint drift' = multiDriftChanges, per-column noise 'ml', penalty (1 + d) log n,
//     minimum segment 2 (the one-column drift CLI default carried over; nothing chosen per series);
//   - secondary: noise 'lags'; minimum segment 5; penalty 2 (1 + d) log n (the one-column run's
//     "4 log n" analogue). Reported, not chosen between: choosing now would be tuning on the test.
//   - decision rule: offer `--columns --model drift` (CLI, analyzeMulti) if the primary's mean F1
//     beats the joint level default (floor auto, 0.286) here AND eval/multi-drift-sim.mjs passes its
//     own rule (stated in that file). The joint default stays the level model whatever happens:
//     three series is a panel, not a benchmark.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd-multi-drift.mjs tcpd-data > eval/tcpd-multi-drift.out.txt
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { multiPelt, columnConsensus } from '../multivariate.mjs';
import { multiDriftChanges, multiDriftNoise, multiDriftPenalty } from '../multi-drift.mjs';
import { fMeasure, covering } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const MARGIN = 5;
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

const series = [];
for (const name of ['apple', 'bee_waggle_6', 'occupancy']) {
  const f = join(DIR, 'heldout', `${name}.json`);
  if (!existsSync(f)) throw new Error(`${f} missing: run sh eval/tcpd-fetch.sh ${DIR}`);
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const cols = j.series.map((s) => { let last = null; return s.raw.map((v) => { if (v != null && Number.isFinite(Number(v))) last = Number(v); return last; }); });
  series.push({ name, cols, names: j.series.map((s) => s.label), n: j.n_obs });
}

const t0 = Date.now();
const ml = new Map(series.map((s) => [s.name, multiDriftNoise(s.cols, { noise: 'ml' })]));
const ml5 = new Map(series.map((s) => [s.name, multiDriftNoise(s.cols, { noise: 'ml', minSegment: 5 })]));
const SETTINGS = {
  'joint drift (primary)': (s) => multiDriftChanges(s.cols, { noise: ml.get(s.name) }).changepoints,
  'joint drift, noise lags': (s) => multiDriftChanges(s.cols, { noise: 'lags' }).changepoints,
  'joint drift, min segment 5': (s) => multiDriftChanges(s.cols, { noise: ml5.get(s.name), minSegment: 5 }).changepoints,
  'joint drift, 2x penalty': (s) => multiDriftChanges(s.cols, { noise: ml.get(s.name), penalty: 2 * multiDriftPenalty(s.n, s.cols.length) }).changepoints,
  'joint level, floor auto (default)': (s) => multiPelt(s.cols, { model: 'mean', floor: 'auto' }).changepoints,
  'joint level, ar1 + floor 2': (s) => multiPelt(s.cols, { model: 'mean', floor: 2, ar1: true }).changepoints,
  'columns: every setting': (s) => columnConsensus(s.cols, { names: s.names }).changes.map((c) => c.index),
};
const res = {};
for (const [nm, fn] of Object.entries(SETTINGS)) {
  res[nm] = {};
  for (const s of series) {
    const cps = clean(fn(s), s.n);
    res[nm][s.name] = { cps, f1: fMeasure(ann[s.name], cps, MARGIN).F, cover: covering(ann[s.name], cps, s.n) };
  }
}
console.log('TCPD multi-dimensional series: the drift model with one segmentation for all columns. Settings, primary and rule fixed before scoring.');
console.log('F1 at margin 5 and segmentation cover (TCPDBench definitions); cuts = changes reported.\n');
console.log(`${'setting'.padEnd(36)}${series.map((s) => `${s.name} F1`.padStart(17)).join('')}${'mean F1'.padStart(10)}${'mean cover'.padStart(12)}${'cuts'.padStart(14)}`);
for (const nm of Object.keys(SETTINGS)) {
  const r = res[nm];
  console.log(`${nm.padEnd(36)}${series.map((s) => r[s.name].f1.toFixed(3).padStart(17)).join('')}${mean(series.map((s) => r[s.name].f1)).toFixed(3).padStart(10)}${mean(series.map((s) => r[s.name].cover)).toFixed(3).padStart(12)}${series.map((s) => r[s.name].cps.length).join('/').padStart(14)}`);
}
console.log('\nPer-column noise for the primary (sigma, omega; ml):');
for (const s of series) console.log(`  ${s.name}: ${ml.get(s.name).map((z, i) => `${s.names[i]} ${z.sigma.toPrecision(3)}, ${z.omega.toPrecision(3)}`).join('; ')}`);
console.log('\nChanges reported:');
for (const s of series) {
  const a = [...new Set(Object.values(ann[s.name]).flat())].sort((x, y) => x - y);
  console.log(`  ${s.name}: annotators ${a.join(' ')}`);
  for (const nm of Object.keys(SETTINGS)) { const c = res[nm][s.name].cps; console.log(`    ${nm}: ${c.length > 26 ? c.slice(0, 26).join(' ') + ' ...' : c.join(' ')}`); }
}
const p = mean(series.map((s) => res['joint drift (primary)'][s.name].f1)), b = mean(series.map((s) => res['joint level, floor auto (default)'][s.name].f1));
console.log(`\nRule, TCPD half: primary mean F1 ${p.toFixed(3)} vs joint level default ${b.toFixed(3)}: ${p > b ? 'passes' : 'fails'}.`);
console.error(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
