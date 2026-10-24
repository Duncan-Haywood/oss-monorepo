// Does pricing shifts on the whole score (priceScoreBound) close the cost gap the flow bound leaves?
//   node eval/dual-bench.mjs [cases=4] [people=8] [shifts=22] [exactNodes=30000] [scoreDual=1]
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";

const [cases, P, S, nodes, dual] = [4, 8, 22, 30000, 1].map((d, i) => Number(process.argv[2 + i] ?? d));
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
let seed = 20261022 + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
let proven = 0, ms = 0;
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const t = Date.now();
  const r = buildRoster(parseStaff(st).staff, parseShifts(sh).slots, { exact: true, flowBalance: true, balance: 60, exactNodes: nodes, exactMs: 20000, restarts: 2, iterations: 2000, scoreDual: dual !== 0, reducedCostFixing: process.env.NOFIX ? false : true });
  const o = r.optimality, dt = Date.now() - t; ms += dt;
  if (o.status !== "bounded") proven++;
  console.log(`case ${c}: ${o.status}, score ${r.score.toFixed(2)}, bound ${o.lowerBound.toFixed(2)}, gap ${o.gap.toFixed(2)}, ${o.nodes} nodes, ${dt} ms`);
}
console.log(`${P} x ${S}, scoreDual ${dual}: proven ${proven}/${cases}, ${(ms / 1000).toFixed(0)} s`);
