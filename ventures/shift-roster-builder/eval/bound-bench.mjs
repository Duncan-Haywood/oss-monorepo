// Measures the exact search's bounds: root gap on the sample week, and how many of 30 seeded random weeks are proven within a node limit.
//   node eval/bound-bench.mjs [flowBalance=0|1]
import { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } from "../calc.mjs";

const flowBalance = process.argv[2] !== "0";
const base = { exact: true, flowBalance };
const t0 = Date.now();
const s = buildRoster(parseStaff(sampleStaff()).staff, parseShifts(sampleShifts()).slots, { ...base, exactNodes: 40000, exactMs: 4000 });
console.log(`sample week: score ${s.score.toFixed(2)} root bound ${s.optimality.lowerBound.toFixed(2)} gap ${(s.score - s.optimality.lowerBound).toFixed(2)} (${s.optimality.status}, ${s.optimality.nodes} nodes)`);

let seed = 20261021;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
let proven = 0, nodes = 0, n = 0, gaps = 0;
for (let c = 0; c < 30; c++) {
  const P = 4 + rnd(3), S = 12 + rnd(3);
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const r = buildRoster(parseStaff(st).staff, parseShifts(sh).slots, { ...base, balance: 60, exactNodes: 100000, exactMs: 20000, restarts: 2, iterations: 2000 });
  n++; nodes += r.optimality.nodes;
  if (r.optimality.status !== "bounded") proven++; else gaps += r.score - r.optimality.lowerBound;
}
console.log(`random weeks: proven ${proven}/${n}, nodes ${nodes}, summed open gap on unproven ${gaps.toFixed(1)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
