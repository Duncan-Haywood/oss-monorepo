// The drift-level model (drift-level.mjs: jumps on a random-walk level, DeCAFS with phi = 0) on
// the Turing Change Point Dataset: the 31 shipped univariate series and the 7 held-out ones.
//
// Written down before any TCPD series was run through the new model (2026-11-11):
//   primary:   drift level, penalty 2 log n (the plain level model's BIC), min segment 2,
//              sigma and omega from lag-1..10 robust difference variances;
//   secondary: the same with penalty 4 log n; the same with min segment 5.
// The decision rule, also fixed beforehand: the primary setting is worth offering if it beats the
// plain level model on both sets; it is worth a place in the default panel only if it also beats
// the level model following the over-cut warning on both sets. Nothing below was tuned on TCPD.
// Added after that first scoring, so in-sample and labelled post hoc: the same with the series'
// median first difference taken out first (slope: true), prompted by Australian residents (a steady
// growth, not a TCPD series) still giving 31 cuts.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd-drift.mjs tcpd-data > eval/tcpd-drift.out.txt
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
  'drift level, 2 log n (primary)': drift(),
  'drift level, 4 log n': drift({ penaltyPerLogN: 4 }),
  'drift level, min segment 5': drift({ minSegment: 5 }),
  'drift level + median slope (post hoc)': drift({ slope: true }),
  'level (default)': level(),
  'level, following the over-cut warning': (s) => (analyze({ values: s.values }).overcutWarning ? level(FLOOR)(s) : level()(s)),
  'consensus: every setting': (s) => consensus({ values: s.values }).changes.filter((c) => c.tier === 'all').map((c) => c.index),
};

const res = {};
const t0 = Date.now();
let driftMs = 0;
for (const [nm, fn] of Object.entries(SETTINGS)) {
  res[nm] = {};
  for (const set of Object.values(sets)) for (const s of set) {
    const t = Date.now();
    const cps = clean(fn(s), s.n);
    if (nm.startsWith('drift level, 2')) driftMs += Date.now() - t;
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
const P = 'drift level, 2 log n (primary)';
for (const [label, set] of Object.entries(sets)) {
  console.log(`\nPaired F1, primary minus ..., ${label} (bootstrap over series, sign test):`);
  for (const [bn, b] of [['level (default)', f('level (default)')], ['level following the warning', f('level, following the over-cut warning')], ['consensus every setting', f('consensus: every setting')], ['zero', zero], ['binseg', binseg]]) console.log(`  ${bn.padEnd(28)} ${paired(set, f(P), b)}`);
}

console.log('\nPer series: cuts and F1 for level / level+warning / drift primary; annotators\' median count.');
for (const [label, set] of Object.entries(sets)) {
  console.log(`  ${label}`);
  for (const s of set) {
    const counts = Object.values(ann[s.name]).map((a) => a.length).sort((x, y) => x - y);
    const med = counts[Math.floor(counts.length / 2)];
    const cell = (k) => `${String(res[k][s.name].cps.length).padStart(3)} ${r3(res[k][s.name].f1)}`;
    console.log(`    ${s.name.padEnd(22)} n ${String(s.n).padStart(4)}  level ${cell('level (default)')}  warn ${cell('level, following the over-cut warning')}  drift ${cell(P)}  annotators ${med}  zero ${r3(zero(s))}`);
  }
}
const nAll = Object.values(sets).reduce((a, s) => a + s.length, 0);
console.log(`\nDrift primary run time over all ${nAll} series: ${driftMs} ms (exact O(n^2) partitioning; machine-dependent).`);
