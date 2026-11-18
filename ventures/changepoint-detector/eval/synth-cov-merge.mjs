// Merge eval/synth-cov-sim.mjs shards into one table: per cell, the share of panels with p <= 0.05 and p <= 0.10 for
// the covariate fit and the outcome fit (floored ratio; the paper's ratio in brackets), and the fit-warning share.
//   node eval/synth-cov-merge.mjs part0.json part1.json ... > eval/synth-cov-confirm.out.txt
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const cells = [...new Set(rows.map((r) => r.cell))];
const pct = (a, f) => (100 * a.filter(f).length / a.length).toFixed(1);
console.log('cell  n    covariates p<=.05 p<=.10 [ratio .05]  outcome p<=.05 p<=.10 [ratio .05]  warn cov/out  mean effect cov/out  before RMSPE cov/out');
for (const c of cells) {
  const a = rows.filter((r) => r.cell === c);
  const mean = (k) => (a.reduce((s, r) => s + r[k], 0) / a.length).toFixed(3);
  console.log(`${c.padEnd(5)} ${String(a.length).padEnd(4)} ${pct(a, (r) => r.pCov <= 0.05 + 1e-12).padStart(6)} ${pct(a, (r) => r.pCov <= 0.10 + 1e-12).padStart(6)} [${pct(a, (r) => r.pCovRatio <= 0.05 + 1e-12)}]        ${pct(a, (r) => r.pOut <= 0.05 + 1e-12).padStart(6)} ${pct(a, (r) => r.pOut <= 0.10 + 1e-12).padStart(6)} [${pct(a, (r) => r.pOutRatio <= 0.05 + 1e-12)}]      ${pct(a, (r) => r.warnCov)}/${pct(a, (r) => r.warnOut)}  ${mean('effCov')}/${mean('effOut')}  ${mean('preCov')}/${mean('preOut')}`);
}
