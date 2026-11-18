// Post hoc, in-sample: the heavy-tail check (drift-level.mjs driftTailCheck) on the Turing Change
// Point Dataset, after eval/tcpd-drift-robust.mjs (pre-registered) had failed. Which series the check
// flags as 'walk' or 'noise', drift F1 on each group, and a rule chosen after seeing that run:
// biweight cost when the check says 'noise', Gaussian otherwise. The kurtosis bar (6) was also set
// after looking at TCPD, so none of this is evidence for a default; it is a lead for fresh data.
//
// usage: node eval/tcpd-drift-tails.mjs tcpd-data > eval/tcpd-drift-tails.out.txt
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { driftLevelChanges, driftTailCheck } from '../drift-level.mjs';
import { fMeasure } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const pubF1 = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_f1_scores.json'), 'utf8'));
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const series = [];
for (const [set, sub] of [['shipped', 'ds'], ['held out', 'heldout']]) {
  const dir = join(DIR, sub);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const name = f.replace(/\.json$/, '');
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (!ann[name] || j.n_dim !== 1) continue;
    let last = null;
    const values = j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? last : (last = Number(v))));
    series.push({ name, set, values, n: values.length });
  }
}
const f1 = (s, cps) => fMeasure(ann[s.name], clean(cps, s.n), 5).F;
const rows = series.map((s) => {
  const chk = driftTailCheck(s.values);
  const g = driftLevelChanges(s.values, { noise: 'ml' }).changepoints;
  const b = driftLevelChanges(s.values, { noise: 'ml', loss: 'biweight' }).changepoints;
  const auto = chk.kind === 'noise' ? b : g;
  return { ...s, kind: chk.kind ?? '-', k: chk.stepKurtosis, share: chk.noiseShare, gF: f1(s, g), bF: f1(s, b), aF: f1(s, auto), zF: pubF1[s.name].zero, gN: g.length, bN: b.length };
});
console.log('series               set       check  step kurtosis  noise share   gauss cuts F1    biweight cuts F1   zero F1');
for (const r of rows) console.log(`${r.name.padEnd(20)} ${r.set.padEnd(9)} ${r.kind.padEnd(6)} ${(r.k == null ? "n<20" : r.k.toFixed(1)).padStart(8)}  ${(r.share == null ? "-" : r.share.toFixed(3)).padStart(10)}  ${String(r.gN).padStart(9)} ${r.gF.toFixed(3)}  ${String(r.bN).padStart(9)} ${r.bF.toFixed(3)}  ${r.zF.toFixed(3)}`);
for (const kind of ['walk', 'noise', '-']) {
  const g = rows.filter((r) => r.kind === kind);
  console.log(`\ncheck '${kind}': ${g.length} series; mean F1 gauss ${mean(g.map((r) => r.gF)).toFixed(3)}, biweight ${mean(g.map((r) => r.bF)).toFixed(3)}, reporting nothing ${mean(g.map((r) => r.zF)).toFixed(3)}`);
}
for (const set of ['shipped', 'held out']) {
  const g = rows.filter((r) => r.set === set);
  console.log(`\n${set} (${g.length}): mean F1 gauss ${mean(g.map((r) => r.gF)).toFixed(3)}, biweight everywhere ${mean(g.map((r) => r.bF)).toFixed(3)}, biweight where the check says noise ${mean(g.map((r) => r.aF)).toFixed(3)} (post hoc)`);
}
