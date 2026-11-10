// A held-out check on the Turing Change Point Dataset series that TCPD does not ship in its
// repository (eval/tcpd-fetch.sh puts them in DIR/heldout after an md5 check against TCPD's
// checksums.json). Every setting scored here, the over-cut warning and its refit included,
// was fixed on the 31 shipped series (eval/tcpd.mjs, eval/tcpd-defaults.mjs) before any of
// these series was opened, so this is the first out-of-sample reading of those choices.
// The multi-dimensional series (apple, bee_waggle_6, occupancy) are scored in eval/tcpd-multi.mjs;
// here they are listed and left out, not scored on one column.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd-heldout.mjs tcpd-data > eval/tcpd-heldout.out.txt
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../engine.mjs';
import { consensus } from '../consensus.mjs';
import { fMeasure, covering } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const pubF1 = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_f1_scores.json'), 'utf8'));
const pubCov = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_cover_scores.json'), 'utf8'));
const MARGIN = 5;
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const r3 = (v) => (v == null ? '  -  ' : v.toFixed(3));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

const HD = join(DIR, 'heldout');
if (!existsSync(HD)) throw new Error(`${HD} missing: run sh eval/tcpd-fetch.sh ${DIR}`);
const series = [], multi = [];
for (const f of readdirSync(HD).filter((f) => f.endsWith('.json')).sort()) {
  const j = JSON.parse(readFileSync(join(HD, f), 'utf8'));
  const name = f.replace(/\.json$/, '');
  if (!ann[name]) continue;
  if (j.n_dim !== 1) { multi.push(`${name} (${j.n_dim} dims)`); continue; }
  let last = null, filled = 0;
  const values = j.series[0].raw.map((v) => {
    if (v == null || !Number.isFinite(Number(v))) { filled++; return last; }
    last = Number(v); return last;
  });
  if (values[0] == null) throw new Error(`${name}: first value missing`);
  series.push({ name, values, n: values.length, filled });
}
console.log(`TCPD held-out: ${series.length} univariate series TCPD does not ship (md5-checked against its checksums.json); not scored, multi-dimensional: ${multi.join(', ') || 'none'}.`);
console.log('Every setting below was fixed on the 31 shipped series before these were opened.');

// The settings, exactly as eval/tcpd.mjs and eval/tcpd-defaults.mjs define them.
const level = (opts = {}) => (s) => analyze({ values: s.values, ...opts }).pelt.changepoints.map((c) => c.index);
const cons = new Map(series.map((s) => [s.name, consensus({ values: s.values })]));
const fired = new Set(series.filter((s) => analyze({ values: s.values }).overcutWarning).map((s) => s.name));
const FLOOR = { noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 };
const SETTINGS = {
  'level (default)': level(),
  'level, following the over-cut warning': (s) => (fired.has(s.name) ? level(FLOOR)(s) : level()(s)),
  'noise floor 2, local 25 (always)': level(FLOOR),
  'level+volatility': level({ model: 'meanvar' }),
  'bocpd (default)': (s) => analyze({ values: s.values }).bocpd.detections.map((c) => c.index),
  'consensus: every setting': (s) => cons.get(s.name).changes.filter((c) => c.tier === 'all').map((c) => c.index),
  'consensus: half or more': (s) => cons.get(s.name).changes.filter((c) => c.tier !== 'few').map((c) => c.index),
};
const ours = {};
for (const [nm, fn] of Object.entries(SETTINGS)) {
  ours[nm] = {};
  for (const s of series) {
    const cps = clean(fn(s), s.n);
    ours[nm][s.name] = { cps, f1: fMeasure(ann[s.name], cps, MARGIN).F, cover: covering(ann[s.name], cps, s.n) };
  }
}

const rows = Object.entries(ours).map(([nm, per]) => ({ name: `* ${nm}`, f1: mean(series.map((s) => per[s.name].f1)), cover: mean(series.map((s) => per[s.name].cover)), n: series.length }));
for (const m of Object.keys(pubF1[series[0].name])) {
  rows.push({ name: `  ${m}`, f1: mean(series.map((s) => pubF1[s.name][m] ?? 0)), cover: mean(series.map((s) => pubCov[s.name][m] ?? 0)), n: series.filter((s) => pubF1[s.name][m] != null).length });
}
console.log(`\nMean over the ${series.length} held-out series (F1 margin ${MARGIN}; * = this detector; others: TCPDBench published default scores, a failed run counted as 0):`);
console.log('  setting                                  F1     cover  ran on');
for (const r of [...rows].sort((a, b) => b.f1 - a.f1)) console.log(`  ${r.name.padEnd(39)} ${r3(r.f1)}  ${r3(r.cover)}  ${r.n}`);

console.log(`\nOver-cut warning fires on ${fired.size} of ${series.length}: ${[...fired].join(', ') || 'none'}.`);
console.log('\nPer series: F1 (cover) and cuts.');
const show = ['level (default)', 'level, following the over-cut warning', 'bocpd (default)', 'consensus: every setting'];
for (const s of series) {
  const pub = Object.entries(pubF1[s.name]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  const short = { 'level (default)': 'level', 'level, following the over-cut warning': 'level+warn', 'bocpd (default)': 'bocpd', 'consensus: every setting': 'every' };
  const cells = show.map((k) => `${short[k]} ${r3(ours[k][s.name].f1)} (${r3(ours[k][s.name].cover)}) ${ours[k][s.name].cps.length}`);
  console.log(`  ${s.name.padEnd(16)} n ${String(s.n).padStart(3)}${s.filled ? ` (${s.filled} filled)` : ''}  ${cells.join('  ')}  best published ${pub[0][0]} ${r3(pub[0][1])}  zero ${r3(pubF1[s.name].zero)}${fired.has(s.name) ? '  [warning]' : ''}`);
}

// Paired differences over series, as in eval/tcpd-defaults.mjs (bootstrap over series, fixed seed; sign test).
let seed = 20261110;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const binom2 = (k, n) => {
  const c = (n, r) => { let v = 1; for (let i = 1; i <= r; i++) v = (v * (n - r + i)) / i; return v; };
  const lo = Math.min(k, n - k); let p = 0;
  for (let i = 0; i <= lo; i++) p += c(n, i) / 2 ** n;
  return Math.min(1, 2 * p);
};
const paired = (a, b) => {
  const d = series.map((s) => a(s) - b(s));
  const boots = [];
  for (let r = 0; r < 10000; r++) { let t = 0; for (let i = 0; i < d.length; i++) t += d[Math.floor(rnd() * d.length)]; boots.push(t / d.length); }
  boots.sort((x, y) => x - y);
  const pos = d.filter((v) => v > 1e-12).length, neg = d.filter((v) => v < -1e-12).length;
  return `mean ${mean(d) >= 0 ? '+' : ''}${r3(mean(d))} [95% ${r3(boots[249])}, ${r3(boots[9749])}]; better on ${pos}, worse on ${neg}, sign test p ${binom2(pos, pos + neg).toFixed(3)}`;
};
const f = (k) => (s) => ours[k][s.name].f1;
const zero = (s) => pubF1[s.name].zero, binseg = (s) => pubF1[s.name].binseg ?? 0;
console.log(`\nPaired F1 differences over the ${series.length} held-out series (few series: read the intervals, not the means):`);
for (const [a, b, bn] of [
  ['level, following the over-cut warning', f('level (default)'), 'level (default)'],
  ['level, following the over-cut warning', zero, 'zero'],
  ['bocpd (default)', zero, 'zero'],
  ['bocpd (default)', binseg, 'published binseg'],
  ['bocpd (default)', f('level, following the over-cut warning'), 'level following the warning'],
  ['consensus: every setting', zero, 'zero'],
]) console.log(`  ${a} minus ${bn}: ${paired(f(a), b)}`);

// Pooled with the 31 shipped series (in-sample for the choices above), for the headline figure.
const shipped = [];
for (const d of Object.keys(ann).filter((d) => existsSync(join(DIR, 'ds', `${d}.json`))).sort()) {
  const j = JSON.parse(readFileSync(join(DIR, 'ds', `${d}.json`), 'utf8'));
  if (j.n_dim !== 1) continue;
  let last = null;
  shipped.push({ name: d, n: j.n_obs, values: j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? last : (last = Number(v)))) });
}
if (shipped.length) {
  const all = [...shipped, ...series];
  for (const s of shipped) {
    cons.set(s.name, consensus({ values: s.values }));
    if (analyze({ values: s.values }).overcutWarning) fired.add(s.name);
  }
  console.log(`\nPooled, ${shipped.length} shipped + ${series.length} held-out = ${all.length} series, mean F1 / cover:`);
  const pooled = [];
  for (const [nm, fn] of Object.entries(SETTINGS)) {
    const sc = all.map((s) => { const cps = clean(fn(s), s.n); return [fMeasure(ann[s.name], cps, MARGIN).F, covering(ann[s.name], cps, s.n)]; });
    pooled.push([`* ${nm}`, mean(sc.map((x) => x[0])), mean(sc.map((x) => x[1]))]);
  }
  for (const m of ['binseg', 'pelt', 'bocpd', 'amoc', 'zero']) pooled.push([`  ${m}`, mean(all.map((s) => pubF1[s.name][m] ?? 0)), mean(all.map((s) => pubCov[s.name][m] ?? 0))]);
  for (const [nm, a, b] of pooled.sort((x, y) => y[1] - x[1])) console.log(`  ${nm.padEnd(39)} ${r3(a)}  ${r3(b)}`);
}
