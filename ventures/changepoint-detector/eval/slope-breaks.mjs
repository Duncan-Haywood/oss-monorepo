// Slope breaks on log US real GDP, 1950Q1-2000Q4 (data/us-real-gdp.csv), and a power check.
// usage: node eval/slope-breaks.mjs
import { readFileSync } from 'node:fs';
import { slopeBreaks, lsKnotDate } from '../slope-breaks.mjs';
import { lineRss } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-real-gdp.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const x = rows.map((r) => Math.log(+r[1])), lab = rows.map((r) => r[0]);
const ls = lsKnotDate(x, 0.15, lineRss);
const r0 = lineRss(x, []);
console.log(`least-squares kink on the levels: ${lab[ls.index]}, BIC-style gain ${(x.length * Math.log(r0 / ls.rss)).toFixed(1)} against a bar of ${(2 * Math.log(x.length)).toFixed(1)}`);
const r = slopeBreaks(x);
console.log(`difference-based sup-Wald (critical ${r.critical}): ${r.knots.length} slope break(s)`);
for (const k of r.knots) console.log(`  ${lab[k.index]}: W ${k.wald.toFixed(1)}, growth ${(k.before * 400).toFixed(2)} to ${(k.after * 400).toFixed(2)} % a year`);
// the statistic at the least-squares date, even when it does not clear the bar
const d = x.slice(1).map((v, i) => v - x[i]);
const j = ls.index; const a = d.slice(0, j), b = d.slice(j);
const mean = (v) => v.reduce((s, t) => s + t, 0) / v.length;
console.log(`growth before/after ${lab[j]}: ${(mean(a) * 400).toFixed(2)} / ${(mean(b) * 400).toFixed(2)} % a year`);
// power: 150 points, growth 1.0% a step, a break to 0.6% at the middle, AR(1) 0.3 noise sd 1% (seeds 1..200)
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const norm = (g) => Math.sqrt(-2 * Math.log(1 - g())) * Math.cos(2 * Math.PI * g());
for (const [n, drop] of [[150, 0.4], [150, 0.8], [204, 0.9]]) {
  let hit = 0, near = 0;
  for (let s = 1; s <= 200; s++) {
    const g = rng(s); let e = 0, v = 0; const y = [0];
    for (let i = 0; i < n - 1; i++) { e = 0.3 * e + norm(g) * Math.sqrt(1 - 0.09); v += 1 + e - (i >= n / 2 ? drop : 0); y.push(v / 100); }
    const kn = slopeBreaks(y, { maxKnots: 1 }).knots;
    if (kn.length) { hit++; if (Math.abs(kn[0].index - n / 2) <= 10) near++; }
  }
  console.log(`n=${n}, growth 1.0 to ${(1 - drop).toFixed(1)} %/step, noise sd 1: break reported ${hit}/200, within 10 points of the true one ${near}/200`);
}
