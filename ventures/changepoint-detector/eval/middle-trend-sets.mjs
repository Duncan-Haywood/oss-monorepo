// Set 3 of eval/middle-trend.mjs (growing, shrinking and wandering sites), copied unchanged so later rounds and
// diagnostics draw the same series for the same seed. Base 400, weekends at 70%, a gamma day multiplier with cv 0.15,
// times a slow trend or a log-mean walk; 240 days on gsc-sites' labels.
import { AT as GAT, labels as GLABELS } from './gsc-sites.mjs';

export const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
export const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
export const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
export const gammaS = (u, k, scale) => { const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = normal(u); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale; } };
export const nb = (u, mean, f) => poisson(u, gammaS(u, mean / (f - 1), f - 1));
export const CELLS3 = [
  { key: 'T1', what: 'grows 30% over 240 days', level: (i) => 1 + 0.3 * i / 240 },
  { key: 'T2', what: 'grows 100% over 240 days', level: (i) => 1 + 1.0 * i / 240 },
  { key: 'T3', what: 'falls 30% over 240 days', level: (i) => 1 - 0.3 * i / 240 },
  { key: 'T4', what: 'log-mean walk, sd 0.01 a day', walk: 0.01 },
  { key: 'T5', what: 'log-mean walk, sd 0.02 a day', walk: 0.02 },
  { key: 'T6', what: 'grows 30% over 240 days, falls 20% on day 180', level: (i) => (1 + 0.3 * i / 240) * (i >= GAT ? 0.8 : 1), fall: true },
];
export function pois3(u, l) {
  if (l > 500) { const a = u(), b = u(); return Math.max(0, Math.round(l + Math.sqrt(l) * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b))); }
  return poisson(u, l);
}
export function series3(c, seed) {
  const u = lcg(seed * 104729 + c.key.charCodeAt(1) * 131), cv = 0.15, k = 1 / cv ** 2;
  let lw = 0;
  return GLABELS.map((d, i) => {
    const w = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (c.walk) lw += c.walk * normal(u);
    const lev = c.walk ? Math.exp(lw) : c.level(i);
    return pois3(u, 400 * (w === 0 || w === 6 ? 0.7 : 1) * lev * gammaS(u, k, 1 / k));
  });
}

// Set 2 of eval/middle-trend.mjs (the eleven cells of the count hint round), copied unchanged.
export const N2 = 240, HIST = 120, AT2 = 180;
export const CELLS2 = [
  { key: 'N1', what: 'Poisson 30', gen: (u, i) => poisson(u, 30) },
  { key: 'N2', what: 'NB 30, var 60', gen: (u, i) => nb(u, 30, 2) },
  { key: 'N3', what: 'Poisson 30, weekends 0.6x', gen: (u, i) => poisson(u, i % 7 >= 5 ? 18 : 30) },
  { key: 'N4', what: 'Poisson 5', gen: (u, i) => poisson(u, 5) },
  { key: 'N5', what: 'NB 30, var 90', gen: (u, i) => nb(u, 30, 3) },
  { key: 'S1', what: '30 -> 15', step: true, gen: (u, i) => poisson(u, i < AT2 ? 30 : 15) },
  { key: 'S2', what: '30 -> 21', step: true, gen: (u, i) => poisson(u, i < AT2 ? 30 : 21) },
  { key: 'S3', what: '30 -> 45', step: true, gen: (u, i) => poisson(u, i < AT2 ? 30 : 45) },
  { key: 'S4', what: '5 -> 2', step: true, gen: (u, i) => poisson(u, i < AT2 ? 5 : 2) },
  { key: 'S5', what: 'NB(2x) 30 -> 18', step: true, gen: (u, i) => nb(u, i < AT2 ? 30 : 18, 2) },
  { key: 'S6', what: 'NB(3x) 30 -> 18', step: true, gen: (u, i) => nb(u, i < AT2 ? 30 : 18, 3) },
];
