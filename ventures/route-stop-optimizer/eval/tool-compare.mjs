// What the CVRPTW engine adds inside the tool: random service days (stops in a
// 25 x 20 mile box around the sample depot, 10-40 service minutes, a third
// with a 2-4 h window), planned by the old heuristic alone (noVrptw) and by
// the tool as shipped. Score = the tool's own objective: total elapsed minutes
// (drive + wait + service) + 2 x the longest route, lateness x 1000.
// Run: node eval/tool-compare.mjs [--days 20]
import { solvePlan, buildMatrices, evaluateRoute, parsePoint, sampleDepot } from "../calc.mjs";
import { rng } from "../vrptw.mjs";

const days = Number(process.argv[process.argv.indexOf("--days") + 1] || 20);
const shapes = [[25, 1], [40, 2], [60, 3], [100, 5], [150, 8]];
console.log("stops drivers days  old score  new score  better  mean cut  late days old/new  old ms  new ms");
for (const [n, k] of shapes) {
  let better = 0, cut = 0, so = 0, sn = 0, to = 0, tn = 0, lo = 0, ln = 0;
  for (let d = 0; d < days; d++) {
    const r = rng(1000 * n + d + 1);
    const depot = parsePoint(sampleDepot);
    const stops = Array.from({ length: n }, (_, i) => {
      const w = r() < 1 / 3;
      const open = w ? 480 + Math.floor(r() * 360) : null;
      return { name: `S${i}`, lat: depot.lat - 0.15 + r() * 0.3, lng: depot.lng - 0.24 + r() * 0.48, service: 10 + Math.floor(r() * 31), open, close: w ? open + 120 + Math.floor(r() * 121) : null, load: 0 };
    });
    const nodes = [depot, ...stops];
    const ctx = { nodes, ...buildMatrices(nodes, 1.3, 30), start: 480, back: true };
    const ids = stops.map((_, i) => i + 1);
    const late = (routes) => routes.some((x) => evaluateRoute(x, ctx).late > 0) ? 1 : 0;
    const score = (routes) => {
      const e = routes.map((x) => { const v = evaluateRoute(x, ctx); return v.elapsed + 1000 * v.late; });
      return e.reduce((a, b) => a + b, 0) + 2 * Math.max(...e);
    };
    let t = performance.now();
    const pa = solvePlan(ids, ctx, k, { noVrptw: true }).routes; to += performance.now() - t;
    t = performance.now();
    const pb = solvePlan(ids, ctx, k).routes; tn += performance.now() - t;
    const a = score(pa), b = score(pb);
    lo += late(pa); ln += late(pb);
    if (b < a - 1e-6) better++;
    cut += (a - b) / a; so += a; sn += b;
  }
  console.log(`${String(n).padStart(5)} ${String(k).padStart(7)} ${String(days).padStart(4)} ${(so / days).toFixed(0).padStart(10)} ${(sn / days).toFixed(0).padStart(10)} ${String(better).padStart(7)} ${((cut / days) * 100).toFixed(2).padStart(8)}% ${(lo + "/" + ln).padStart(18)} ${(to / days).toFixed(0).padStart(7)} ${(tn / days).toFixed(0).padStart(7)}`);
}
