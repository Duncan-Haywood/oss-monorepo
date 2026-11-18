// The order a pair search hands out shifts (2026-11-15, README "Remembered pair searches"). For each seeded week's plain
// roster (seed 1), the pair walk at the screen's 500 checks and at the confirming 200,000, with the shifts handed out in the
// usual order (caller A's day, then B's), fewest eligible people first, or fewest people who could take it now first.
//   node eval/pair-order.mjs     WEEKS=20x56:2,40x112:0
import { parseStaff, parseShifts, buildRoster, buildContext, coverPairRisk, coverRisk } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";

const BASE = { minRestHours: 10 };
for (const w of (process.env.WEEKS ?? "20x56:2,40x112:0").split(",")) {
  const [size, wk] = w.split(":");
  const [P, S] = size.split("x").map(Number);
  const { staff: st, shifts: sh } = seededWeeks(P, S, Number(wk) + 1)[Number(wk)];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, BASE);
  const start = buildRoster(staff, slots, { ...BASE, seed: 1 }).owner;
  const single = coverRisk(ctx, start);
  for (const order of [null, "fewest", "takers"]) {
    const t = performance.now();
    const r = coverPairRisk(ctx, start, { single, handOut: order });
    const ms = performance.now() - t;
    const full = coverPairRisk(ctx, start, { single, handOut: order, budget: 200000 });
    console.log(`${size} week ${wk}, order ${order || "usual"}: ${r.pairs} pairs; at 500 checks ${r.clashing} clash (${r.capped} given up), ${r.hours} h, ${ms.toFixed(0)} ms; at 200,000 ${full.clashing} clash (${full.capped} given up), ${full.hours} h`);
  }
}
