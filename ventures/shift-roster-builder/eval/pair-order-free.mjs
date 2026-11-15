// An order-free pair check (2026-11-15, README "An order-free pair check").
//
// "Remembered pair searches" found that the confirmed pair count depends on the order the pair search hands shifts out (179 or
// 187 pair hours on the seeded 20-person week 2, 313 to 355 on the 40-person week 0), so it is not a property of the roster.
// `coverPairRisk(..., { orderFree: true })` answers a question about the covered roster instead (coverGroupsFree). Part 1 walks
// each seeded week's plain roster (seed 1) with the old search and the order-free one, at the screen's 500 checks, at 2,000
// at the old confirm's 200,000 and the order-free confirm's 2,000,000, and in three hand-out orders at the confirm's budget. Part 2 runs the pair-priced pass from that roster
// ($25 an hour at risk, $1 a pair hour, uncapped) with each check, and counts both rosters' pair hours with both checks.
//   node eval/pair-order-free.mjs     WEEKS=20x56:2,40x112:0,40x112:1,60x168:0  PASS=20x56:2,40x112:0,40x112:1
import { parseStaff, parseShifts, buildRoster, buildContext, coverSlackPass, coverPairRisk, coverRisk } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";

const BASE = { minRestHours: 10 };
const load = (w) => {
  const [size, wk] = w.split(":");
  const [P, S] = size.split("x").map(Number);
  const { staff: st, shifts: sh } = seededWeeks(P, S, Number(wk) + 1)[Number(wk)];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, BASE);
  return { size, wk, ctx, slots, start: buildRoster(staff, slots, { ...BASE, seed: 1 }).owner };
};
const ms = (t) => (t < 1000 ? `${t.toFixed(0)} ms` : `${(t / 1000).toFixed(2)} s`);
const walk = (ctx, owner, o) => { const t = performance.now(); const r = coverPairRisk(ctx, owner, o); return { ...r, t: performance.now() - t }; };

console.log("PART 1: walks of each plain roster");
for (const w of (process.env.WEEKS ?? "20x56:2,40x112:0,40x112:1,60x168:0").split(",")) {
  const { size, wk, ctx, start } = load(w);
  const single = coverRisk(ctx, start);
  for (const free of [false, true]) {
    const cells = [500, 2000, 200000, 2000000].map((budget) => {
      const r = walk(ctx, start, { single, budget, orderFree: free });
      return `${budget}: ${r.clashing} clash (${r.capped} given up), ${r.hours} h, ${ms(r.t)}`;
    });
    const orders = (free ? [null, "fewest", "reverse"] : [null, "fewest", "takers"]).map((handOut) => {
      const r = walk(ctx, start, { single, budget: free ? 2000000 : 200000, orderFree: free, handOut });
      return `${handOut || "usual"} ${r.hours} h (${r.capped} given up)`;
    });
    console.log(`${size} week ${wk} ${free ? "order-free" : "old"} (${single.cases.length} risky person-days, pairs of the rest): ${cells.join("; ")}`);
    console.log(`  at ${free ? "2,000,000" : "200,000"} by order: ${orders.join(", ")}`);
  }
}

console.log("PART 2: the pair-priced pass with each check");
for (const w of (process.env.PASS ?? "20x56:2,40x112:0,40x112:1").split(",")) {
  const { size, wk, ctx, slots, start } = load(w);
  const s0 = coverSlackPass(ctx, start, { price: 25, rounds: 0 }).score;
  const runs = {};
  for (const free of [false, true]) {
    const t = performance.now();
    const out = coverSlackPass(ctx, start, { price: 25, pairPrice: 1, pairOrderFree: free, pairConfirm: free ? 2000000 : 200000 });
    runs[free] = { out, t: performance.now() - t };
  }
  console.log(`${size} week ${wk} (${slots.length} copies), start score ${s0.toFixed(2)}`);
  for (const free of [false, true]) {
    const { out, t } = runs[free];
    const oldH = walk(ctx, out.owner, { budget: 200000 }), newH = walk(ctx, out.owner, { budget: 2000000, orderFree: true });
    console.log(`  ${free ? "order-free" : "old"} check: ${out.moves} moves in ${ms(t)}, score +${(out.score - s0).toFixed(2)}, risk ${out.risk.hours} h, reported pair hours ${out.pairHoursBefore} -> ${out.pairHours}; posted roster counted by the old check ${oldH.hours} h (${oldH.capped} given up), by the order-free check ${newH.hours} h (${newH.capped} given up); walks ${out.pairWalks} (${out.pairStops} cut off), pairs searched ${out.pairsSearched}`);
  }
}
