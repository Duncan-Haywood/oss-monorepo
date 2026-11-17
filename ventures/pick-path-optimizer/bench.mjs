// How far the rules of thumb sit above the exact route, by picks per trip.
// Synthetic: 10 aisles 10 ft apart, 20 four-foot bays, picks uniform over bays,
// 1,000 random pick lists per row, fixed seed. Run: node bench.mjs
import { optimalRoute, sShapeRoute, largestGapRoute, returnRoute } from "./route.mjs";

let s = 12345;
const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const base = { aisleXs: Array.from({ length: 10 }, (_, i) => i * 10), aisleLength: 80, backAisle: true };
const pct = (a) => `+${((100 * a.reduce((x, y) => x + y, 0)) / a.length).toFixed(1)}%`;
for (const [name, depotX] of [["dock in front of aisle 1", 0], ["dock mid-front (between aisles 5 and 6)", 45]]) {
  const layout = { ...base, depotX };
  console.log(`\n${name}\npicks | S-shape | largest gap | return | better of S-shape and largest gap (mean, worst)`);
  for (const n of [1, 2, 3, 5, 10, 20, 40, 80]) {
    const S = [], G = [], R = [], B = [];
    for (let t = 0; t < 1000; t++) {
      const pts = Array.from({ length: n }, () => ({ x: 10 * Math.floor(r() * 10), y: (Math.floor(r() * 20) + 0.5) * 4 }));
      const o = optimalRoute(pts, layout).length;
      const ss = sShapeRoute(pts, layout).length / o - 1;
      const gg = largestGapRoute(pts, layout).length / o - 1;
      S.push(ss); G.push(gg); R.push(returnRoute(pts, layout).length / o - 1); B.push(Math.min(ss, gg));
    }
    console.log(`${String(n).padStart(5)} | ${pct(S).padStart(7)} | ${pct(G).padStart(11)} | ${pct(R).padStart(6)} | ${pct(B)}, +${(100 * Math.max(...B)).toFixed(0)}%`);
  }
}
