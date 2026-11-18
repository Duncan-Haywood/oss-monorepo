// The second-call-out price with its pair walks cut off once a move cannot pay (2026-11-15, README "Only the walks a move
// can pass"). For each week the plain roster is built once, then the priced pass (coverSlackPass, $PRICE an hour at risk,
// $PAIR a pair hour, confirm on) runs from it with pairStop: false (every walk run to its end, the earlier behaviour) and on
// (the default now). Running the pass on one fixed roster matters: the big weeks' builds are time-gated, so two buildRoster
// calls can start the pass from different rosters. Reported: pass time, pair walks, walks cut off, confirm walks skipped
// outright, pairs searched, and whether the rosters, scores, moves and pair hours are identical (both cuts are exact).
// Invented teams and seeded weeks, single runs on one machine.
//   node eval/pair-stop.mjs     SIZES=20x56,40x112  WEEKS=3  REPS=1  PRICE=25  PAIR=1  SETS=spare,retail,cafe  OFF=1
import { parseStaff, parseShifts, buildRoster, buildContext, coverSlackPass } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";
import { sets } from "./real-rate-week.mjs";

const BASE = { minRestHours: 10 };
const price = Number(process.env.PRICE ?? 25), pair = Number(process.env.PAIR ?? 1), n = Number(process.env.WEEKS ?? 3);
const weeks = [];
const all = sets();
for (const k of (process.env.SETS ?? "spare,retail,cafe").split(",").filter(Boolean)) weeks.push([k, ...all[k]]);
for (const size of (process.env.SIZES ?? "20x56,40x112").split(",").filter(Boolean)) {
  const [P, S] = size.split("x").map(Number);
  seededWeeks(P, S, n).forEach(({ staff, shifts }, w) => weeks.push([`${size} week ${w}`, staff, shifts]));
}
const fmt = (r, ms) => `${ms.toFixed(0)} ms, ${r.pairWalks} walks, ${r.pairStops} cut off, ${r.pairSkips} skipped, ${r.pairsSearched} pairs searched`;
const reps = Number(process.env.REPS ?? 1);
for (const [label, st, sh] of weeks) {
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, BASE);
  const start = buildRoster(staff, slots, { ...BASE, seed: 1 }).owner;
  const run = (pairStop) => {
    let best = Infinity, r;
    for (let k = 0; k < reps; k++) { const t = performance.now(); r = coverSlackPass(ctx, start, { price, pairPrice: pair, pairStop }); best = Math.min(best, performance.now() - t); }
    return [r, best];
  };
  const [on, tOn] = run(true);
  const t0 = performance.now(); const plain = coverSlackPass(ctx, start, { price }); const tPlain = performance.now() - t0;
  let line = `${label} (${slots.length} copies): moves ${on.moves}, pair hours ${on.pairHoursBefore} -> ${on.pairHours} | no pair price: ${tPlain.toFixed(0)} ms, ${plain.moves} moves | stop on: ${fmt(on, tOn)}`;
  if (process.env.OFF !== "0") {
    const [off, tOff] = run(false);
    const same = off.owner.join() === on.owner.join() && off.score === on.score && off.moves === on.moves && off.pairHours === on.pairHours;
    line += ` | stop off: ${fmt(off, tOff)} | identical: ${same} | ${(tOff / tOn).toFixed(1)}x`;
  }
  console.log(line);
}
