// How long does the warm-started pay floor take, and what predicts it? (calc.mjs cliqueScoreFloor from cliqueOpenFloor's basis,
// 2026-11-16). The pay floor's time gate in buildRoster was sized for the cold solve (about 4 s x (copies / 245)^4.5); since
// 2026-11-14 the solve starts warm. This measures, on the cg-scale-bench weeks (same generator and seed rule as
// eval/warm-score-floor.mjs and eval/guide-open.mjs), the open-hours LP's time and pivots and the warm priced LP's, so a gate can
// be fitted to the warm solve. One JSON line per week, for eval/warm-gate-fit.mjs.
//   SEED=<n> node eval/warm-gate.mjs [P=60] [S=168] [weeks=3]
import { parseStaff, parseShifts, buildContext, cliqueOpenFloor, cliqueScoreFloor } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), weeks = Number(process.argv[4] || 3);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
for (let c = 0; c < weeks; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, { exact: true });
  const a = cliqueOpenFloor(ctx);
  const w = a ? cliqueScoreFloor(ctx, { warm: a.carry }) : null;
  console.log(JSON.stringify({ seed: Number(process.env.SEED || 20261022), P, S, week: c, copies: ctx.S, openMs: a?.ms ?? null, openPivots: a?.pivots ?? null,
    openRows: a?.rows ?? null, warm: !!w?.warm, pricedMs: w?.ms ?? null, pricedPivots: w?.pivots ?? null, pricedRows: w?.rows ?? null }));
}
