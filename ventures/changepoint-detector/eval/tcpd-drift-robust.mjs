// Heavy tails on a drifting level: robust segment costs for `--model drift` (drift-level.mjs
// lossSpec, `--drift-loss`), against the shipped Gaussian cost, on the Turing Change Point Dataset.
//
// Written down 2026-11-11 before any TCPD series was run through a robust loss (the code had only
// been run on the unit tests' synthetic series and the committed Nile, GDP and residents files):
//   primary:   drift level, ML wander, biweight loss c = 3, penalty 2 log n, min segment 2;
//   secondary: biweight c = 4; Huber c = 1.345 (each ML wander, same penalty);
//   compared:  drift level, ML wander, Gaussian cost (the shipped `--model drift` default);
//              the level model following the over-cut warning; the consensus panel.
// Decision rule, fixed beforehand: the primary becomes `--model drift`'s default loss if its mean F1
// beats the Gaussian drift model on both the 31 shipped and the 7 held-out series; otherwise the
// losses ship as an opt-in `--drift-loss` with these numbers. The secondary settings are reported,
// not chosen from (choosing one now would be tuning on TCPD). No panel change this run whatever the
// result: the panel needs fresh labelled data (README "A step-robust omega").
// The question it answers: the flagship's open item "a heavy-tail check before choosing this model
// (bank, bitcoin)". So it also counts cuts on bank, bitcoin, ratner_stock and measles.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd-drift-robust.mjs tcpd-data > eval/tcpd-drift-robust.out.txt
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
  'drift, biweight 3 (primary)': drift({ noise: 'ml', loss: 'biweight', lossC: 3 }),
  'drift, biweight 4': drift({ noise: 'ml', loss: 'biweight', lossC: 4 }),
  'drift, Huber 1.345': drift({ noise: 'ml', loss: 'huber', lossC: 1.345 }),
  'drift, Gaussian (shipped)': drift({ noise: 'ml' }),
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
    if (nm.startsWith('drift, biweight 3')) driftMs += Date.now() - t;
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
const P = 'drift, biweight 3 (primary)';
for (const [label, set] of Object.entries(sets)) {
  console.log(`\nPaired F1, primary minus ..., ${label} (bootstrap over series, sign test):`);
  for (const [bn, b] of [['drift, Gaussian (shipped)', f('drift, Gaussian (shipped)')], ['drift, biweight 4', f('drift, biweight 4')], ['drift, Huber 1.345', f('drift, Huber 1.345')], ['level (default)', f('level (default)')], ['level following the warning', f('level, following the over-cut warning')], ['consensus every setting', f('consensus: every setting')], ['zero', zero], ['binseg', binseg]]) console.log(`  ${bn.padEnd(28)} ${paired(set, f(P), b)}`);
}

console.log('\nPer series: cuts and F1 for level+warning / Gaussian drift / Huber / biweight 4 / biweight 3 (primary); annotators\' median count.');
for (const [label, set] of Object.entries(sets)) {
  console.log(`  ${label}`);
  for (const s of set) {
    const counts = Object.values(ann[s.name]).map((a) => a.length).sort((x, y) => x - y);
    const med = counts[Math.floor(counts.length / 2)];
    const cell = (k) => `${String(res[k][s.name].cps.length).padStart(3)} ${r3(res[k][s.name].f1)}`;
    console.log(`    ${s.name.padEnd(22)} n ${String(s.n).padStart(4)}  warn ${cell('level, following the over-cut warning')}  gauss ${cell('drift, Gaussian (shipped)')}  huber ${cell('drift, Huber 1.345')}  bw4 ${cell('drift, biweight 4')}  bw3 ${cell(P)}  annotators ${med}  zero ${r3(zero(s))}`);
  }
}
const nAll = Object.values(sets).reduce((a, s) => a + s.length, 0);
console.log(`\nDrift biweight-3 run time over all ${nAll} series: ${driftMs} ms (about 20 O(n^2) fits a series; machine-dependent).`);

console.log('\nThe heavy-tail series of the open item (cuts; annotators mark none on bank):');
for (const nm of ['bank', 'bitcoin', 'ratner_stock', 'measles']) {
  const s = Object.values(sets).flat().find((v) => v.name === nm);
  if (!s) continue;
  console.log(`  ${nm.padEnd(14)} ` + ['drift, Gaussian (shipped)', 'drift, Huber 1.345', 'drift, biweight 4', P].map((k) => `${k.replace('drift, ', '')} ${res[k][nm].cps.length}`).join(', '));
}
