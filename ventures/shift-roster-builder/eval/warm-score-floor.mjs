// The priced clique LP (calc.mjs cliqueScoreFloor) solved cold, from the slack basis, and warm, from the open-hours clique LP's
// optimal basis (warmBasis), on the cg-scale-bench weeks (same generator and seed rule as eval/score-floor.mjs). Both values are
// dual bounds of the same LP, so they should agree to rounding; the point is the time and pivots.
//   node eval/warm-score-floor.mjs [P=60] [S=168] [cases=2]
import { parseStaff, parseShifts, buildContext, cliqueOpenFloor, cliqueScoreFloor } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), cases = Number(process.argv[4] || 2);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const fmt = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, { exact: true });
  const a = cliqueOpenFloor(ctx);
  const cold = cliqueScoreFloor(ctx);
  const warm = cliqueScoreFloor(ctx, { warm: a?.carry });
  console.log(`${P} x ${S} week ${c}: ${slots.length} copies; open-hours LP ${a?.ms} ms, ${a?.pivots} pivots | ` +
    `cold ${cold ? fmt(cold.bound) : "failed"}, ${cold?.pivots} pivots, ${cold?.ms} ms | ` +
    `warm ${warm ? fmt(warm.bound) : "failed"}${warm?.warm ? "" : " (fell back cold)"}, ${warm?.pivots} pivots, ${warm?.ms} ms | ` +
    `difference ${cold && warm ? (warm.bound - cold.bound).toFixed(4) : "-"}`);
}
