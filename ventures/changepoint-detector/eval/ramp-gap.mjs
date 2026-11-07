// Synthetic calibration of the ramp gap rule (ramps.mjs). 2026-11-07. Not real data.
// n = 300, N(0,1) noise, seeds 1..40 per cell. Truth A: a linear rise of height H over L points.
// Truth B: two steps of H/2 each, d points apart (a "staircase", not a ramp).
// Reports, per cell: mean cuts, share of series with >=1 ramp reported, share with exactly one ramp covering the truth span.
import { analyze } from '../engine.mjs';
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
const n = 300, t0 = 120, SEEDS = 40;
function make(kind, H, L, seed) {
  const r = rng(seed), x = [];
  for (let i = 0; i < n; i++) {
    let m = 0;
    if (kind === 'ramp') m = i < t0 ? 0 : i >= t0 + L ? H : H * (i - t0) / L;
    else m = (i >= t0 ? H / 2 : 0) + (i >= t0 + L ? H / 2 : 0);
    x.push(m + gauss(r));
  }
  return x;
}
const rows = [];
for (const kind of ['ramp', 'steps']) for (const H of [4, 8]) for (const L of [6, 12, 24, 48]) {
  let cuts = 0, any = 0, one = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const x = make(kind, H, L, s * 7919 + L);
    const r = analyze({ values: x });
    cuts += r.pelt.changepoints.length;
    const rs = r.ramps || [];
    if (rs.length) any++;
    if (rs.length === 1 && rs[0].startIndex <= t0 + L + 3 && rs[0].endIndex >= t0 - 3) one++;
  }
  rows.push({ kind, H, spanOrGap: L, cutsPerSeries: +(cuts / SEEDS).toFixed(2), anyRamp: `${any}/${SEEDS}`, oneRampOnTruth: `${one}/${SEEDS}` });
}
console.table(rows);
