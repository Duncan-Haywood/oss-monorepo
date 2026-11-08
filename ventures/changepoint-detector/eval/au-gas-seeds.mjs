// Does the Australian gas takeoff (1969 knot) clear the slope-break bar for every Monte Carlo seed?
// Usage: node eval/au-gas-seeds.mjs  (prints a table; output saved to eval/au-gas-seeds.out.txt)
import { readFileSync } from 'node:fs';
import { slopeBreakPValue } from '../slope-breaks.mjs';
const rows = readFileSync(new URL('../data/au-gas.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const v = rows.map((r) => +r[1]);
const annual = Array.from({ length: 39 }, (_, y) => v.slice(y * 12, y * 12 + 12).reduce((a, b) => a + b));
for (const reps of [499, 1999]) {
  let clear = 0; const ps = [], bars = [];
  for (let seed = 1; seed <= 20; seed++) {
    const r = slopeBreakPValue(annual, { reps, seed });
    ps.push(r.p); bars.push(r.bar95); if (r.w > r.bar95) clear++;
    if (seed === 1) console.log(`W = ${r.w.toFixed(2)}, rho = ${r.rho.toFixed(3)}`);
  }
  const f = (a) => `${Math.min(...a).toFixed(3)} to ${Math.max(...a).toFixed(3)}`;
  console.log(`reps ${reps}: clears the bar for ${clear}/20 seeds; p ${f(ps)}; bar95 ${f(bars)}`);
}
