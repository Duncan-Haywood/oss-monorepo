// The compact clique LP's open-hours floor (calc.mjs cliqueOpenFloor) on the cg-scale-bench weeks (same generator and seed rule
// as eval/end-to-end.mjs and eval/ilp-export.mjs), beside what eval/ilp-check.py (HiGHS) proves for the same weeks.
//   node eval/clique-floor.mjs [P=60] [S=168] [cases=2]
import { parseStaff, parseShifts, buildContext, cliqueOpenFloor } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), cases = Number(process.argv[4] || 2);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, { exact: true });
  const r = cliqueOpenFloor(ctx);
  console.log(`${P} x ${S} week ${c}: ${slots.length} copies, clique LP ${r ? r.lp.toFixed(3) : "failed"} h, dual bound ${r ? r.bound.toFixed(3) : "-"}, ${r?.rows} rows, ${r?.cols} columns, ${r?.pivots} pivots, ${r?.ms} ms`);
}
