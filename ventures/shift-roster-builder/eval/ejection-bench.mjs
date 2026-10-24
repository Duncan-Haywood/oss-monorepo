// Open hours left by the heuristic roster on seeded weeks, with ejection chains (the default) and without, against the exact coverage floor.
//   node eval/ejection-bench.mjs [cases=8] [people=8] [shifts=22]
// Same week generator as scale-bench.mjs. "floor" is the coverage pass's proven minimum when it finishes, else the root bound.
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";

const cases = Number(process.argv[2] || 8), P = Number(process.argv[3] || 8), S = Number(process.argv[4] || 22);
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
let seed = 20261022 + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const sum = { open: 0, floor: 0 };
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const r = buildRoster(parseStaff(st).staff, parseShifts(sh).slots, { exact: true, exactNodes: 30000, exactMs: 20000 });
  const open = r.unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0);
  sum.open += open; sum.floor += r.optimality.forcedOpenHours;
  console.log(`case ${c}: open ${open} h, proven floor ${r.optimality.forcedOpenHours} h, ${r.optimality.status}`);
}
console.log(`${P} people x ${S} shifts, ${cases} cases: open ${sum.open} h in all, floor ${sum.floor} h`);
