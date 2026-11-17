// Volatility on a drifting level: the drift model with a scale per segment (drift-level.mjs,
// scale 'segment') against the shipped `--model drift` (one global scale), on the Turing Change
// Point Dataset.
//
// Why: `--model drift` reads volatility bursts as runs of jumps (bank 63 cuts where annotators mark
// none, bitcoin 52, apple's volume 30 in several-columns mode; README "Heavy tails on a drifting
// level", "The drift model on several columns"). Written 2026-11-11 before any TCPD series was run
// through scale 'segment' (only eval/drift-scale-sim.mjs had been run):
//   primary:   drift, ML wander profiled under the per-segment-scale cost, penalty 3 log n (a level
//              and a scale per change), min segment 2;
//   secondary: the same with min segment 5; the same with penalty 2 log n. Reported, not chosen.
//   compared:  the shipped Gaussian drift (ML wander, 2 log n), level following the over-cut
//              warning, consensus every setting.
// Decision rule (with eval/drift-scale-sim.mjs, whose header states parts i and ii): (iii) the
// primary's mean F1 is no more than 0.02 below the shipped drift on both the 31 shipped and the 7
// held-out series. TCPD has been through many drift settings already (tcpd-drift*.mjs), so this is
// a guard, not evidence of a gain; `--model drift`'s default and the consensus panel do not change.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd-drift-scale.mjs tcpd-data > eval/tcpd-drift-scale.out.txt
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../engine.mjs';
import { consensus } from '../consensus.mjs';
import { driftLevelChanges } from '../drift-level.mjs';
import { fMeasure, covering } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const pubF1 = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_f1_scores.json'), 'utf8'));
const pubCov = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_cover_scores.json'), 'utf8'));
const MARGIN = 5;
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const r3 = (v) => v.toFixed(3);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

function load(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const name = f.replace(/\.json$/, '');
    if (!ann[name]) continue;
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (j.n_dim !== 1) continue;
    let last = null;
    const values = j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? last : (last = Number(v))));
    out.push({ name, values, n: values.length });
  }
  return out;
}
const sets = { 'shipped (31)': load(join(DIR, 'ds')), 'held out (7)': load(join(DIR, 'heldout')) };
if (!sets['held out (7)'].length) throw new Error(`no held-out series: run sh eval/tcpd-fetch.sh ${DIR}`);

const FLOOR = { noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 };
const level = (opts = {}) => (s) => analyze({ values: s.values, ...opts }).pelt.changepoints.map((c) => c.index);
const drift = (opts = {}) => (s) => driftLevelChanges(s.values, { ...opts, penalty: opts.penaltyPerLogN ? opts.penaltyPerLogN * Math.log(s.n) : undefined }).changepoints;
const SETTINGS = {
  'drift ML, scale per segment (primary)': drift({ noise: 'ml', scale: 'segment' }),
  'drift ML, scale per segment, min seg 5': drift({ noise: 'ml', scale: 'segment', minSegment: 5 }),
  'drift ML, scale per segment, 2 log n': drift({ noise: 'ml', scale: 'segment', penaltyPerLogN: 2 }),
  'drift ML, Gaussian (shipped)': drift({ noise: 'ml' }),
  'level, following the over-cut warning': (s) => (analyze({ values: s.values }).overcutWarning ? level(FLOOR)(s) : level()(s)),
  'consensus: every setting': (s) => consensus({ values: s.values }).changes.filter((c) => c.tier === 'all').map((c) => c.index),
};

const P = 'drift ML, scale per segment (primary)';
const res = {};
const t0 = Date.now();
let driftMs = 0;
for (const [nm, fn] of Object.entries(SETTINGS)) {
  res[nm] = {};
  for (const set of Object.values(sets)) for (const s of set) {
    const t = Date.now();
    const cps = clean(fn(s), s.n);
    if (nm === P) driftMs += Date.now() - t;
    res[nm][s.name] = { cps, f1: fMeasure(ann[s.name], cps, MARGIN).F, cover: covering(ann[s.name], cps, s.n) };
  }
}

for (const [label, set] of Object.entries(sets)) {
  console.log(`\nTCPD ${label}: mean F1 / cover / total cuts (margin ${MARGIN}; * = this detector, others TCPDBench published defaults)`);
  const rows = Object.keys(SETTINGS).map((nm) => [`* ${nm}`, mean(set.map((s) => res[nm][s.name].f1)), mean(set.map((s) => res[nm][s.name].cover)), set.reduce((a, s) => a + res[nm][s.name].cps.length, 0)]);
  for (const m of ['binseg', 'pelt', 'bocpd', 'zero']) rows.push([`  ${m} (published)`, mean(set.map((s) => pubF1[s.name][m] ?? 0)), mean(set.map((s) => pubCov[s.name][m] ?? 0)), null]);
  for (const [nm, f, c, k] of rows.sort((a, b) => b[1] - a[1])) console.log(`  ${nm.padEnd(42)} ${r3(f)}  ${r3(c)}  ${k == null ? '' : String(k).padStart(5)}`);
}

let seed = 20261111;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const binom2 = (k, n) => {
  const c = (n, r) => { let v = 1; for (let i = 1; i <= r; i++) v = (v * (n - r + i)) / i; return v; };
  const lo = Math.min(k, n - k); let p = 0;
  for (let i = 0; i <= lo; i++) p += c(n, i) / 2 ** n;
  return Math.min(1, 2 * p);
};
const paired = (set, a, b) => {
  const d = set.map((s) => a(s) - b(s));
  const boots = [];
  for (let r = 0; r < 10000; r++) { let t = 0; for (let i = 0; i < d.length; i++) t += d[Math.floor(rnd() * d.length)]; boots.push(t / d.length); }
  boots.sort((x, y) => x - y);
  const pos = d.filter((v) => v > 1e-12).length, neg = d.filter((v) => v < -1e-12).length;
  return `${mean(d) >= 0 ? '+' : ''}${r3(mean(d))} [95% ${r3(boots[249])}, ${r3(boots[9749])}]; better on ${pos}, worse on ${neg}, sign p ${binom2(pos, pos + neg).toFixed(3)}`;
};
const f = (k) => (s) => res[k][s.name].f1;
const zero = (s) => pubF1[s.name].zero, binseg = (s) => pubF1[s.name].binseg ?? 0;
for (const [label, set] of Object.entries(sets)) {
  console.log(`\nPaired F1, primary minus ..., ${label} (bootstrap over series, sign test):`);
  for (const [bn, b] of [['drift Gaussian (shipped)', f('drift ML, Gaussian (shipped)')], ['scale, min seg 5', f('drift ML, scale per segment, min seg 5')], ['scale, 2 log n', f('drift ML, scale per segment, 2 log n')], ['level following the warning', f('level, following the over-cut warning')], ['consensus every setting', f('consensus: every setting')], ['zero', zero], ['binseg', binseg]]) console.log(`  ${bn.padEnd(28)} ${paired(set, f(P), b)}`);
}

console.log('\nPer series: cuts and F1 for level+warning / drift Gaussian / scale per segment, min seg 5 / scale per segment (primary); annotators\' median count.');
for (const [label, set] of Object.entries(sets)) {
  console.log(`  ${label}`);
  for (const s of set) {
    const counts = Object.values(ann[s.name]).map((a) => a.length).sort((x, y) => x - y);
    const med = counts[Math.floor(counts.length / 2)];
    const cell = (k) => `${String(res[k][s.name].cps.length).padStart(3)} ${r3(res[k][s.name].f1)}`;
    console.log(`    ${s.name.padEnd(22)} n ${String(s.n).padStart(4)}  warn ${cell('level, following the over-cut warning')}  gauss ${cell('drift ML, Gaussian (shipped)')}  seg5 ${cell('drift ML, scale per segment, min seg 5')}  scale ${cell(P)}  annotators ${med}  zero ${r3(zero(s))}`);
  }
}
const nAll = Object.values(sets).reduce((a, s) => a + s.length, 0);
console.log(`\nPrimary run time over all ${nAll} series: ${driftMs} ms (about 20 O(n^2) fits a series; machine-dependent).`);
