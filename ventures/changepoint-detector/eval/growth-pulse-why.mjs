// After the fact (not pre-registered): why round 8's P failed. For each test shop (seed 20261127, same draw as
// eval/growth-pulse-sim.mjs), the largest |Z| P computed in the climb's 8-week window (weeks whose Sunday falls from
// the climb's first day to 56 days after), against the largest |Z| over the whole checked year on unchanged shops.
// Also P with no threshold limit on the real UCI shop. Output: eval/growth-pulse-why.out.txt
import { readFileSync } from 'node:fs';
import { generator, growthPulse } from './growth-pulse-sim.mjs';
import { weekly } from './slow-climb-sim.mjs';
import { parseSeries } from '../parse-series.mjs';
import { weeklyTotals } from '../watch-core.mjs';
const N = 371;
const labels = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
const day = (l) => Date.parse(l + 'T00:00:00Z') / 864e5;
const shop = generator(20261127);
const maxZ = { N: [], R30: [], R90: [] };
for (const [g, size] of [['N', null], ['R30', 1.3], ['R90', 1.9]]) for (let i = 0; i < 150; i++) {
  const { v, a } = shop(size);
  const { W, WL, end } = weekly(v, labels);
  const { zs } = growthPulse(W, WL, end, { c: Infinity });
  if (a === null) { maxZ.N.push(Math.max(...zs)); continue; }
  const A = day(labels[a]);
  const inWin = zs.filter((_, j) => { const s = day(end[24 + j]); return s >= A && s <= A + 56; });
  maxZ[g].push(Math.max(0, ...inWin));
}
const q = (x, p) => { const y = [...x].sort((a, b) => a - b); return y[Math.min(y.length - 1, Math.floor(p * y.length))]; };
console.log('Largest |Z| over the checked year, unchanged shops: median %s, 90th %s, 99th %s', ...[0.5, 0.9, 0.99].map((p) => q(maxZ.N, p).toFixed(2)));
for (const g of ['R30', 'R90']) console.log(`${g}: largest |Z| in the 8-week window: median ${q(maxZ[g], 0.5).toFixed(2)}; shops reaching 3 / 4 / 6: ${[3, 4, 6].map((c) => maxZ[g].filter((z) => z >= c).length).join(' / ')} of 150`);
console.log('Unchanged shops whose year-long largest |Z| reaches 3 / 4 / 6: %s of 150', [3, 4, 6].map((c) => maxZ.N.filter((z) => z >= c).length).join(' / '));
for (const f of ['online-retail-daily.csv', 'online-retail-2009-daily.csv']) {
  const s = parseSeries(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'), 'revenue', null);
  const w = weeklyTotals(s.values, s.labels);
  const end = w.labels.map((l) => new Date(Date.parse(l) + 6 * 864e5).toISOString().slice(0, 10));
  for (const c of [6, 4]) {
    const r = growthPulse(w.values, w.labels, end, { c });
    console.log(`${f}, ${w.weeks} weeks, c ${c}: ${r.alerts.length ? r.alerts.map((x) => `dated ${x.label}, sent ${x.reportedAtLabel} (|Z| ${x.z.toFixed(2)}, k ${x.k})`).join('; ') : 'no alert'}`);
  }
}
