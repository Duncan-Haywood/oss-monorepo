// Merge eval/synth-few-power-sim.mjs shards. Per cell: rank 1 share (p at its floor 1/units, the strongest result the
// test can give), rank <= 2 share, the same rank 1 share under the plain ratio and the after-gap alone, how often the
// shocked donor ranks at or above the treated unit, its mean weight in the treated fit, the mean signed effect, the rank 1 share and
// effect with the shocked donor left out of the pool beforehand, and, of panels not at rank 1, how often the shocked
// donor is among the units ranked at or above the treated one.
//   node eval/synth-few-power-merge.mjs part*.json > eval/synth-few-power-confirm.out.txt
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const pct = (a, f) => (a.length ? (100 * a.filter(f).length / a.length).toFixed(1) : '-');
const mean = (a, f) => (a.length ? (a.reduce((s, r) => s + f(r), 0) / a.length).toFixed(3) : '-');
console.log('cell  n    1/units | rank1  rank<=2 | rank1 ratio  rank1 post | shocked >= treated | shocked weight | mean effect | fit warns | excluded: rank1, effect | not rank 1: shocked above');
for (const c of [...new Set(rows.map((r) => r.cell))]) {
  const a = rows.filter((r) => r.cell === c);
  console.log(`${c.padEnd(5)} ${String(a.length).padEnd(4)} ${(100 / a[0].units).toFixed(1).padStart(6)}% | ${pct(a, (r) => r.rank === 1).padStart(5)}%  ${pct(a, (r) => r.rank <= 2).padStart(6)}% | ${pct(a, (r) => r.rankRatio === 1).padStart(10)}%  ${pct(a, (r) => r.rankPost === 1).padStart(9)}% | ${pct(a, (r) => r.shockedAbove).padStart(17)}% | ${mean(a, (r) => r.shockedWeight).padStart(14)} | ${mean(a, (r) => r.effect).padStart(11)} | ${pct(a, (r) => r.fitWarning).padStart(8)}% | ${pct(a, (r) => r.rankExcl === 1).padStart(13)}%, ${mean(a, (r) => r.effectExcl)} | ${pct(a.filter((r) => r.rank > 1), (r) => r.shockedAbove).padStart(10)}%`);
}
