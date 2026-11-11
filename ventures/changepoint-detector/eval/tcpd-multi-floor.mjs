// A joint fit that survives smooth columns: a per-column noise floor and AR(1) correction inside the
// joint cost (flagship item a, 2026-11-11), scored on the three multi-dimensional TCPD series.
//
// Written and fixed before any of these settings was scored on these series:
//   - the six settings below; floor window 25 and k 2 copied from the univariate split-half winner
//     (README "A default chosen by split half"), the 'auto' trigger copied from the univariate over-cut
//     warning (5 or more cuts, the floor at least halves them); nothing tuned on apple, bee_waggle_6 or occupancy;
//   - primary: "joint level, floor auto";
//   - decision rule: the joint fit's default becomes 'auto' if (1) its mean F1 here beats the plain
//     joint level fit's and (2) in eval/multi-floor-sim.mjs it keeps every white-noise hit rate within
//     5 points of the plain joint fit's. Otherwise the floor ships as an option only.
//   - the column-by-column consensus stays the primary reading on the page whatever this shows: three
//     series is a panel, not a benchmark.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd-multi-floor.mjs tcpd-data > eval/tcpd-multi-floor.out.txt
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { multiPelt, columnConsensus, columnSigmas } from '../multivariate.mjs';
import { fMeasure, covering } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const pubF1 = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_f1_scores.json'), 'utf8'));
const MARGIN = 5;
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const r3 = (v) => (v == null ? '  -  ' : v.toFixed(3));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

const series = [];
for (const name of ['apple', 'bee_waggle_6', 'occupancy']) {
  const f = join(DIR, 'heldout', `${name}.json`);
  if (!existsSync(f)) throw new Error(`${f} missing: run sh eval/tcpd-fetch.sh ${DIR}`);
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const cols = j.series.map((s) => { let last = null; return s.raw.map((v) => { if (v == null || !Number.isFinite(Number(v))) return last; last = Number(v); return last; }); });
  series.push({ name, cols, names: j.series.map((s) => s.label), n: j.n_obs });
}

export const SETTINGS = {
  'joint level (before)': { model: 'mean' },
  'joint level, floor auto (primary)': { model: 'mean', floor: 'auto' },
  'joint level, floor 2 every column': { model: 'mean', floor: 2 },
  'joint level, floor 1 every column': { model: 'mean', floor: 1 },
  'joint level, ar1': { model: 'mean', ar1: true },
  'joint level, ar1 + floor 2': { model: 'mean', ar1: true, floor: 2 },
};
const res = {};
for (const [nm, o] of Object.entries(SETTINGS)) {
  res[nm] = {};
  for (const s of series) {
    const cps = clean(multiPelt(s.cols, o).changepoints, s.n);
    res[nm][s.name] = { cps, f1: fMeasure(ann[s.name], cps, MARGIN).F, cover: covering(ann[s.name], cps, s.n) };
  }
}
const cc = {};
for (const s of series) {
  const cps = clean(columnConsensus(s.cols, { names: s.names }).changes.map((c) => c.index), s.n);
  cc[s.name] = { cps, f1: fMeasure(ann[s.name], cps, MARGIN).F, cover: covering(ann[s.name], cps, s.n) };
}

console.log('TCPD multi-dimensional series, joint fit with per-column noise floor / AR(1). Settings, primary and decision rule fixed before scoring.');
console.log('F1 at margin 5 and segmentation cover (TCPDBench definitions); cuts = changes reported.');
console.log('');
const W = 40;
console.log(`${'setting'.padEnd(W)}${series.map((s) => `${s.name} F1`.padStart(16)).join('')}${'mean F1'.padStart(10)}${'mean cover'.padStart(12)}${'cuts'.padStart(16)}`);
const row = (nm, r) => {
  const f = series.map((s) => r[s.name].f1), c = series.map((s) => r[s.name].cover);
  console.log(`${nm.padEnd(W)}${f.map((x) => r3(x).padStart(16)).join('')}${r3(mean(f)).padStart(10)}${r3(mean(c)).padStart(12)}${series.map((s) => r[s.name].cps.length).join('/').padStart(16)}`);
};
for (const nm of Object.keys(SETTINGS)) row(nm, res[nm]);
row('columns: every setting (for reference)', cc);
for (const m of ['bocpd', 'ecp', 'zero']) console.log(`${`published ${m}`.padEnd(W)}${series.map((s) => r3(pubF1[s.name][m]).padStart(16)).join('')}${r3(mean(series.map((s) => pubF1[s.name][m]))).padStart(10)}`);
console.log('');
console.log('Which columns the auto floor raised (plain sd -> floored sd):');
for (const s of series) {
  const cs = columnSigmas(s.cols, { floor: 'auto' });
  console.log(`  ${s.name}: ${cs.map((c, i) => `${s.names[i]} ${c.floored ? `${c.base.toPrecision(3)} -> ${c.sigma.toPrecision(3)}` : 'kept'}`).join('; ')}`);
}
console.log('');
console.log('Changes reported (annotators, union):');
for (const s of series) {
  const u = [...new Set(Object.values(ann[s.name]).flat())].sort((a, b) => a - b);
  console.log(`  ${s.name}: annotators ${u.join(' ') || '(none)'}`);
  for (const nm of Object.keys(SETTINGS)) {
    const c = res[nm][s.name].cps;
    console.log(`    ${nm}: ${c.length} ${c.length > 25 ? `${c.slice(0, 25).join(' ')} ...` : c.join(' ')}`);
  }
}
