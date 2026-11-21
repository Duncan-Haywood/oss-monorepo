// A middle "How eager" setting for over-dispersed daily counts (README "A middle setting for over-dispersed counts").
// The same simulated sites as eval/gsc-watch-sim.mjs (not real Search Console data): 240 days, weekends at 70%, a gamma
// day multiplier (cv 15%) beyond Poisson, base 50/400/3000 clicks a day, a lasting fall of 0/10/20/40% on day 180, the
// watch run each day from day 120. One candidate setting per run, a seed range per run, so tuning and the fresh check
// use disjoint seeds (eval/gsc-middle.prereg.md).
//   node eval/gsc-middle-sweep.mjs '<json watch options>' <first seed> <last seed> [cv]
// Prints one JSON line per cell: { base, fall, seeds, heard, delays, falseA, watched, chance }.
// chance: on the no-fall series, the share of seeds with any alert inside the 15-day window around day 180 that a
// fall's alert would count in, so "heard" can be read against what false alerts alone would give.
import { replayWatch } from '../watch-core.mjs';

const opts = JSON.parse(process.argv[2] ?? '{}');
const S0 = Number(process.argv[3] ?? 1), S1 = Number(process.argv[4] ?? 20), CV = Number(process.argv[5] ?? 0.15);
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
function series(seed, base, fall, cv = 0.15) {
  const u = lcg(seed * 7919 + Math.round(base) + Math.round(fall * 1000) + Math.round(cv * 1e5)), k = 1 / cv ** 2;
  return labels.map((d, i) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return pois(u, base * (w === 0 || w === 6 ? 0.7 : 1) * (i >= AT ? 1 - fall : 1) * gamma(u, k) / k); });
}
for (const base of [50, 400, 3000]) for (const fall of [0, 0.1, 0.2, 0.4]) {
  let heard = 0, falseA = 0, watched = 0, chance = 0; const delays = [];
  for (let s = S0; s <= S1; s++) {
    const r = replayWatch(series(s, base, fall, CV), labels, { model: 'poisson', ...opts, from: FROM, step: 1, budget: Infinity });
    let got = null, inWin = false;
    for (const a of r.alerts) {
      const idx = labels.indexOf(String(a.label));
      if (!fall && Math.abs(idx - AT) <= 7 && a.reportedAt >= AT) inWin = true;
      if (fall && Math.abs(idx - AT) <= 7 && a.reportedAt >= AT) { if (got == null) got = a.reportedAt - AT; }
      else if (!fall || a.reportedAt < AT) falseA++;
    }
    if (inWin) chance++;
    watched += fall ? AT - FROM : N - FROM;
    if (got != null) { heard++; delays.push(got); }
  }
  console.log(JSON.stringify({ base, fall, seeds: S1 - S0 + 1, heard, delays, falseA, watched, chance }));
}
