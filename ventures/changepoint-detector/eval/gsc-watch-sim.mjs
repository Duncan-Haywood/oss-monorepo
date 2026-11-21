// How fast does the daily watch hear a lasting fall in Search Console clicks, and how often does it cry wolf?
// Simulated sites (not real Search Console data): 240 days, a weekly cycle (weekends at 70%), day-to-day swings beyond
// Poisson (a gamma multiplier, cv 15%), base 50, 400 or 3000 clicks a day; a fall of 10%, 20% or 40% on day 180, or
// none. The watch runs as a deployer's workflow does on a count column it names nothing for (watch-core replayWatch,
// model poisson, its count defaults), one check per day from day 120. A fall is heard when an alert dated within 7 days
// of day 180 arrives; delay = report day - 180. False alerts: every alert on a no-fall series, and every alert
// reported before day 180 on the others, per 1,000 days watched.
//   node eval/gsc-watch-sim.mjs [seeds per cell, default 20] > eval/gsc-watch-sim.out.txt
//   node eval/gsc-watch-sim.mjs 20 pelt > eval/gsc-watch-sim-eager.out.txt   (the page's Eager setting for counts)
import { replayWatch } from '../watch-core.mjs';

const SEEDS = Number(process.argv[2] ?? 20);
const DETECTOR = process.argv[3] ?? null; // null: the count default (Quiet)
const N = 240, AT = 180, FROM = 120;
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
function gamma(u, k) { // Marsaglia-Tsang, k >= 1
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { const a = u(), b = u(); x = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v; }
}
function pois(u, l) {
  if (l > 500) { const a = u(), b = u(); return Math.max(0, Math.round(l + Math.sqrt(l) * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b))); }
  let k = 0, p = Math.exp(-l), c = p; const x = u(); while (x > c) { k++; p *= l / k; c += p; } return k;
}
const labels = Array.from({ length: N }, (_, i) => new Date(Date.parse('2025-09-01T00:00:00Z') + i * 864e5).toISOString().slice(0, 10));
function series(seed, base, fall) {
  const u = lcg(seed * 7919 + Math.round(base) + Math.round(fall * 1000)), k = 1 / 0.15 ** 2;
  return labels.map((d, i) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return pois(u, base * (w === 0 || w === 6 ? 0.7 : 1) * (i >= AT ? 1 - fall : 1) * gamma(u, k) / k); });
}
console.log(`seeds per cell ${SEEDS}; days ${N}; fall on day ${AT}; watched from day ${FROM}; detector ${DETECTOR ?? 'count default (Quiet)'}`);
console.log('base  fall  heard  median delay (days)  false alerts / 1,000 days watched');
for (const base of [50, 400, 3000]) for (const fall of [0, 0.1, 0.2, 0.4]) {
  let heard = 0, falseA = 0, watched = 0; const delays = [];
  for (let s = 1; s <= SEEDS; s++) {
    const r = replayWatch(series(s, base, fall), labels, { model: 'poisson', ...(DETECTOR ? { detector: DETECTOR } : {}), from: FROM, step: 1, budget: Infinity });
    let got = null;
    for (const a of r.alerts) {
      const idx = labels.indexOf(String(a.label));
      if (fall && Math.abs(idx - AT) <= 7 && a.reportedAt >= AT) { if (got == null) got = a.reportedAt - AT; }
      else if (!fall || a.reportedAt < AT) falseA++;
    }
    watched += fall ? AT - FROM : N - FROM;
    if (got != null) { heard++; delays.push(got); }
  }
  delays.sort((a, b) => a - b);
  const med = delays.length ? delays[Math.floor((delays.length - 1) / 2)] : '-';
  console.log(`${String(base).padStart(4)}  ${String(Math.round(fall * 100)).padStart(3)}%  ${fall ? `${heard}/${SEEDS}`.padStart(5) : '    -'}  ${String(med).padStart(20)}  ${(1000 * falseA / watched).toFixed(2).padStart(10)}`);
}
