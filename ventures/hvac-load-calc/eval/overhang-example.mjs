// What a uniform eave over every window does to the example ranch (load.mjs EXAMPLE).
// Run: node eval/overhang-example.mjs > eval/overhang-example.txt
import { calculate, EXAMPLE } from '../load.mjs';
const base = calculate(EXAMPLE);
const f = n => Math.round(n).toLocaleString('en-US');
console.log('base', f(base.house.cooling.sensible), 'total', f(base.house.cooling.total), 'tons', base.house.coolingTons.toFixed(2), 'peak', base.house.cooling.peakHour, 'winSolar', f(base.house.cooling.components.windowSolar));
for (const d of [1, 2, 3]) {
  const h = structuredClone(EXAMPLE);
  for (const r of h.rooms) for (const w of r.walls) if (w.windowFt2) Object.assign(w, { overhangFt: d, overhangGapFt: 1, windowHeightFt: 5 });
  const x = calculate(h);
  console.log(`eave ${d}ft`, f(x.house.cooling.sensible), 'total', f(x.house.cooling.total), 'tons', x.house.coolingTons.toFixed(2), 'peak', x.house.cooling.peakHour, 'winSolar', f(x.house.cooling.components.windowSolar));
  if (d === 2) for (const [i, r] of x.rooms.entries()) console.log('  ', r.name, f(base.rooms[i].cooling.sensible), '->', f(r.cooling.sensible), 'peak', base.rooms[i].cooling.peakHour, '->', r.cooling.peakHour);
}
