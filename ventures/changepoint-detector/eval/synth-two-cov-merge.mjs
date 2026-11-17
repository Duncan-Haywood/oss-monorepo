// Merge eval/synth-two-cov-sim.mjs shards: per cell, how often each covariate's placebo warning fires, and the p <= 0.05
// share and mean |gap| (all bias: no true effect) in four groups: Z warned (with or without W), W warned alone, neither.
//   node eval/synth-two-cov-merge.mjs part*.json > eval/synth-two-cov-confirm.out.txt
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const sig = (r) => r.p <= 0.05 + 1e-12;
const pct = (a, f) => (a.length ? (100 * a.filter(f).length / a.length).toFixed(1) : '-');
const mabs = (a) => (a.length ? (a.reduce((s, r) => s + Math.abs(r.bias), 0) / a.length).toFixed(3) : '-');
console.log('cell n    Z warns  W warns  both | p<=.05: Z warned / W alone / neither | mean |bias|: Z warned / W alone / neither');
for (const c of [...new Set(rows.map((r) => r.cell))]) {
  const a = rows.filter((r) => r.cell === c);
  const zw = a.filter((r) => r.zWarn), wo = a.filter((r) => r.wWarn && !r.zWarn), ne = a.filter((r) => !r.zWarn && !r.wWarn);
  console.log(`${c}   ${String(a.length).padEnd(4)} ${pct(a, (r) => r.zWarn).padStart(6)}%  ${pct(a, (r) => r.wWarn).padStart(6)}%  ${pct(a, (r) => r.zWarn && r.wWarn).padStart(4)}% | ${pct(zw, sig).padStart(5)} (${zw.length}) / ${pct(wo, sig).padStart(5)} (${wo.length}) / ${pct(ne, sig).padStart(5)} (${ne.length}) | ${mabs(zw)} / ${mabs(wo)} / ${mabs(ne)}`);
}
