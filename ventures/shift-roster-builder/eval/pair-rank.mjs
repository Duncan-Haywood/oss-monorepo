// Best moves first for the second-call-out price's pass (2026-11-15, README "The pair price's best moves first").
//
// README "A time cap on the pair price" found that on the big weeks the pass's gain comes late: the pass takes the first
// candidate that pays, and its pair walks go to candidates in enumeration order. `pairRank` (coverPairRank) runs every
// candidate of a round through the cheap tests first and walks them largest room first. For each seeded week the plain
// roster is built once (seed 1), then the pass runs from it uncapped with the rank off and on, recording when each move
// lands (the "anytime" curve), and the share of the larger of the two gains each has kept at 2, 5, 10 and 20 s.
// Gains are in the pass's own objective (score + $PRICE x risk hours + $PAIR x pair hours). Invented teams and seeded weeks,
// single runs on one machine; times depend on the machine.
//   node eval/pair-rank.mjs     WEEKS=20x56:2,40x112:0,30x84:0  PRICE=25  PAIR=1  MODES=off,on
import { parseStaff, parseShifts, buildRoster, buildContext, coverSlackPass } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";

const BASE = { minRestHours: 10 };
const price = Number(process.env.PRICE ?? 25), pair = Number(process.env.PAIR ?? 1);
const want = (process.env.WEEKS ?? "20x56:2,40x112:0,30x84:0").split(",");
const modes = (process.env.MODES ?? "off,on").split(",");
const marks = [2, 5, 10, 20];
const J = (score, risk, ph) => score + price * risk + pair * ph;
for (const w of want) {
  const [size, wk] = w.split(":");
  const [P, S] = size.split("x").map(Number);
  const { staff: st, shifts: sh } = seededWeeks(P, S, Number(wk) + 1)[Number(wk)];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, BASE);
  const start = buildRoster(staff, slots, { ...BASE, seed: 1 }).owner;
  const none = coverSlackPass(ctx, start, { price, pairPrice: pair, rounds: 0 });
  const J0 = J(none.score, none.risk.hours, none.pairHours);
  console.log(`WEEK ${size} week ${wk} (${slots.length} copies): starting objective ${J0.toFixed(2)}, risk ${none.risk.hours} h, pair hours ${none.pairHours}`);
  const runs = {};
  for (const m of modes) {
    const curve = [];
    const t0 = performance.now();
    const out = coverSlackPass(ctx, start, { price, pairPrice: pair, pairRank: m === "on", onMove: (x) => curve.push({ ...x, t: performance.now() - t0 }) });
    const t = performance.now() - t0;
    runs[m] = { out, curve, t, gain: J0 - J(out.score, out.risk.hours, out.pairHours) };
  }
  const best = Math.max(...Object.values(runs).map((r) => r.gain));
  for (const m of modes) {
    const { out, curve, t, gain } = runs[m];
    const kept = marks.map((s) => { let g = 0; for (const c of curve) if (c.t <= s * 1000) g = J0 - J(c.score, c.riskHours, c.pairHours); return best > 1e-9 ? (100 * g / best).toFixed(0) + "%" : "n/a"; });
    console.log(`  rank ${m}: ${out.moves} moves in ${(t / 1000).toFixed(1)} s, gain ${gain.toFixed(2)}, score ${out.score.toFixed(2)}, risk ${out.risk.hours} h, pair hours ${out.pairHours}, walks ${out.pairWalks} (${out.pairStops} cut off, ${out.pairSkips} skipped), candidates tried ${out.tried}; kept at ${marks.join("/")} s: ${kept.join(" / ")}`);
    console.log(`    moves at ${curve.map((c) => (c.t / 1000).toFixed(2)).join(", ") || "none"} s`);
  }
}
