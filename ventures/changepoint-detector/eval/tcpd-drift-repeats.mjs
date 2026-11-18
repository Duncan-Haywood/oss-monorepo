// Sticky series: the drift model with exact repeats dropped (drift-level.mjs, repeats 'drop'), with
// one global scale and with a scale per segment, against the shipped `--model drift`, on the Turing
// Change Point Dataset.
//
// Why: scale per segment cut bank 63 -> 170 and scanline_42049 27 -> 75 (eval/tcpd-drift-scale.out.txt)
// because both are sticky (246 of 580 and 233 of 480 steps exactly zero) and every flat run bought a
// low-scale segment. Written 2026-11-11 before repeats 'drop' was run on any TCPD series (seen: the
// scale-per-segment results above and a count of exact-zero steps per series; series with any zero
// steps: bank 246, children_per_woman 75, co2_canada 7, ratner_stock 138, scanline_126007 31,
// scanline_42049 233, measles 33, six others with 1 or 2):
//   primary S: drift, ML wander, scale per segment, repeats dropped, penalty 3 log n (original n);
//   primary R: drift, ML wander, one global scale, repeats dropped, penalty 2 log n (original n);
//   compared:  scale per segment without the drop, the shipped Gaussian drift, level following the
//              over-cut warning, consensus every setting.
// Decision rules: see eval/drift-repeats-sim.mjs (S: mean F1 no more than 0.02 below the shipped drift
// on both sets; R: no more than 0.01 below on both sets; each together with its synthetic parts).
// TCPD has been through many drift settings already, so this is a guard, not evidence of a gain.
// The iceland_tourism held-out loss of scale per segment (0.947 -> 0.643) has no repeats and is not
// expected to move.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd-drift-repeats.mjs tcpd-data > eval/tcpd-drift-repeats.out.txt
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
  'S: scale per segment, repeats drop': drift({ noise: 'ml', scale: 'segment', repeats: 'drop' }),
  'R: global scale, repeats drop': drift({ noise: 'ml', repeats: 'drop' }),
  'drift ML, scale per segment': drift({ noise: 'ml', scale: 'segment' }),
  'drift ML, Gaussian (shipped)': drift({ noise: 'ml' }),
  'level, following the over-cut warning': (s) => (analyze({ values: s.values }).overcutWarning ? level(FLOOR)(s) : level()(s)),
  'consensus: every setting': (s) => consensus({ values: s.values }).changes.filter((c) => c.tier === 'all').map((c) => c.index),
};

const P = 'S: scale per segment, repeats drop', PR = 'R: global scale, repeats drop';
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
  console.log(`\nPaired F1, ${label} (bootstrap over series, sign test):`);
  for (const [an, A, bn, B] of [['S', f(P), 'drift Gaussian (shipped)', f('drift ML, Gaussian (shipped)')], ['S', f(P), 'scale per segment, no drop', f('drift ML, scale per segment')], ['S', f(P), 'binseg', binseg], ['R', f(PR), 'drift Gaussian (shipped)', f('drift ML, Gaussian (shipped)')], ['R', f(PR), 'consensus every setting', f('consensus: every setting')]]) console.log(`  ${an} minus ${bn.padEnd(28)} ${paired(set, A, B)}`);
}

console.log('\nPer series: cuts and F1 for drift Gaussian (shipped) / R / scale per segment / S; exact repeats; annotators\' median count.');
for (const [label, set] of Object.entries(sets)) {
  console.log(`  ${label}`);
  for (const s of set) {
    const counts = Object.values(ann[s.name]).map((a) => a.length).sort((x, y) => x - y);
    const med = counts[Math.floor(counts.length / 2)];
    const cell = (k) => `${String(res[k][s.name].cps.length).padStart(3)} ${r3(res[k][s.name].f1)}`;
    const reps = s.values.filter((v, t) => t && v === s.values[t - 1]).length;
    console.log(`    ${s.name.padEnd(22)} n ${String(s.n).padStart(4)}  repeats ${String(reps).padStart(3)}  gauss ${cell('drift ML, Gaussian (shipped)')}  R ${cell(PR)}  scale ${cell('drift ML, scale per segment')}  S ${cell(P)}  annotators ${med}  zero ${r3(zero(s))}`);
  }
}
const nAll = Object.values(sets).reduce((a, s) => a + s.length, 0);
console.log(`\nPrimary S run time over all ${nAll} series: ${driftMs} ms (about 20 O(n^2) fits a series; machine-dependent).`);
