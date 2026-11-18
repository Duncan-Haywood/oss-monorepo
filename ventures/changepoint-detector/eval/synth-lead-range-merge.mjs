// Merge eval/synth-lead-range-sim.mjs shards: per cell, the p <= 0.05 share of each rule, the best lead's spread and
// the mean gap from the stated date on (signed; the effect cells' truth is -1).
//   node eval/synth-lead-range-merge.mjs part*.json > eval/synth-lead-range-confirm.out.txt
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const pct = (a, f) => (100 * a.filter(f).length / a.length).toFixed(1);
const col = (a, k) => (a.every((r) => r[k] == null) ? '-' : pct(a, (r) => r[k] <= 0.05 + 1e-12)); // '-': a shard written before the field existed
const mean = (a, f) => (a.reduce((s, r) => s + f(r), 0) / a.length).toFixed(3);
console.log('cell n    | p<=.05: stated  oracle  naive-min  min-p-range  mean  max-scaled  bonferroni  max | best lead 0/1/2/3/4 (%) | mean gap: stated / oracle / best');
for (const c of [...new Set(rows.map((r) => r.cell))]) {
  const a = rows.filter((r) => r.cell === c);
  const lead = [0, 1, 2, 3, 4].map((l) => pct(a, (r) => r.bestLead === l)).join('/');
  console.log(`${c}   ${String(a.length).padEnd(4)} | ${['p0', 'pOracle', 'naive', 'pRange', 'pMean', 'pMaxScaled', 'pBonf', 'maxP'].map((k) => `${col(a, k).padStart(5)}%`).join('  ')} | ${lead} | ${mean(a, (r) => r.gap0)} / ${mean(a, (r) => r.gapOracle)} / ${mean(a, (r) => r.gapBest)}`);
}
