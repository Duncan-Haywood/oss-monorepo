// The simulated Search Console sites of eval/gsc-middle-sweep.mjs (not real data): 240 days, weekends at 70%, a gamma
// day multiplier with coefficient of variation cv beyond Poisson, a lasting fall on day 180.
export const N = 240, AT = 180, FROM = 120;
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
function gamma(u, k) { // Marsaglia-Tsang, k >= 1
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { const a = u(), b = u(); x = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v; }
}
function pois(u, l) {
  if (l > 500) { const a = u(), b = u(); return Math.max(0, Math.round(l + Math.sqrt(l) * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b))); }
  let k = 0, p = Math.exp(-l), c = p; const x = u(); while (x > c) { k++; p *= l / k; c += p; } return k;
}
export const labels = Array.from({ length: N }, (_, i) => new Date(Date.parse('2025-09-01T00:00:00Z') + i * 864e5).toISOString().slice(0, 10));
export function series(seed, base, fall, cv = 0.15) {
  const u = lcg(seed * 7919 + Math.round(base) + Math.round(fall * 1000) + Math.round(cv * 1e5)), k = 1 / cv ** 2;
  return labels.map((d, i) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return pois(u, base * (w === 0 || w === 6 ? 0.7 : 1) * (i >= AT ? 1 - fall : 1) * gamma(u, k) / k); });
}
