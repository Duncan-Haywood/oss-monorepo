// Merge eval/synth-donor-shape-sim.mjs shards. Per cell: rank 1 share (p = 1/units), rank <= 2, the plain ratio's
// rank 1, the mean signed gap (average over the after-period) and its mean absolute error against the truth
// (effect0), the gap at the last point and its mean absolute error, the shocked donor's weight, rank 1 and both
// errors with the shocked donor left out beforehand (excl), and, of panels not at rank 1, how often the shocked donor
// is at or above the treated unit, the shape gapShape gives the shocked donor's own gap when it is listed above, and
// how many clean units are listed above in all and how many of them gapShape calls 'faded' or 'grew' (a false shape).
//   node eval/synth-donor-shape-merge.mjs part*.json > eval/synth-donor-shape-confirm.out.txt
import { readFileSync } from 'node:fs';
import { CELLS } from './synth-donor-shape-sim.mjs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const pct = (a, f) => (a.length ? (100 * a.filter(f).length / a.length).toFixed(1) : '-');
const tot = (a, k) => a.reduce((s, r) => s + r[k], 0);
const mean = (a, f) => (a.length ? (a.reduce((s, r) => s + f(r), 0) / a.length).toFixed(3) : '-');
console.log('cell   n    1/units | rank1  rank<=2 | rank1 ratio | mean gap  abs err | end gap  end abs err | shocked weight | excl: rank1, abs err, end abs err | not rank 1: shocked above | shocked donor above: held, grew, faded | clean units above: n, shaped');
for (const c of Object.keys(CELLS).filter((c) => rows.some((r) => r.cell === c))) {
  const a = rows.filter((r) => r.cell === c), e0 = CELLS[c].effect0;
  const miss = a.filter((r) => r.rank > 1);
  console.log(`${c.padEnd(6)} ${String(a.length).padEnd(4)} ${(100 / a[0].units).toFixed(1).padStart(6)}% | ${pct(a, (r) => r.rank === 1).padStart(5)}%  ${pct(a, (r) => r.rank <= 2).padStart(6)}% | ${pct(a, (r) => r.rankRatio === 1).padStart(10)}% | ${mean(a, (r) => r.effect).padStart(8)}  ${mean(a, (r) => Math.abs(r.effect - e0)).padStart(7)} | ${mean(a, (r) => r.effectEnd).padStart(7)}  ${mean(a, (r) => Math.abs(r.effectEnd - e0)).padStart(11)} | ${mean(a, (r) => r.shockedWeight).padStart(14)} | ${pct(a, (r) => r.rankExcl === 1).padStart(10)}%, ${mean(a, (r) => Math.abs(r.effectExcl - e0))}, ${mean(a, (r) => Math.abs(r.effectEndExcl - e0))} | ${pct(miss, (r) => r.shockedAbove).padStart(24)}% | ${['held', 'grew', 'faded'].map((k) => pct(a.filter((r) => r.shockedAbove), (r) => r.shockedShape === k) + '%').join(', ').padStart(38)} | ${tot(a, 'cleanAbove')}, ${tot(a, 'cleanAboveShaped')}`);
}
// Bar 6 of the pre-registration, pooled over both unit counts: the shocked donor's shape when it is listed at or above
// the treated unit, by cell group, and the clean units listed above given any shape, over every cell.
const pool = (re, want) => {
  const a = rows.filter((r) => re.test(r.cell) && r.shockedAbove);
  return `${a.filter((r) => r.shockedShape === want).length} of ${a.length}, ${pct(a, (r) => r.shockedShape === want)}%`;
};
const ca = tot(rows, 'cleanAbove'), cs = tot(rows, 'cleanAboveShaped');
console.log(`\npooled: pulse cells (PP, NP, PBP, PPE) faded ${pool(/^(PP|NP|PBP|PPE)\d/, 'faded')} | step cells (PD, PB) held ${pool(/^(PD|PB)\d/, 'held')} | PSE grew ${pool(/^PSE\d/, 'grew')} | slope 1.0 cells (PS, NS, PBS) grew ${pool(/^(PS|NS|PBS)\d/, 'grew')} | clean units above shaped ${cs} of ${ca}, ${(100 * cs / ca).toFixed(1)}%`);
