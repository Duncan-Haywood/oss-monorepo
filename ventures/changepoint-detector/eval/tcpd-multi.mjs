// The three multi-dimensional Turing Change Point Dataset series (apple: close and volume;
// bee_waggle_6: x, y, sin and cos of the heading; occupancy: four room sensors), which every
// earlier TCPD script left out because the detector was univariate. eval/tcpd-fetch.sh puts
// them in DIR/heldout after the md5 check against TCPD's checksums.json.
//
// Written and fixed before any of these series was scored (2026-11-10, flagship item a):
//   - the settings below, the primary one, and the tolerance (the consensus default, 2% of n);
//   - no per-series option, no log, no column chosen or dropped by name;
//   - primary: "columns: every setting", each column's every-setting consensus (the univariate
//     default that scored best held out, consensus.mjs TCPD_HELDOUT) merged across columns.
// Three series is a panel, not a benchmark: the mean F1 here can swing by a third on one series.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd-multi.mjs tcpd-data > eval/tcpd-multi.out.txt
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { multiPelt, columnConsensus } from '../multivariate.mjs';
import { fMeasure, covering } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const pubF1 = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_f1_scores.json'), 'utf8'));
const pubCov = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_cover_scores.json'), 'utf8'));
const MARGIN = 5;
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const r3 = (v) => (v == null ? '  -  ' : v.toFixed(3));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

const series = [];
for (const name of ['apple', 'bee_waggle_6', 'occupancy']) {
  const f = join(DIR, 'heldout', `${name}.json`);
  if (!existsSync(f)) throw new Error(`${f} missing: run sh eval/tcpd-fetch.sh ${DIR}`);
  const j = JSON.parse(readFileSync(f, 'utf8'));
  let filled = 0;
  const cols = j.series.map((s) => {
    let last = null;
    return s.raw.map((v) => {
      if (v == null || !Number.isFinite(Number(v))) { filled++; return last; }
      last = Number(v); return last;
    });
  });
  if (cols.some((c) => c[0] == null)) throw new Error(`${name}: first value missing`);
  series.push({ name, cols, names: j.series.map((s) => s.label), n: j.n_obs, filled });
}

const cc = new Map(series.map((s) => [s.name, columnConsensus(s.cols, { names: s.names })]));
const SETTINGS = {
  'columns: every setting (primary)': (s) => cc.get(s.name).changes.map((c) => c.index),
  'columns: every setting, half the columns': (s) => cc.get(s.name).changes.filter((c) => c.support >= Math.ceil(c.of / 2)).map((c) => c.index),
  'joint level': (s) => multiPelt(s.cols, { model: 'mean' }).changepoints,
  'joint level+volatility': (s) => multiPelt(s.cols, { model: 'meanvar' }).changepoints,
};
const ours = {};
for (const [nm, fn] of Object.entries(SETTINGS)) {
  ours[nm] = {};
  for (const s of series) {
    const cps = clean(fn(s), s.n);
    ours[nm][s.name] = { cps, f1: fMeasure(ann[s.name], cps, MARGIN).F, cover: covering(ann[s.name], cps, s.n) };
  }
}

console.log(`TCPD multi-dimensional: ${series.map((s) => `${s.name} (${s.n} x ${s.cols.length}: ${s.names.join(', ')}${s.filled ? `; ${s.filled} filled` : ''})`).join('; ')}.`);
console.log('Settings, primary and tolerance fixed before these series were scored. F1 at margin 5 and segmentation cover, TCPDBench definitions.');
console.log('');
const PUB = ['bocpd', 'bocpdms', 'rbocpdms', 'ecp', 'kcpa', 'zero']; // the TCPDBench default methods that run on several dimensions
const rows = [
  ...Object.keys(SETTINGS).map((nm) => ({ nm, f1: (s) => ours[nm][s.name].f1, cov: (s) => ours[nm][s.name].cover })),
  ...PUB.map((m) => ({ nm: `published ${m}`, f1: (s) => pubF1[s.name][m], cov: (s) => pubCov[s.name][m] })),
];
const W = 44;
console.log(`${'F1'.padEnd(W)}${series.map((s) => s.name.padStart(14)).join('')}${'mean'.padStart(10)}`);
for (const r of rows) {
  const v = series.map(r.f1);
  console.log(`${r.nm.padEnd(W)}${v.map((x) => r3(x).padStart(14)).join('')}${(v.some((x) => x == null) ? '  -  ' : r3(mean(v))).padStart(10)}`);
}
console.log('');
console.log(`${'cover'.padEnd(W)}${series.map((s) => s.name.padStart(14)).join('')}${'mean'.padStart(10)}`);
for (const r of rows) {
  const v = series.map(r.cov);
  console.log(`${r.nm.padEnd(W)}${v.map((x) => r3(x).padStart(14)).join('')}${(v.some((x) => x == null) ? '  -  ' : r3(mean(v))).padStart(10)}`);
}
console.log('');
console.log('Changes reported (annotators, union):');
for (const s of series) {
  const u = [...new Set(Object.values(ann[s.name]).flat())].sort((a, b) => a - b);
  console.log(`  ${s.name}: annotators ${u.join(' ') || '(none)'}`);
  for (const nm of Object.keys(SETTINGS)) {
    const c = ours[nm][s.name].cps;
    console.log(`    ${nm}: ${c.length} ${c.length > 25 ? `${c.slice(0, 25).join(' ')} ...` : c.join(' ')}`);
  }
  for (const p of cc.get(s.name).perColumn) console.log(`    column ${p.column}: ${p.changes.length} every-setting change${p.changes.length === 1 ? '' : 's'}`);
}
