// Where does the exact proof break as weeks grow? Seeded random weeks at several sizes, same generator style as bound-bench.mjs.
//   node eval/scale-bench.mjs [cases=8] [exactNodes=100000]
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";

const cases = Number(process.argv[2] || 8), exactNodes = Number(process.argv[3] || 100000);
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
for (const [P, S] of [[6, 14], [8, 18], [8, 22], [10, 22], [10, 28], [12, 30]]) {
  let seed = 20261022 + P * 100 + S;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  let proven = 0, nodes = 0, ms = 0, gaps = 0;
  for (let c = 0; c < cases; c++) {
    const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
    const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
    const t = Date.now();
    const r = buildRoster(parseStaff(st).staff, parseShifts(sh).slots, { exact: true, flowBalance: true, balance: 60, exactNodes, exactMs: 20000, restarts: 2, iterations: 2000 });
    ms += Date.now() - t; nodes += r.optimality.nodes;
    if (r.optimality.status !== "bounded") proven++; else gaps += r.score - r.optimality.lowerBound;
  }
  console.log(`${P} people, ${S} shifts: proven ${proven}/${cases}, nodes ${nodes}, ${(ms / 1000).toFixed(0)} s, open gap on unproven ${gaps.toFixed(1)}`);
}
