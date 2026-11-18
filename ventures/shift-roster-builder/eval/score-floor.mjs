// The priced clique LP's score floor (calc.mjs cliqueScoreFloor) beside the open-hours clique floor, on the cg-scale-bench weeks
// (same generator and seed rule as eval/end-to-end.mjs and eval/clique-floor.mjs).
//   node eval/score-floor.mjs [P=60] [S=168] [cases=2]
import { parseStaff, parseShifts, buildContext, cliqueOpenFloor, cliqueScoreFloor } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), cases = Number(process.argv[4] || 2);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, { exact: true });
  const a = cliqueOpenFloor(ctx);
  const b = cliqueScoreFloor(ctx);
  const fmt = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  console.log(`${P} x ${S} week ${c}: ${slots.length} copies; open-hours LP ${a ? a.bound.toFixed(3) : "failed"} h in ${a?.ms} ms; ` +
    `score floor ${b ? fmt(b.bound) : "failed"} (LP open ${b?.open?.toFixed(3)} h, pay and penalties above 100,000 x open ${b ? fmt(b.bound - 1e5 * b.open) : "-"}), ` +
    `${b?.rows} rows, ${b?.cols} columns, ${b?.pivots} pivots, ${b?.ms} ms`);
}
