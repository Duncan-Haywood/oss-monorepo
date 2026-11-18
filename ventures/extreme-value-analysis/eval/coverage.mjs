// Interval coverage by simulation: how often does the 95% interval for the 100-year level
// contain the true value? Seeded, so the numbers in README.md reproduce exactly.
//   node eval/coverage.mjs [reps]
import { fitGev, gevReturnLevels, gevQuantileUpper } from "../engine.mjs";

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gevDraw = (u, mu, sigma, xi) => (Math.abs(xi) < 1e-9 ? mu - sigma * Math.log(-Math.log(u)) : mu + (sigma / xi) * (Math.pow(-Math.log(u), -xi) - 1));

const reps = Number(process.argv[2] || 400);
const T = 100;
const rows = [];
for (const [n, xi] of [[30, 0.1], [60, 0.1], [60, -0.2], [100, 0.2]]) {
  const rnd = mulberry32(1000 * n + Math.round(100 * xi) + 7);
  const truth = gevQuantileUpper(1 / T, 0, 1, xi);
  let delta = 0, prof = 0, profOpen = 0, fails = 0;
  for (let r = 0; r < reps; r++) {
    const x = Array.from({ length: n }, () => gevDraw(rnd(), 0, 1, xi));
    try {
      const fit = fitGev(x);
      const [row] = gevReturnLevels(x, fit, [T], { profile: true });
      if (row.delta.lower <= truth && truth <= row.delta.upper) delta++;
      const lo = row.profile.lower, hi = row.profile.upper;
      if (hi === null) profOpen++;
      if (lo !== null && lo <= truth && (hi === null || truth <= hi)) prof++;
    } catch { fails++; }
  }
  rows.push({ n, xi, reps, truth: +truth.toFixed(4), deltaCoverage: delta / reps, profileCoverage: prof / reps, profileUpperOpen: profOpen, fails });
}
console.log(JSON.stringify(rows, null, 1));
