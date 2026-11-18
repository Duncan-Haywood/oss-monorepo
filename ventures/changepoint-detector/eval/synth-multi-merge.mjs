// Merge eval/synth-multi-sim.mjs shards: per cell, the share of panels with p <= 0.05 and p <= 0.10 for the
// multi-start covariate fit, the one-start covariate fit and the outcome fit (floored ratio; the paper's ratio at
// 0.05 in brackets), fit-warning shares, mean before RMSPE, and the share of panels where the multi-start treated fit
// is tighter before the date than the one-start fit.
//   node eval/synth-multi-merge.mjs part0.json part1.json ... > eval/synth-multi-confirm.out.txt
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const cells = [...new Set(rows.map((r) => r.cell))];
const pct = (a, f) => (100 * a.filter(f).length / a.length).toFixed(1);
const arms = ['multi', 'single', 'outcome'];
console.log('cell  n   ' + arms.map((a) => `${a} p<=.05 p<=.10 [ratio .05]`).join(' | ') + ' | warn m/s/o | before RMSPE m/s/o | multi tighter');
for (const c of cells) {
  const a = rows.filter((r) => r.cell === c);
  const mean = (arm, k) => (a.reduce((s, r) => s + r[arm][k], 0) / a.length).toFixed(3);
  const cols = arms.map((arm) => `${pct(a, (r) => r[arm].p <= 0.05 + 1e-12).padStart(5)} ${pct(a, (r) => r[arm].p <= 0.10 + 1e-12).padStart(5)} [${pct(a, (r) => r[arm].pr <= 0.05 + 1e-12)}]`);
  console.log(`${c.padEnd(5)} ${String(a.length).padEnd(4)}${cols.join(' | ')} | ${arms.map((arm) => pct(a, (r) => r[arm].warn)).join('/')} | ${arms.map((arm) => mean(arm, 'pre')).join('/')} | ${pct(a, (r) => r.multi.pre < r.single.pre - 1e-9)}%`);
}
