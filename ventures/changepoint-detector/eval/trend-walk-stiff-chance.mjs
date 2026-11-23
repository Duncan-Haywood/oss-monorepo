// Post hoc (written after eval/trend-walk-stiff.mjs ran; not a bar, changes nothing): how much of the
// stiff walk's NBER gain is its cut count? For each NBER-labelled series, the F1 of the same number of
// cuts placed uniformly at random (2,000 draws, fixed seed), beside each model's F1. A model whose F1
// is no better than its own count of random cuts is not finding the turning points.
//
// usage: node eval/trend-walk-stiff-chance.mjs > eval/trend-walk-stiff-chance.out.txt
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { driftLevelChanges } from '../drift-level.mjs';
import { trendWalkChanges } from '../drift-trend.mjs';
import { fMeasure } from './tcpd-metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAP = 3e-4, MARGIN = 5, DRAWS = 2000;
const r3 = (v) => v.toFixed(3);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const rows = (f) => readFileSync(join(ROOT, 'data', f), 'utf8').trim().split('\n').map((l) => l.split(','));
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const turns = [];
for (const [a, b] of rows('nber-recessions.csv').slice(1)) {
  let [y, m] = a.split('-').map(Number); m -= 1; if (m === 0) { m = 12; y -= 1; }
  turns.push({ y, m });
  const [y2, m2] = b.split('-').map(Number);
  turns.push({ y: y2, m: m2 });
}
const qs = (lab) => { const [y, q] = lab.split('Q').map(Number); return [y, 3 * (q - 1) + 1]; };
const ms = (lab) => lab.split('-').map(Number);
const SETS = [
  ['F', 'industrial production monthly', 'us-industrial-production-monthly.csv', 'production', 1, ms],
  ['F', 'industrial production quarterly', 'us-industrial-production-quarterly.csv', 'adjusted', 3, qs],
  ['F', 'persons unemployed monthly', 'us-unemployed-monthly.csv', 'unemploy', 1, ms],
  ...['realgdp', 'realcons', 'realinv', 'realdpi', 'unemp'].map((c) => ['7', `macrodata ${c}`, 'us-macro-quarterly.csv', c, 3, qs]),
  ['7', 'us-real-gdp', 'us-real-gdp.csv', 'real_gdp', 3, qs],
  ['7', 'us-unemployment-duration', 'us-unemployment-duration.csv', 'uempmed', 1, ms],
];
const u = rng(20261123);
function chance(n, k, ann) {
  const f = [];
  for (let d = 0; d < DRAWS; d++) {
    const s = new Set();
    while (s.size < Math.min(k, n - 2)) s.add(1 + Math.floor(u() * (n - 2)));
    f.push(fMeasure(ann, [...s].sort((a, b) => a - b), MARGIN).F);
  }
  return mean(f);
}
console.log(`F1 of each model beside the mean F1 of the same number of uniformly random cuts (${DRAWS} draws), NBER labels, margin 5`);
const out = [];
for (const [set, name, file, col, per, start] of SETS) {
  const r = rows(file), i = r[0].indexOf(col);
  const label = r.slice(1).map((x) => x[0]), x = r.slice(1).map((v) => Number(v[i])), n = x.length;
  const [y0, m0] = start(label[0]);
  const labels = [...new Set(turns.map((t) => Math.floor(((t.y - y0) * 12 + (t.m - m0)) / per)))].filter((c) => c >= 1 && c <= n - 2);
  const ann = { nber: labels };
  const cs = clean(driftLevelChanges(x, { noise: 'ml' }).changepoints, n), ct = clean(trendWalkChanges(x, { qzMax: CAP }).changepoints, n);
  const fs = fMeasure(ann, cs, MARGIN).F, ft = fMeasure(ann, ct, MARGIN).F;
  const rs = chance(n, cs.length, ann), rt = chance(n, ct.length, ann);
  out.push({ set, fs, ft, rs, rt });
  console.log(`  [${set}] ${name.padEnd(32)} shipped ${String(cs.length).padStart(2)} cuts F1 ${r3(fs)} (random ${r3(rs)}, excess ${fs - rs >= 0 ? '+' : ''}${r3(fs - rs)})  stiff ${String(ct.length).padStart(2)} cuts F1 ${r3(ft)} (random ${r3(rt)}, excess ${ft - rt >= 0 ? '+' : ''}${r3(ft - rt)})`);
}
for (const s of ['F', '7', 'all']) {
  const o = out.filter((r) => s === 'all' || r.set === s);
  console.log(`  ${s === 'F' ? 'fresh set F' : s === '7' ? 'NBER seven' : 'all ten'}: shipped excess over random ${r3(mean(o.map((r) => r.fs - r.rs)))}, stiff excess ${r3(mean(o.map((r) => r.ft - r.rt)))}; stiff beats its random baseline on ${o.filter((r) => r.ft > r.rt).length} of ${o.length}, shipped on ${o.filter((r) => r.fs > r.rs).length} of ${o.length}`);
}
