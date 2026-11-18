// Ramp grouping under sticky (AR(1)) noise. 2026-11-08. Synthetic, not real data.
// n = 300, AR(1) noise with unit marginal sd, rho 0 / 0.5, seeds 1..40 per cell.
// Truth: a linear ramp of height H over L points at t0 = 120, or no change at all (null).
// Reports the share of series with >= 1 reported ramp, for plain analyze and for analyze with ar1: true.
import { analyze } from '../engine.mjs';
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
const n = 300, t0 = 120, SEEDS = 40;
function make(kind, H, L, rho, seed) {
  const r = rng(seed), x = []; let e = gauss(r);
  for (let i = 0; i < n; i++) {
    e = rho * e + Math.sqrt(1 - rho * rho) * gauss(r);
    const m = kind === 'null' ? 0 : i < t0 ? 0 : i >= t0 + L ? H : H * (i - t0) / L;
    x.push(m + e);
  }
  return x;
}
const rows = [];
const cells = [['null', 0, 0]];
for (const L of [12, 24, 48]) cells.push(['ramp', 8, L]);
for (const rho of [0, 0.5]) for (const [kind, H, L] of cells) {
  const out = { rho, truth: kind === 'null' ? 'no change' : `ramp H${H} L${L}` };
  for (const ar1 of [false, true]) {
    let any = 0, cuts = 0, one = 0;
    for (let s = 1; s <= SEEDS; s++) {
      const r = analyze({ values: make(kind, H, L, rho, s * 7919 + L), ar1 });
      cuts += r.pelt.changepoints.length;
      const rs = r.ramps || [];
      if (rs.length) any++;
      if (rs.length === 1 && rs[0].startIndex <= t0 + L + 3 && rs[0].endIndex >= t0 - 3) one++;
    }
    out[ar1 ? 'ar1' : 'plain'] = `ramp ${any}/${SEEDS}, one on truth ${one}/${SEEDS}, cuts ${(cuts / SEEDS).toFixed(1)}`;
  }
  rows.push(out);
}
console.table(rows);
