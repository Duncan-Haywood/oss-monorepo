// What --second-callout-price costs on bigger weeks (2026-11-14): the priced build with and without it on seeded
// 20-person (56 shifts) and 40-person (112 shifts) weeks, three each: pass time, moves, risk and clashing-pair hours.
//   node eval/cover-pair-cost.mjs     SIZES=20x56,40x112  WEEKS=3  PRICE=25  PAIR=1
import { parseStaff, parseShifts, buildRoster, buildContext, coverRisk, coverPairRisk } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";

const BASE = { minRestHours: 10 };
const price = Number(process.env.PRICE ?? 25), pair = Number(process.env.PAIR ?? 1), n = Number(process.env.WEEKS ?? 3);
for (const size of (process.env.SIZES || "20x56,40x112").split(",")) {
  const [P, S] = size.split("x").map(Number);
  seededWeeks(P, S, n).forEach(({ staff: st, shifts: sh }, w) => {
    const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
    for (const [label, o] of [["priced", { ...BASE, coverPrice: price }], [`pair ${pair}`, { ...BASE, coverPrice: price, coverPairPrice: pair, coverPairPriceSlots: Infinity }]]) {
      const t0 = Date.now();
      const r = buildRoster(staff, slots, o);
      const build = (Date.now() - t0) / 1000;
      const pass = r.timings?.coverSlack ?? null;
      const ctx = buildContext(staff, slots, BASE);
      const one = coverRisk(ctx, r.owner);
      const t1 = performance.now();
      const two = coverPairRisk(ctx, r.owner, { single: one });
      console.log(`${size} week ${w} ${label}: ${slots.length} copies, build ${build.toFixed(1)} s${pass != null ? `, pass ${pass} ms` : ""}, moves ${r.coverSlack?.moves ?? "-"}, score ${r.score.toFixed(2)}, risk ${one.hours} h, clashing pairs ${two.clashing} of ${two.pairs} (${two.hours} h, ${two.capped} capped, walk ${(performance.now() - t1).toFixed(0)} ms)`);
    }
  });
}
