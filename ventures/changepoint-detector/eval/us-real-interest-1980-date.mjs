// Which quarter does 1980Q3 (0.30) belong to? The detector's 1980Q4 is the FIRST quarter of the new regime. Literature
// dates (Garcia and Perron 1996, cited from memory, unread) may use the LAST quarter of the old regime; if so 1980Q3 and
// 1980Q4 are the same break. This compares the segment means and the sum of squares for a break after Q2, Q3 and Q4.
// usage: node eval/us-real-interest-1980-date.mjs
import { readFileSync } from 'node:fs';
const rows = readFileSync(new URL('../data/us-real-interest.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const lo = labels.indexOf('1973Q4'), hi = labels.indexOf('1986Q1'); // the 1973-1986 stretch between the two steps
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sse = (a) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0); };
console.log(`1980Q3 value ${values[labels.indexOf('1980Q3')]}`);
for (const last of ['1980Q2', '1980Q3', '1980Q4']) {
  const k = labels.indexOf(last) + 1; // first quarter of the new regime
  const a = values.slice(lo, k), b = values.slice(k, hi);
  console.log(`break after ${last} (new regime starts ${labels[k]}): before mean ${mean(a).toFixed(2)}, after mean ${mean(b).toFixed(2)}, SSE ${(sse(a) + sse(b)).toFixed(1)}`);
}
