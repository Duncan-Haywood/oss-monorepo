// Merge eval/synth-two-shock-sim.mjs shards. Per cell: rank 1 share (p = 1/units), rank <= 2 and <= 3, the plain
// ratio's rank 1, the mean signed effect and its mean absolute error against the truth (effect0), the shocked donors'
// summed weight in the treated fit, rank 1 and the effect's mean absolute error with the first shocked donor left out
// beforehand (excl1) and with all of them (exclAll), and, of panels not at rank 1, how often at least one shocked donor
// is among the units ranked at or above the treated one (and, with two, both).
//   node eval/synth-two-shock-merge.mjs part*.json > eval/synth-two-shock-confirm.out.txt
import { readFileSync } from 'node:fs';
import { CELLS } from './synth-two-shock-sim.mjs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const pct = (a, f) => (a.length ? (100 * a.filter(f).length / a.length).toFixed(1) : '-');
const mean = (a, f) => (a.length ? (a.reduce((s, r) => s + f(r), 0) / a.length).toFixed(3) : '-');
console.log('cell   n    1/units | rank1  rank<=2  rank<=3 | rank1 ratio | mean effect  abs err | shocked weight | excl1: rank1, abs err | exclAll: rank1, abs err | not rank 1: one above, both above');
for (const c of Object.keys(CELLS).filter((c) => rows.some((r) => r.cell === c))) {
  const a = rows.filter((r) => r.cell === c), e0 = CELLS[c].effect0, two = CELLS[c].shocks === 2;
  const miss = a.filter((r) => r.rank > 1);
  console.log(`${c.padEnd(6)} ${String(a.length).padEnd(4)} ${(100 / a[0].units).toFixed(1).padStart(6)}% | ${pct(a, (r) => r.rank === 1).padStart(5)}%  ${pct(a, (r) => r.rank <= 2).padStart(6)}%  ${pct(a, (r) => r.rank <= 3).padStart(6)}% | ${pct(a, (r) => r.rankRatio === 1).padStart(10)}% | ${mean(a, (r) => r.effect).padStart(11)}  ${mean(a, (r) => Math.abs(r.effect - e0)).padStart(7)} | ${mean(a, (r) => r.shockedWeight).padStart(14)} | ${pct(a, (r) => r.rankExcl1 === 1).padStart(12)}%, ${mean(a, (r) => Math.abs(r.effectExcl1 - e0))} | ${pct(a, (r) => r.rankExclAll === 1).padStart(14)}%, ${mean(a, (r) => Math.abs(r.effectExclAll - e0))} | ${pct(miss, (r) => r.shockedAbove >= 1).padStart(19)}%, ${two ? pct(miss, (r) => r.shockedAbove >= 2) + '%' : '-'}`);
}
