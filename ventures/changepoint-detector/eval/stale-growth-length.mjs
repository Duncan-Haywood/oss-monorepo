// Post hoc, deciding nothing (README "A catch-up test for multi-tick feeds", read afterwards): the
// pre-registered growth test failed R2 (22 of 85 carried 300-step windows called stale). How long must a
// stretch be before it is caught? Same test, same Europe series, non-overlapping windows of 300 to 4000
// steps (every window), carried share >= 0.30 for the grid series, and the prints for size.
// usage: node eval/stale-growth-length.mjs <dir> > eval/stale-growth-length.out.txt
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catchUpGrowth, smallestStep } from '../update-rate.mjs';
import { readTrades, sampleEvery, tradePrints } from './stale-real-trades.mjs';

const dir = process.argv[2] || 'hf-data';
const [[, trades]] = readTrades(readFileSync(join(dir, 'sampleTDataEurope.csv'), 'utf8'));
console.log('# growth test by window length, Europe (post hoc)\n\nseries  window  windows (carried >= 0.30, or prints)  called stale  share  median moves a window');
for (const [label, s] of [['D=1', sampleEvery(trades, 1)], ['D=2', sampleEvery(trades, 2)], ['prints', tradePrints(trades)]]) {
  const tick = smallestStep(s.v);
  for (const L of [300, 600, 1000, 2000, 4000]) {
    let n = 0, k = 0; const moves = [];
    for (let from = 0; from + L < s.v.length; from += L) {
      let carried = 0;
      for (let t = from + 1; t <= from + L; t++) if (!s.traded[t]) carried++;
      if (label !== 'prints' && carried / L < 0.3) continue;
      const g = catchUpGrowth(s.v, from, from + L, tick);
      n++; if (g?.grows) k++; moves.push(g?.n ?? 0);
    }
    moves.sort((a, b) => a - b);
    console.log(`${label}  ${L}  ${n}  ${k}  ${n ? (k / n).toFixed(2) : '-'}  ${moves[moves.length >> 1] ?? '-'}`);
  }
}
