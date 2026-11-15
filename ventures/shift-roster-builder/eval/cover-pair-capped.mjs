// How many of the pairs the second-call-out check gives up on are really clashing? (2026-11-15, README "Fewer capped pairs")
// For three seeded weeks' --cover-price rosters, coverPairRisk at its 500-step budget and at BIG steps (default 200,000):
// pairs given up on at each, how the given-up ones resolve with the larger budget ("chain" = coverable, "false" = clashing),
// and the pair hours each count carries. Invented weeks; the builds are time-bound, so rosters can differ run to run.
//   node eval/cover-pair-capped.mjs     BIG=200000
import { parseStaff, parseShifts, buildRoster, buildContext, coverRisk, coverPairRisk } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";
const BASE = { minRestHours: 10 };
const big = Number(process.env.BIG ?? 200000);
for (const [P, S, w] of [[20, 56, 2], [40, 112, 2], [40, 112, 0]]) {
  const { staff: st, shifts: sh } = seededWeeks(P, S, w + 1)[w];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const r = buildRoster(staff, slots, { ...BASE, coverPrice: 25 });
  const ctx = buildContext(staff, slots, BASE);
  const one = coverRisk(ctx, r.owner);
  let t = performance.now();
  const a = coverPairRisk(ctx, r.owner, { single: one, keep: true });
  const ta = performance.now() - t; t = performance.now();
  const b = coverPairRisk(ctx, r.owner, { single: one, keep: true, budget: big });
  const tb = performance.now() - t;
  const tally = {};
  a.checked.forEach((c, k) => { if (c.how === null) { const v = String(b.checked[k].how); tally[v] = (tally[v] || 0) + 1; } });
  console.log(`${P}x${S} w${w}: pairs ${a.pairs}, capped@500 ${a.capped} (${ta.toFixed(0)} ms), capped@${big} ${b.capped} (${tb.toFixed(0)} ms); capped@500 resolve as`, tally, `clashing hours ${a.hours} -> ${b.hours}`);
}
