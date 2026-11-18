// Descriptive, run after eval/drift-stale-segment.mjs failed: does the frozen orange-juice price
// update more often after a freeze? The hypothesis behind stale 'segment' was that it does. Share of
// monthly steps that repeat exactly, in the 12 months before each freeze month and the 12 after it.
// usage: node eval/frozen-juice-staleness.mjs > eval/frozen-juice-staleness.out.txt
import { readFileSync } from 'node:fs';
const rows = readFileSync(new URL('../data/frozen-juice.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), price = rows.map((r) => Number(r[1])), fdd = rows.map((r) => Number(r[3]));
const share = (a, b) => { let r = 0, m = 0; for (let t = Math.max(a, 1); t < Math.min(b, price.length); t++) { m++; if (price[t] === price[t - 1]) r++; } return m ? r / m : NaN; };
console.log('freeze    repeats 12 months before   12 months after');
let up = 0, down = 0;
labels.forEach((l, i) => {
  if (fdd[i] < 19) return;
  const b = share(i - 12, i), a = share(i, i + 12);
  if (a < b) down++; else if (a > b) up++;
  console.log(`${l}   ${b.toFixed(2).padStart(10)}   ${a.toFixed(2).padStart(18)}`);
});
console.log(`whole series ${share(1, price.length).toFixed(2)}; freezes followed by fewer repeats: ${down} of 8, by more: ${up}`);
