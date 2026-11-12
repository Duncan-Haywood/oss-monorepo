// The update-rate check on long series: grid search against the exact search (update-rate.mjs gridPartition).
//
// Why: the exact search (PELT on the repeat indicators) prunes little when changes are few, so its time
// grows as n^2: 24 s at 20,000 steps, about 50 s on a steady series, before this file. That made the check
// too slow to run beside every model (README "The update-rate check on long series"). Above EXACT_UP_TO
// steps, partitionRates now searches cut positions on a grid of about EXACT_UP_TO points and then moves each
// cut to its best position between its neighbours.
//
// Written 2026-11-12 and committed with the grid code before this file ran. Rule (all must hold, or the grid
// does not ship and the check is skipped above EXACT_UP_TO steps instead):
//   G1. every cell: grid and exact report the same number of changes in >= 18 of 20 series;
//   G2. where the counts match, every grid change lies inside the exact change's date range (cutRanges,
//       the shipped slack) in >= 95% of matched changes, pooled over cells.
// Cells, 20 series each, n in {4000, 8000} steps, the chains of eval/update-rate-sim.mjs:
//   null B25 (independent repeats 0.25), null M40 (clumped, share 0.40);
//   S1 at n/2 (0.10 -> 0.60), S4 at n/2 (clumped stale feed -> 0.05), D (0.10 -> 0.60 at n/3, back at 2n/3).
// Seed 20261210. Timing is reported, not judged.
// usage: node eval/update-rate-long.mjs > eval/update-rate-long.out.txt
import { partitionRates, cutRanges, UPDATE_RATE, EXACT_UP_TO } from '../update-rate.mjs';
import { chain, makeRng } from './update-rate-sim.mjs';

const CELLS = {
  'null B25': (rnd, n) => chain(rnd, n, [0.25, 0.25]),
  'null M40': (rnd, n) => chain(rnd, n, [0.7, 0.2]),
  S1: (rnd, n) => chain(rnd, n, [0.1, 0.1], [0.6, 0.6], n / 2),
  S4: (rnd, n) => chain(rnd, n, [0.7, 0.2], [0.05, 0.05], n / 2),
  D: (rnd, n) => [...chain(rnd, Math.round(n / 3), [0.1, 0.1]), ...chain(rnd, Math.round(n / 3), [0.6, 0.6]), ...chain(rnd, n - 2 * Math.round(n / 3), [0.1, 0.1])],
};

const rnd = makeRng(20261210);
const lines = [`EXACT_UP_TO ${EXACT_UP_TO}; setting ${JSON.stringify(UPDATE_RATE)}; seed 20261210`, ''];
let g1 = true, matched = 0, inside = 0, tExact = 0, tGrid = 0;
for (const n of [4000, 8000]) for (const [cell, gen] of Object.entries(CELLS)) {
  let same = 0, cutsE = 0, cutsG = 0, maxOff = 0;
  for (let r = 0; r < 20; r++) {
    const z = gen(rnd, n);
    let t = Date.now();
    const e = partitionRates(z, { ...UPDATE_RATE, exactUpTo: Infinity }).cuts;
    tExact += Date.now() - t; t = Date.now();
    const g = partitionRates(z, UPDATE_RATE).cuts;
    tGrid += Date.now() - t;
    cutsE += e.length; cutsG += g.length;
    if (e.length !== g.length) continue;
    same++;
    const ranges = cutRanges(z, e, UPDATE_RATE);
    e.forEach((c, k) => { matched++; maxOff = Math.max(maxOff, Math.abs(g[k] - c)); if (g[k] >= ranges[k][0] && g[k] <= ranges[k][1]) inside++; });
  }
  if (same < 18) g1 = false;
  lines.push(`n ${n} ${cell.padEnd(9)} same count ${same}/20; changes exact ${cutsE}, grid ${cutsG}; largest date gap where matched ${maxOff} steps`);
}
const g2 = matched ? inside / matched >= 0.95 : true;
lines.push('', `G1 (same count in >= 18 of 20, every cell): ${g1 ? 'pass' : 'FAIL'}`);
lines.push(`G2 (grid change inside the exact change's range): ${inside} of ${matched} (${matched ? ((100 * inside) / matched).toFixed(1) : '-'}%), ${g2 ? 'pass' : 'FAIL'}`);
lines.push(`Verdict: ${g1 && g2 ? 'the grid ships' : 'the grid does not ship'}`);
lines.push('', `Time (not judged): exact ${(tExact / 1000).toFixed(1)} s, grid ${(tGrid / 1000).toFixed(1)} s over 200 series`);
console.log(lines.join('\n'));
