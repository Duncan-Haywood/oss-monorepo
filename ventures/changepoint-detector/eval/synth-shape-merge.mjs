// Merge eval/synth-shape-sim.mjs shards: per cell, the p <= 0.05 share overall, how often each covariate's placebo
// warning fires, and the p <= 0.05 share and mean |gap| (average after the date, and at the last point; all bias: no
// true effect) for panels Z warned vs not, and for W warned alone vs neither warned.
//   node eval/synth-shape-merge.mjs part*.json > eval/synth-shape-confirm.out.txt
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const sig = (r) => r.p <= 0.05 + 1e-12;
const pct = (a, f) => (a.length ? (100 * a.filter(f).length / a.length).toFixed(1) : '-');
const mabs = (a, k = 'bias') => (a.length ? (a.reduce((s, r) => s + Math.abs(r[k]), 0) / a.length).toFixed(3) : '-');
console.log('cell n    p<=.05  Z warns  W warns | p<=.05: Z warned / not | mean |bias|: Z warned / not | |bias at end|: Z warned / not | p<=.05: W alone / neither | |bias|: W alone / neither');
for (const c of [...new Set(rows.map((r) => r.cell))]) {
  const a = rows.filter((r) => r.cell === c);
  const zw = a.filter((r) => r.zWarn), zn = a.filter((r) => !r.zWarn), wo = a.filter((r) => r.wWarn && !r.zWarn), ne = a.filter((r) => !r.zWarn && !r.wWarn);
  console.log(`${c}   ${String(a.length).padEnd(4)} ${pct(a, sig).padStart(5)}%  ${pct(a, (r) => r.zWarn).padStart(6)}%  ${pct(a, (r) => r.wWarn).padStart(6)}% | ${pct(zw, sig).padStart(5)} (${zw.length}) / ${pct(zn, sig).padStart(5)} (${zn.length}) | ${mabs(zw)} / ${mabs(zn)} | ${mabs(zw, 'biasEnd')} / ${mabs(zn, 'biasEnd')} | ${pct(wo, sig).padStart(5)} (${wo.length}) / ${pct(ne, sig).padStart(5)} (${ne.length}) | ${mabs(wo)} / ${mabs(ne)}`);
}
