// Which fixed setting should the level model use by default? Each candidate below was
// written down before any of them was scored on TCPD (the list is in the README, "A
// default chosen by split half"). The choice is made on one half of the 31 series and
// scored on the other, both ways, with the same halves as eval/tcpd.mjs (alternate
// series in name order). A candidate earns the default only if, chosen on either half,
// it beats "no change" (zero) on the held-out half.
//
// usage: node eval/tcpd-defaults.mjs tcpd-data > eval/tcpd-defaults.out.txt
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../engine.mjs';
import { fMeasure, covering } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const pubF1 = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_f1_scores.json'), 'utf8'));
const pubCov = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_cover_scores.json'), 'utf8'));
const MARGIN = 5;
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const r3 = (v) => v.toFixed(3);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

const series = [];
for (const d of Object.keys(ann).filter((d) => existsSync(join(DIR, 'ds', `${d}.json`))).sort()) {
  const j = JSON.parse(readFileSync(join(DIR, 'ds', `${d}.json`), 'utf8'));
  if (j.n_dim !== 1) continue;
  let last = null;
  const values = j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? last : (last = Number(v))));
  series.push({ name: d, values, n: values.length });
}

const bic = (c) => (s) => c * 2 * Math.log(s.n); // the mean model's BIC (2 log n) times c
const lvl = (opts) => (s) => analyze({ values: s.values, ...(typeof opts === 'function' ? opts(s) : opts) }).pelt.changepoints.map((c) => c.index);
const CANDIDATES = {
  'level (current default)': lvl({}),
  'penalty 2x bic': lvl((s) => ({ penalty: bic(2)(s) })),
  'penalty 4x bic': lvl((s) => ({ penalty: bic(4)(s) })),
  'penalty 8x bic': lvl((s) => ({ penalty: bic(8)(s) })),
  'noise floor 1 (steps)': lvl({ noiseFloor: 1 }),
  'noise floor 2 (steps)': lvl({ noiseFloor: 2 }),
  'noise floor 1, 2nd diffs': lvl({ noiseFloor: 1, noiseFloorOrder: 2 }),
  'noise floor 2, local 25': lvl({ noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 }),
  'ar1 (long-run sd)': lvl({ ar1: true }),
  'ar1 joint': lvl({ ar1: 'joint' }),
  'ar1 + noise floor 2 local 25': lvl({ ar1: true, noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 }),
  'ar1 + min segment 10': lvl({ ar1: true, minSegment: 10 }),
  'bocpd detections': (s) => analyze({ values: s.values }).bocpd.detections.map((c) => c.index),
};

const res = {};
for (const [name, fn] of Object.entries(CANDIDATES)) {
  res[name] = {};
  for (const s of series) {
    let cps;
    try { cps = clean(fn(s), s.n); } catch (e) { cps = []; res[name].errors = (res[name].errors || 0) + 1; }
    res[name][s.name] = { f1: fMeasure(ann[s.name], cps, MARGIN).F, cover: covering(ann[s.name], cps, s.n), cuts: cps.length };
  }
}
const halves = [series.filter((_, i) => i % 2 === 0), series.filter((_, i) => i % 2 === 1)];
const sc = (name, set, k = 'f1') => mean(set.map((s) => res[name][s.name][k]));
const pub = (m, set, t = pubF1) => mean(set.map((s) => t[s.name][m] ?? 0));

console.log(`TCPD, ${series.length} univariate series; halves A ${halves[0].length}, B ${halves[1].length} (alternate in name order).`);
console.log('\n  candidate                         F1 A   F1 B   F1 all  cover all  total cuts  wins/ties/losses vs zero (F1)');
for (const name of Object.keys(CANDIDATES)) {
  let w = 0, t = 0, l = 0;
  for (const s of series) { const d = res[name][s.name].f1 - pubF1[s.name].zero; if (d > 1e-12) w++; else if (d < -1e-12) l++; else t++; }
  const cuts = series.reduce((a, s) => a + res[name][s.name].cuts, 0);
  console.log(`  ${name.padEnd(32)}  ${r3(sc(name, halves[0]))}  ${r3(sc(name, halves[1]))}  ${r3(sc(name, series))}   ${r3(sc(name, series, 'cover'))}      ${String(cuts).padStart(5)}      ${w}/${t}/${l}${res[name].errors ? `  (${res[name].errors} errors, scored as no cuts)` : ''}`);
}
for (const m of ['zero', 'binseg', 'pelt', 'bocpd']) console.log(`  ${('published ' + m).padEnd(32)}  ${r3(pub(m, halves[0]))}  ${r3(pub(m, halves[1]))}  ${r3(pub(m, series))}   ${r3(pub(m, series, pubCov))}`);

console.log('\nChosen on one half (best F1 among the level-model candidates, BOCPD left out: it is a different output), scored on the other:');
const levelNames = Object.keys(CANDIDATES).filter((n) => n !== 'bocpd detections');
for (const [tr, te, nm] of [[0, 1, 'A -> B'], [1, 0, 'B -> A']]) {
  const best = levelNames.reduce((b, n) => (sc(n, halves[tr]) > sc(b, halves[tr]) ? n : b));
  console.log(`  ${nm}: "${best}" (F1 ${r3(sc(best, halves[tr]))} on its own half); held out F1 ${r3(sc(best, halves[te]))}, cover ${r3(sc(best, halves[te], 'cover'))}; zero ${r3(pub('zero', halves[te]))}, binseg ${r3(pub('binseg', halves[te]))}, current default ${r3(sc('level (current default)', halves[te]))}`);
}

// Paired differences over series (per-series F1), with a percentile bootstrap over series
// (10,000 resamples, fixed seed) and a two-sided sign test. 31 series is a small sample.
let seed = 20261110;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const binom2 = (k, n) => { // two-sided sign test p
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
const f = (name) => (s) => res[name][s.name].f1;
const zero = (s) => pubF1[s.name].zero, binseg = (s) => pubF1[s.name].binseg ?? 0;
console.log('\nPaired F1 differences over the 31 series:');
for (const [a, b, bn] of [
  ['noise floor 2, local 25', f('level (current default)'), 'current default'],
  ['noise floor 2, local 25', zero, 'zero'],
  ['ar1 + noise floor 2 local 25', zero, 'zero'],
  ['bocpd detections', zero, 'zero'],
  ['bocpd detections', binseg, 'published binseg'],
]) console.log(`  ${a} minus ${bn}: ${paired(f(a), b)}`);

// The over-cut warning (engine.mjs, overcutWarning): on which series does the plain level model raise it,
// and does following it (the noise floor 2, local 25 refit) help there and only there?
const fired = series.filter((s) => analyze({ values: s.values }).overcutWarning);
const quiet = series.filter((s) => !fired.includes(s));
const nf = 'noise floor 2, local 25', cur = 'level (current default)';
console.log(`\nOver-cut warning: fires on ${fired.length} of ${series.length} series (${fired.map((s) => s.name).join(', ')}).`);
for (const [set, nm] of [[fired, 'where it fires'], [quiet, 'where it does not']]) {
  if (!set.length) continue;
  console.log(`  ${nm} (${set.length}): F1 current default ${r3(sc(cur, set))}, following the warning ${r3(sc(nf, set))}, zero ${r3(pub('zero', set))}, binseg ${r3(pub('binseg', set))}`);
}
const follow = (s) => (fired.includes(s) ? res[nf][s.name].f1 : res[cur][s.name].f1);
console.log(`  default, following the warning where it fires: F1 ${r3(mean(series.map(follow)))} over all ${series.length}; minus current default: ${paired(follow, f(cur))}`);
