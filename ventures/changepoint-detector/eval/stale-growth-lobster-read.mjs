// Post hoc, deciding nothing (README "The catch-up test by stretch length, on five fresh stocks", read
// afterwards): where the pre-registered round's misses fall. Per stock at M = 1000: power and size; the whole
// day's prints as one stretch (z); and the share of print moves that are an odd number of half-cent ticks
// (a midpoint print), since the tick the files set is 0.005 while the quoted tick is 0.01.
// usage: node eval/stale-growth-lobster-read.mjs <dir> > eval/stale-growth-lobster-read.out.txt
import { readFileSync } from 'node:fs';
import { catchUpGrowth, smallestStep, medianMoveTicks } from '../update-rate.mjs';
import { STOCKS, GRID, fileFor, readPrints, scoreSeries } from './stale-growth-lobster.mjs';
import { sampleEvery } from './stale-real-trades.mjs';

const dir = process.argv[2] || 'lobster-data';
console.log('stock  price (median)  median move (cents)  odd half-cent moves  day prints z  M=1000 power  M=1000 size  M=2000 power  M=2000 size');
const tot = { a: [0, 0], b: [0, 0] };
for (const s of STOCKS) {
  const pr = readPrints(readFileSync(fileFor(dir, s), 'utf8'));
  const v = pr.map((x) => x.p), tick = smallestStep(v);
  let moves = 0, odd = 0;
  for (let i = 1; i < v.length; i++) { const d = Math.round(Math.abs(v[i] - v[i - 1]) / 0.005); if (d) { moves++; if (d % 2) odd++; } }
  const med = medianMoveTicks(v, 1, v.length - 1, 0.01);
  const day = catchUpGrowth(v, 0, v.length - 1, tick);
  const cell = (M) => {
    let pk = 0, pn = 0, sk = 0, sn = 0;
    for (const r of scoreSeries('prints', { v, traded: v.map(() => true) }, tick, M)) { sn++; if (r.stale) sk++; }
    for (const D of GRID) { const g = sampleEvery(pr, D); for (const r of scoreSeries('grid', g, smallestStep(g.v), M)) if (r.carried >= 0.3) { pn++; if (r.stale) pk++; } }
    return [pk, pn, sk, sn];
  };
  const a = cell(1000), b = cell(2000);
  const sorted = [...v].sort((x, y) => x - y);
  console.log(`${s}  ${sorted[sorted.length >> 1].toFixed(2)}  ${med}  ${(odd / moves).toFixed(2)}  ${day.z.toFixed(1)}  ${a[0]} of ${a[1]}  ${a[2]} of ${a[3]}  ${b[0]} of ${b[1]}  ${b[2]} of ${b[3]}`);
}
