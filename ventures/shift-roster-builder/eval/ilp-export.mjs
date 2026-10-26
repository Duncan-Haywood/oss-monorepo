// Dump seeded weeks (same generator as scale-bench.mjs) with the engine's open hours, for eval/ilp-check.py.
//   node eval/ilp-export.mjs P S [cases=4] > weeks.json
import { parseStaff, parseShifts, buildContext, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 8), S = Number(process.argv[3] || 22), cases = Number(process.argv[4] || 4);
let seed = 20261022 + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const out = [];
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, { exact: true });
  const r = buildRoster(staff, slots, { exact: true, flowBalance: true, balance: 60, exactNodes: 100000, exactMs: 20000, restarts: 2, iterations: 2000, reducedCostFixing: true, coverBranch: !process.env.NOCB, coverBranchNodes: Number(process.env.CBN || 60), coverBranchMs: Number(process.env.CBMS || 4000) });
  const engineOpen = r.unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0);
  out.push({ slots: ctx.slots.map((s) => [s.start, s.end]), elig: ctx.elig, maxH: ctx.staff.map((p) => p.maxHours), rest: ctx.restMin, engineOpen, engineFloor: r.optimality.forcedOpenHours });
}
console.log(JSON.stringify(out));
